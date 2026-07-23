import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { signupCredits } from "@/lib/n8n-credits";

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
    // Email verification / password reset are disabled for now.
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
