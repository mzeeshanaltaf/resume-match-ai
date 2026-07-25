import { Resend } from "resend";
import { OTP_SENDER_EMAIL } from "@/lib/otp-sender";

/**
 * Server-only. The Resend API has no CORS support, so this module must never be
 * imported from a "use client" component.
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * dotenv strips surrounding quotes from env values; Coolify/Docker pass the raw
 * string through. A value pasted as RESEND_FROM_EMAIL="App <a@b.c>" therefore
 * reaches production with literal quote characters and Resend rejects it with a
 * 422 validation_error on the `from` field — a failure local dev cannot
 * reproduce. Strip them defensively.
 */
function unquote(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, "$2")
    .trim();
}

const FROM =
  unquote(process.env.RESEND_FROM_EMAIL) || `ResuMatchAI <${OTP_SENDER_EMAIL}>`;

export type OtpEmailType = "email-verification" | "forget-password";

const COPY = {
  "email-verification": {
    subject: "Verify your email",
    heading: "Verify your email",
    intro: "Enter this code to finish setting up your ResuMatchAI account.",
    outro:
      "If you didn't create an account, you can safely ignore this email.",
  },
  "forget-password": {
    subject: "Reset your password",
    heading: "Reset your password",
    intro: "Enter this code to choose a new password.",
    outro:
      "If you didn't request a password reset, you can safely ignore this email — your password won't change.",
  },
} as const;

// Keep in sync with emailOTP({ expiresIn }) in src/lib/auth.ts.
const EXPIRY_MINUTES = 10;

// Absolute URL to the hosted logo. Mail clients cannot fetch localhost, so dev
// sends point at the production origin or the logo is broken in every email.
const PUBLIC_URL = process.env.BETTER_AUTH_URL?.startsWith("https://")
  ? process.env.BETTER_AUTH_URL.replace(/\/$/, "")
  : "https://resumatch.zeeshanai.cloud";

function otpTemplate(otp: string, type: OtpEmailType) {
  const { subject, heading, intro, outro } = COPY[type];

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your ResuMatchAI code is ${otp}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
          <tr><td style="padding:32px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;line-height:0;">
                <img src="${PUBLIC_URL}/apple-icon" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;border-radius:8px;" />
              </td>
              <td style="font-size:18px;font-weight:600;color:#0f172a;">ResuMatchAI</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:24px 32px 0 32px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">${heading}</h1>
            <p style="margin:8px 0 0 0;font-size:14px;line-height:22px;color:#475569;">${intro}</p>
          </td></tr>
          <tr><td style="padding:24px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;">
              <tr><td align="center" style="padding:20px 16px;">
                <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#0f172a;">${otp}</span>
              </td></tr>
            </table>
            <p style="margin:12px 0 0 0;font-size:13px;color:#64748b;">This code expires in ${EXPIRY_MINUTES} minutes.</p>
          </td></tr>
          <tr><td style="padding:24px 32px 32px 32px;">
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px 0;" />
            <p style="margin:0;font-size:12px;line-height:20px;color:#94a3b8;">${outro}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    heading,
    "",
    intro,
    "",
    `Code: ${otp}`,
    `This code expires in ${EXPIRY_MINUTES} minutes.`,
    "",
    outro,
  ].join("\n");

  return { subject, html, text };
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  type: OtpEmailType
) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY environment variable is not set.");
  }

  const { subject, html, text } = otpTemplate(otp, type);

  // No idempotency key: every send carries a freshly rotated code, so a stable
  // key would 409 on the second send and "Resend code" must deliver a new one.
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject,
    html,
    text,
  });

  // The SDK resolves rather than throwing — API failures arrive on `error`.
  if (error) {
    throw new Error(`Resend send failed: ${error.name} — ${error.message}`);
  }

  return data;
}
