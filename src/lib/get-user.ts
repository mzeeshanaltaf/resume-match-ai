import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Returns the current authenticated user's id, or null.
 * Single replacement for Clerk's `const { userId } = await auth()`.
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}
