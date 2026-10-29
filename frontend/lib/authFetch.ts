"use client";

import { supabase } from "./supabaseClient";

const GUEST_ID_KEY = "lavoe_guest_id";

function getGuestId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers || {});
  const token = supabase
    ? (await supabase.auth.getSession()).data.session?.access_token
    : undefined;

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    const guestId = getGuestId();
    if (guestId) {
      headers.set("Authorization", `Guest ${guestId}`);
    }
  }
  return fetch(input, { ...init, headers });
}
