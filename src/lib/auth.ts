import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { emailOTP, jwt } from "better-auth/plugins";
import { Pool } from "pg";
import { sendOtpEmail } from "@/lib/email";

const googleEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

/**
 * Ask the FastAPI backend to erase everything it holds for this user. Called
 * from `user.deleteUser.beforeDelete`, so ANY failure throws and Better Auth
 * leaves the account untouched (no auth identity without data erasure, and no
 * half-deleted state). The email is required by the backend so the
 * deleted-account hash (the 0-credit rule on re-registration) cannot be skipped.
 */
async function eraseBackendData(user: { id: string; email: string }) {
  const baseUrl = process.env.API_INTERNAL_URL?.replace(/\/$/, "");
  const key = process.env.INTERNAL_API_KEY;
  if (!baseUrl || !key) {
    console.error("Account deletion blocked: API_INTERNAL_URL / INTERNAL_API_KEY not set.");
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Account deletion is temporarily unavailable. Nothing was deleted.",
    });
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/internal/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-Internal-Key": key },
      body: JSON.stringify({ email: user.email }),
      // Erasing storage objects can take a moment, but never hang the request.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    console.error("Account deletion: backend erase call failed:", err);
    throw new APIError("BAD_GATEWAY", {
      message: "Could not reach the data service. Nothing was deleted; please try again.",
    });
  }

  if (!res.ok) {
    console.error(`Account deletion: backend erase returned ${res.status}`);
    throw new APIError("BAD_GATEWAY", {
      message: "Your data could not be erased. Nothing was deleted; please try again.",
    });
  }
}

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    // Create and use Better Auth tables inside the `resume_match` schema.
    options: "-c search_path=resume_match",
  }),
  emailAndPassword: {
    enabled: true,
    // Enforced: sign-up creates the account but issues NO session until the
    // emailed code is entered. Existing accounts with emailVerified = false
    // hit this on their next sign-in and get walked through the same flow.
    requireEmailVerification: true,
  },
  emailVerification: {
    // An unverified sign-in attempt gets a fresh code, so there is always one
    // waiting when the client redirects to /verify-email.
    sendOnSignIn: true,
    // Verifying the code issues the session, so the user lands on the
    // dashboard instead of being bounced back to sign in.
    autoSignInAfterVerification: true,
  },
  // Google is optional at runtime — only wired up when both env vars exist,
  // so the build and email/password login work without them.
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : undefined,
  plugins: [
    // Short-lived EdDSA JWTs (default 15 min) that the browser sends to the
    // FastAPI backend, which verifies them against /api/auth/jwks.
    jwt({
      jwt: {
        // Explicit, so a changed `baseURL` can't silently change what the
        // backend (AUTH_ISSUER / AUTH_AUDIENCE) must accept.
        issuer: process.env.BETTER_AUTH_URL,
        audience: process.env.BETTER_AUTH_URL,
        // Only what the backend reads. The default payload is the whole user
        // row. `email` MUST stay: the backend uses it for the deleted-account
        // check (0 credits on re-registration).
        definePayload: ({ user }) => ({ email: user.email }),
      },
    }),
    emailOTP({
      // Replaces Better Auth's link-based verification email with the OTP
      // sender, so sign-up and unverified sign-in both emit a 6-digit code.
      overrideDefaultEmailVerification: true,
      // Closes the passwordless /sign-in/email-otp path, which would otherwise
      // create nameless, passwordless accounts for unknown emails.
      disableSignUp: true,
      otpLength: 6,
      expiresIn: 600, // 10 minutes — keep in sync with the email copy
      allowedAttempts: 3,
      storeOTP: "hashed", // codes hashed at rest in `verification`
      rateLimit: { window: 60, max: 3 },
      sendVerificationOTP: async ({ email, otp, type }) => {
        // Only the two flows the app actually exposes, so an unused endpoint
        // can't quietly mail users.
        if (type !== "email-verification" && type !== "forget-password") return;
        await sendOtpEmail(email, otp, type);
      },
    }),
  ],
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await eraseBackendData(user);
      },
    },
  },
  // Signup credits are no longer granted here: the FastAPI backend creates the
  // credit account (with the signup bonus) on the user's first authenticated call.
});
