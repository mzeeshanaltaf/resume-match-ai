"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Whether this user signs in with a password (a `credential` account). Users
 * who only ever used Google have none, so there is no password to change or to
 * confirm a deletion with. `null` while it loads (or if it could not be read).
 */
export function useHasPassword(): boolean | null {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    authClient
      .listAccounts()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setHasPassword(data.some((a) => a.providerId === "credential"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return hasPassword;
}
