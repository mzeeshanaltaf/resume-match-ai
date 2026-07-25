/**
 * The address auth codes are sent from. Client-safe (a plain constant, no env
 * access) so the "check your spam folder" copy on the verify / forgot-password
 * screens and the real Resend `from` cannot drift apart.
 *
 * Must stay in sync with the address inside RESEND_FROM_EMAIL.
 */
export const OTP_SENDER_EMAIL = "noreply@verification.zeeshanai.cloud";
