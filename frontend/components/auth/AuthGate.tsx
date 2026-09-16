"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OnboardingFlow } from "./OnboardingFlow";

async function probeSupabaseReachable(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/auth/v1/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        if (!isSupabaseConfigured) {
          if (mounted) setShowOnboarding(true);
          return;
        }
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error || !data.session) {
          setShowOnboarding(true);
        }
      } catch (_e) {
        if (mounted) setShowOnboarding(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthUnavailable(false);
        setSignInError(null);
        setShowOnboarding(false);
        setOpen(false);
      } else {
        setShowOnboarding(true);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setSignInError(null);
    const reachable = await probeSupabaseReachable();
    if (!reachable) {
      setAuthUnavailable(true);
      setShowOnboarding(false);
      setSignInError(
        "Sign-in is temporarily unavailable. Auth service could not be reached."
      );
      setOpen(true);
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) {
      setSignInError(error.message);
      setShowOnboarding(false);
      setOpen(true);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setOpen(true);
  };

  if (loading) return children as JSX.Element;

  return (
    <>
      {children}
      <OnboardingFlow
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSignIn={signInWithGoogle}
      />
      <Dialog open={open}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {authUnavailable ? "Sign-in unavailable" : "Welcome to Lavoe"}
            </DialogTitle>
            <DialogDescription>
              {authUnavailable
                ? "Lavoe can't reach its auth service right now. The Supabase project may need to be restored — see docs/SUPABASE_RESTORE.md."
                : "You need to be signed in to use Lavoe. Sign in to access uploads and processing."}
            </DialogDescription>
          </DialogHeader>
          {signInError ? (
            <p className="text-sm text-destructive">{signInError}</p>
          ) : null}
          <div className="flex gap-2 justify-end">
            {authUnavailable ? (
              <Button
                variant="outline"
                onClick={async () => {
                  const reachable = await probeSupabaseReachable();
                  if (reachable) {
                    setAuthUnavailable(false);
                    setSignInError(null);
                  } else {
                    setSignInError(
                      "Still unreachable. Recreate the Supabase project and update env vars."
                    );
                  }
                }}
              >
                Retry
              </Button>
            ) : (
              <Button onClick={signInWithGoogle}>Sign in with Google</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
