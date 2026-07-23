"use client";

import { createAuthClient } from "better-auth/react";

// baseURL is inferred from the browser origin when omitted.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
