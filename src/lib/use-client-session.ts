"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * `useSession()` that is always "pending" during the first client render.
 *
 * The server renders every session-dependent UI in its pending state (there is no session
 * store on the server). If the session request that another component started finishes
 * before this component hydrates, a plain `useSession()` already has data on its first
 * client render, which differs from the server HTML: React throws a hydration error
 * (#418 in production) and drops to client rendering. That race only appears when
 * hydration is slow (a lazily loaded tab, a slow phone), so it is easy to miss.
 * Waiting for mount makes the first render identical to the server's, always.
 */
export function useClientSession() {
  const session = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? session : { ...session, data: null, isPending: true };
}
