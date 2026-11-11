// Phase 6: force the non-happy states (no credits, server 402, load failure, slow load, missing report)
// on the most recent `sweep+...` user created by shots-phase6.mjs, and screenshot them.
//   APP_URL=http://127.0.0.1:3005 node scripts/e2e/states-phase6.mjs
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(here, "shots", "states");
fs.mkdirSync(shots, { recursive: true });
const APP = process.env.APP_URL ?? "http://127.0.0.1:3005";
const psql = (sql) =>
  execFileSync("docker", ["exec", "resumatch-dev-postgres", "psql", "-U", "resumatch", "-d", "resumatch_dev", "-At", "-c", sql], { encoding: "utf8" }).trim();
const email = psql(`select email from resume_match."user" where email like 'sweep+%' order by "createdAt" desc limit 1`);
const userId = psql(`select id from resume_match."user" where email='${email}'`);
const matchId = psql(`select summary_id from resume_match.job_match_summary where user_id='${userId}' and is_candidate order by created_at limit 1`);
let failures = 0;
const check = (l, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? "  -> " + d : ""}`); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
async function session(w, h, theme) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(`${APP}/sign-in`);
  await page.fill("#email", email);
  await page.fill("#password", "E2e-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  return { ctx, page };
}
const shot = (page, n) => page.screenshot({ path: path.join(shots, `${n}.png`), fullPage: true });

// ── 1. No credits (real balance of 0) ──
const before = psql(`select current_balance from resume_match.user_credit_accounts where user_id='${userId}'`);
psql(`update resume_match.user_credit_accounts set current_balance = 0 where user_id='${userId}'`);
try {
  const { ctx, page } = await session(1440, 900, "light");
  await page.goto(`${APP}/dashboard`);
  await page.getByText("You are out of credits").waitFor({ timeout: 20000 });
  check("overview: out-of-credits note, uploads still free", await page.getByText(/still work/).isVisible());
  await shot(page, "01-overview-no-credits");

  await page.goto(`${APP}/dashboard/match`);
  await page.getByRole("radio").first().waitFor({ timeout: 20000 });
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Paste text", { exact: true }).click();
  await page.getByLabel("Text of the posting").fill(fs.readFileSync(path.join(here, "samples", "jd.txt"), "utf8"));
  await page.getByRole("button", { name: "Add posting" }).click();
  await page.getByRole("heading", { name: "Ready to analyze" }).waitFor({ timeout: 30000 });
  check("analyze step with 0 credits: 402 note shown, button disabled",
    await page.getByRole("alert").filter({ hasText: "Not enough credits" }).isVisible() &&
    await page.getByRole("button", { name: /Analyze/ }).isDisabled());
  await shot(page, "02-match-no-credits");

  await page.goto(`${APP}/dashboard/reports/${matchId}?tab=letter`);
  await page.getByRole("heading", { name: /cover letter|different draft/i }).first().waitFor({ timeout: 20000 });
  check("report cover letter tab: no-credits note and disabled action", await page.getByRole("alert").filter({ hasText: "Not enough credits" }).isVisible());
  await shot(page, "03-report-letter-no-credits");

  await page.goto(`${APP}/dashboard/settings?tab=credits`);
  await page.getByText(/You are out of credits/).waitFor();
  await shot(page, "04-settings-credits-zero");
  await ctx.close();
} finally {
  psql(`update resume_match.user_credit_accounts set current_balance = ${before} where user_id='${userId}'`);
}

// ── 2. Server says 402 although the client thought there was enough ──
{
  const { ctx, page } = await session(390, 844, "dark");
  await page.route("**/v1/matches", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 402, contentType: "application/json", headers: { "access-control-allow-origin": APP }, body: JSON.stringify({ code: "INSUFFICIENT_CREDITS", message: "no", details: { needed: 1, balance: 0 } }) });
    } else await route.continue();
  });
  await page.goto(`${APP}/dashboard/match`);
  await page.getByRole("radio").first().waitFor({ timeout: 20000 });
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Paste text", { exact: true }).click();
  await page.getByLabel("Text of the posting").fill(fs.readFileSync(path.join(here, "samples", "jd.txt"), "utf8"));
  await page.getByRole("button", { name: "Add posting" }).click();
  await page.getByRole("heading", { name: "Ready to analyze" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /Analyze \(1 credit\)/ }).click();
  await page.getByRole("alert").filter({ hasText: "This needs 1 credit and you have 0" }).waitFor({ timeout: 15000 });
  check("server 402 mid-flow shows the numbers from the response", true);
  await shot(page, "05-match-server-402-mobile-dark");
  await ctx.close();
}

// ── 3. Load failure and slow load ──
{
  const { ctx, page } = await session(1440, 900, "light");
  await page.route("**/v1/overview", (r) => r.abort());
  await page.goto(`${APP}/dashboard`);
  await page.getByText("Your overview did not load").waitFor({ timeout: 20000 });
  check("overview load failure: message and a Try again button", await page.getByRole("button", { name: "Try again" }).isVisible());
  await shot(page, "06-overview-load-failed");
  await page.unroute("**/v1/overview");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("heading", { name: "Recent analyses" }).waitFor({ timeout: 20000 });
  check("Try again recovers", true);

  await page.route("**/v1/matches/**", async (r) => { await new Promise((res) => setTimeout(res, 2500)); await r.continue(); });
  await page.goto(`${APP}/dashboard/reports/${matchId}`);
  await page.waitForTimeout(900);
  check("report shows a loading sheet, not a spinner", await page.getByLabel("Loading the report").isVisible());
  await shot(page, "07-report-loading");
  await page.unroute("**/v1/matches/**");

  await page.route("**/v1/matches", (r) => r.request().method() === "GET" ? r.abort() : r.continue());
  await page.goto(`${APP}/dashboard/history`);
  await page.getByText("Your history did not load").waitFor({ timeout: 20000 });
  check("history load failure shows its own message", true);
  await shot(page, "08-history-load-failed");
  await ctx.close();
}

// ── 4. A brand-new user: empty History, empty Screener tab, empty ledger ──
{
  const fresh = `empty+${Date.now()}@example.test`;
  await fetch(`${APP}/api/auth/sign-up/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ email: fresh, password: "E2e-Password-123!", name: "New Person" }) });
  psql(`update resume_match."user" set "emailVerified" = true where email = '${fresh}'`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${APP}/sign-in`);
  await page.fill("#email", fresh);
  await page.fill("#password", "E2e-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(`${APP}/dashboard/history`);
  await page.getByText("No Job Fit analyses yet").waitFor({ timeout: 20000 });
  check("history empty state explains what to do", await page.getByRole("link", { name: /Start Job Fit/ }).isVisible());
  await shot(page, "09-history-empty");
  await page.goto(`${APP}/dashboard/screen`);
  await page.getByRole("heading", { name: "Add the resumes to screen" }).waitFor();
  await shot(page, "10-screen-empty");
  await page.goto(`${APP}/dashboard/settings?tab=credits`);
  await page.getByRole("heading", { name: "Ledger" }).waitFor();
  await shot(page, "11-settings-credits-new");
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL STATE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
