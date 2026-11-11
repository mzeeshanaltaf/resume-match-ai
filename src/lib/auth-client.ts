"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient, jwtClient } from "better-auth/client/plugins";

// baseURL is inferred from the browser origin when omitted.
export const authClient = createAuthClient({
  plugins: [
    emailOTPClient(),
    // better-auth 1.6.24 types `jwtClient().getActions` so that it is rejected
    // by `createAuthClient` (and, worse, that rejection erases the typings of
    // every other plugin, e.g. `emailOtp`). Runtime is fine. Cast just this
    // plugin; the token is read through `$fetch` below, which needs no plugin
    // typings. Drop the cast once the library types are fixed.
    jwtClient() as never,
  ],
});

export const { signIn, signUp, useSession, emailOtp } = authClient;

// ─── API token (JWT for the FastAPI backend) ────────────────────────────────

/** Refresh this many seconds before the token actually expires. */
const REFRESH_MARGIN_SECONDS = 60;

let cached: { token: string; exp: number } | null = null;
let inflight: Promise<string | null> | null = null;
// Bumped by clearApiToken() so a fetch that started before sign-out can't
// repopulate the cache with the previous user's token.
let generation = 0;

/** Reads `exp` (seconds since epoch) from a JWT without verifying it. */
function tokenExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    if (typeof exp === "number") return exp;
  } catch {
    // fall through
  }
  // Unreadable expiry: treat as short-lived rather than trusting it for long.
  return Math.floor(Date.now() / 1000) + 5 * 60;
}

function isFresh(entry: { exp: number } | null): boolean {
  return !!entry && entry.exp - REFRESH_MARGIN_SECONDS > Date.now() / 1000;
}

/**
 * A valid Better Auth JWT for the FastAPI backend, or null when signed out.
 * Cached and refreshed shortly before it expires; concurrent callers share one
 * request. Pass `forceRefresh` after the backend rejected the cached token.
 */
export async function getApiToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cached && isFresh(cached)) return cached.token;
  if (inflight) return inflight;

  const startedIn = generation;
  const request = (async () => {
    const { data, error } = await authClient.$fetch<{ token?: string }>("/token", {
      method: "GET",
    });
    const token = data?.token;
    if (error || !token) return null;
    if (startedIn === generation) cached = { token, exp: tokenExpiry(token) };
    return token;
  })();

  inflight = request;
  try {
    return await request;
  } finally {
    if (inflight === request) inflight = null;
  }
}

/** Forget the cached token (sign-out, or the backend said it is invalid). */
export function clearApiToken() {
  generation += 1;
  cached = null;
  inflight = null;
}

/** Sign out and drop the cached API token so the next user never reuses it. */
export async function signOut(...args: Parameters<typeof authClient.signOut>) {
  clearApiToken();
  return authClient.signOut(...args);
}
