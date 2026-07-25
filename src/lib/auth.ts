import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import { signupCredits } from "@/lib/n8n-credits";
import { sendOtpEmail } from "@/lib/email";

const googleEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

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
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Grant signup credits to new users (replaces the Clerk webhook).
          try {
            await signupCredits(user.id);
          } catch (err) {
            console.error("Failed to provision signup credits:", err);
          }
        },
      },
    },
  },
});
