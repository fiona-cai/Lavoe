"use client";

import { useEffect, useState } from "react";
import { OnboardingFlow } from "./OnboardingFlow";

const ONBOARDING_COMPLETE_KEY = "lavoe_onboarding_complete";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const completed =
      window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
    setShowOnboarding(!completed);
    setLoading(false);
  }, []);

  const handleOnboardingComplete = () => {
    window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    setShowOnboarding(false);
  };

  if (loading) return children as JSX.Element;

  return (
    <>
      {children}
      <OnboardingFlow
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
      />
    </>
  );
}
