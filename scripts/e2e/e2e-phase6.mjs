// Phase 6 end-to-end run through the redesigned dashboard (headless Chrome, real stack,
// fake AI, local dev DB only). The Job Fit flow is driven with the KEYBOARD ONLY.
//
//   node scripts/e2e/e2e-phase6.mjs
//
// Needs: npm run dev (127.0.0.1:3000), backend `DEV_REAL_AUTH=1 DEV_FAKE_DELAY=0.9 uv run python dev/dev_server.py`,
// `npm i --no-save playwright-core`, and the samples from make_samples.py.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const samples = path.join(here, "samples");
const shots = path.join(here, "shots");
fs.mkdirSync(shots, { recursive: true });
const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const EMAIL = `p6+${Date.now()}@example.test`;
const PASSWORD = "E2e-Password-123!";

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!ok) failures++;
}
function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "resumatch-dev-postgres", "psql", "-U", "resumatch", "-d", "resumatch_dev", "-At", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

const signUp = await fetch(`${APP}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: APP },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Pat Tester" }),
});
check("sign-up API creates the user", signUp.status < 500, `status ${signUp.status}`);
psql(`update resume_match."user" set "emailVerified" = true where email = '${EMAIL}'`);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
await ctx.addInitScript(() => localStorage.setItem("theme", "light"));
const page = await ctx.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    const t = m.text();
    if (/Download the React DevTools|favicon/.test(t)) return;
    consoleErrors.push(`${m.type().toUpperCase()} [${page.url().replace(APP, "")}] ${t.slice(0, 200)}`);
  }
});
const shot = (name) => page.screenshot({ path: path.join(shots, `p6-${name}.png`) });

/** Press Tab until the focused element's label matches. Proves it is reachable by keyboard. */
async function tabTo(matcher, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return "";
      const label = e.getAttribute("aria-label") || e.innerText || e.value || e.placeholder || e.id || "";
      const labelledby = e.getAttribute("aria-labelledby");
      const extra = labelledby ? document.getElementById(labelledby)?.innerText ?? "" : "";
      const type = e.getAttribute("type") ?? "";
      const label2 = e.labels?.[0]?.innerText ?? "";
      return `${e.tagName}|${type}|${label}|${extra}|${label2}`.replace(/\s+/g, " ").trim();
    });
    if (matcher.test(info)) return info;
  }
  throw new Error(`could not Tab to ${matcher}`);
}
/** Is the focused element visibly focused (outline or ring)? */
async function focusVisible() {
  return page.evaluate(() => {
    const e = document.activeElement;
    if (!e) return false;
    const cs = getComputedStyle(e);
    const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    const ring = cs.boxShadow && cs.boxShadow !== "none";
    const parentRing = e.closest("label") ? getComputedStyle(e.closest("label")).boxShadow !== "none" : false;
    return outline || ring || parentRing;
  });
}

// ── Sign in ──
await page.goto(`${APP}/sign-in`);
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL("**/dashboard", { timeout: 30000 });

// ── Overview, first run ──
await page.getByRole("heading", { name: "Nothing analyzed yet" }).waitFor({ timeout: 30000 });
check("overview empty state teaches both desks", await page.getByText("Start Job Fit").isVisible() && await page.getByText("Start the Screener").isVisible());
const balance = await page.locator('a[href="/dashboard/settings?tab=credits"]').first().innerText();
check("top bar shows the 10 credits", /^10\s/.test(balance.trim()), balance.replace(/\s+/g, " "));
await shot("01-overview-empty");

// ── Help link works ──
await page.getByRole("link", { name: "Help", exact: true }).first().click();
await page.getByRole("heading", { name: "What costs a credit" }).waitFor();
check("Help page opens from the sidebar", true);
await shot("02-help");

// ── Job Fit, KEYBOARD ONLY ──
await page.goto(`${APP}/dashboard/match`);
await page.getByRole("heading", { name: "Add your resume" }).waitFor({ timeout: 30000 });
await page.getByText(/PDF, DOCX or TXT\. Up to 5 MB and 5 pages/).waitFor({ timeout: 15000 });
check("upload step states formats and limits beside the upload area", true);
await page.locator("body").click({ position: { x: 5, y: 5 } });
await tabTo(/Skip to content/);
await tabTo(/INPUT\|file/);
check("file input reachable by keyboard and shows a focus ring", await focusVisible());
// a file over the limit is refused in the browser, with the reason inline
await page.locator('input[type="file"]').setInputFiles(path.join(samples, "resume_big.pdf"));
await page.getByText(/over the 5 MB limit/).waitFor({ timeout: 5000 });
check("file over 5 MB refused in the browser, reason shown inline (not only a toast)", await page.getByRole("alert").filter({ hasText: "5 MB" }).isVisible());
await shot("03-upload-rejected-client");
// 6 pages: refused by the server with its specific reason
await page.locator('input[type="file"]').setInputFiles(path.join(samples, "resume_6pages.pdf"));
await tabTo(/Add resume/);
await page.keyboard.press("Enter");
await page.getByRole("alert").filter({ hasText: /page/i }).waitFor({ timeout: 20000 });
const pageLimitMsg = await page.getByRole("alert").filter({ hasText: /page/i }).innerText();
check("6-page PDF refused by the server with its reason inline", /6 pages|limit/i.test(pageLimitMsg), pageLimitMsg.replace(/\s+/g, " ").slice(0, 120));
await shot("04-upload-rejected-server");
// a good file; watch the live steps
await page.getByRole("button", { name: /Remove resume_6pages/ }).click().catch(() => {});
await page.locator('input[type="file"]').setInputFiles(path.join(samples, "resume_1.pdf"));
await tabTo(/Add resume/);
await page.keyboard.press("Enter");
const live = page.getByRole("status").filter({ hasText: "Checking your resume" });
await live.waitFor({ timeout: 10000 });
check("inline live step list (not a modal) appears during upload", (await page.getByRole("dialog").count()) === 0);
await shot("05-upload-live-steps");
await page.getByRole("radio").first().waitFor({ timeout: 30000 });
check("uploaded resume appears selected in the picker", await page.getByRole("radio").first().isChecked());
await tabTo(/Continue/);
await page.keyboard.press("Enter");

await page.getByRole("heading", { name: "Add the job posting" }).waitFor();
await tabTo(/INPUT\|radio\|.*Link/);
await page.keyboard.press("ArrowRight"); // radio group: arrows move between the options
await page.getByLabel("Text of the posting").waitFor();
const jd = fs.readFileSync(path.join(samples, "jd.txt"), "utf8");
await tabTo(/TEXTAREA/);
await page.keyboard.insertText(jd);
await tabTo(/Add posting/);
await page.keyboard.press("Enter");
await page.getByRole("status").filter({ hasText: "Reading the posting" }).waitFor({ timeout: 10000 });
await shot("06-posting-live-steps");
await page.getByRole("heading", { name: "Ready to analyze" }).waitFor({ timeout: 30000 });
const ledgerText = await page.getByRole("table").innerText();
check("analyze step shows the price and the balance after, before spending", /One analysis/.test(ledgerText) && /Balance after/.test(ledgerText) && /9/.test(ledgerText), ledgerText.replace(/\s+/g, " "));
await shot("07-ready-to-analyze");
await tabTo(/Analyze \(1 credit\)/);
check("Analyze button shows a focus ring", await focusVisible());
await page.keyboard.press("Enter");
await page.getByRole("status").filter({ hasText: "Analyzing" }).waitFor({ timeout: 10000 });
await shot("08-analyzing-live-steps");
await page.waitForURL("**/dashboard/reports/**", { timeout: 60000 });
check("match completes and opens the report page", true, page.url());
await page.getByRole("heading", { level: 1 }).waitFor();
await page.waitForTimeout(600);
await shot("09-report-analysis");
check("report is a full page with the score written on a paper sheet", await page.locator(".report-sheet").first().isVisible());
check("margin notes are present", (await page.locator(".report-sheet .font-hand").count()) > 0);

// ── Report tabs by keyboard: bullets are free, once ──
await tabTo(/Analysis/);
await page.keyboard.press("ArrowRight");
await page.getByRole("heading", { name: "Reword your bullets for this job" }).waitFor();
check("tailored bullets tab: arrow keys switch tabs", true);
await tabTo(/^BUTTON\|.*Write the bullets/);
await page.keyboard.press("Enter");
await page.getByRole("heading", { name: "Tailored bullets", level: 2 }).waitFor({ timeout: 40000 });
check("tailored bullets generated on demand (free)", true);
await shot("10-report-bullets");
await page.getByRole("tab", { name: /Cover letter/ }).click();
await page.getByRole("heading", { name: "Draft a cover letter" }).waitFor();
const clText = await page.getByRole("table").innerText();
check("cover letter shows its price before the action", /One draft/.test(clText) && /Balance after/.test(clText), clText.replace(/\s+/g, " "));
await shot("11-report-cover-letter-prompt");
await page.getByRole("button", { name: /Draft the letter \(1 credit\)/ }).click();
await page.getByText("Draft ·").waitFor({ timeout: 40000 });
check("cover letter generated", true);
await page.waitForFunction(() => /^8/.test(document.querySelector('a[href="/dashboard/settings?tab=credits"]')?.textContent?.trim() ?? ""), null, { timeout: 15000 });
check("credits went 10 -> 9 (analysis) -> 8 (cover letter)", true);
await shot("12-report-cover-letter");

// ── Print: every part prints, the shell does not ──
await page.emulateMedia({ media: "print" });
const printState = await page.evaluate(() => {
  const vis = (el) => !!el && el.getClientRects().length > 0;
  return {
    sidebar: vis(document.querySelector("aside")),
    topbar: vis(document.querySelector("body header")),
    tablist: vis(document.querySelector('[role="tablist"]')),
    sheets: [...document.querySelectorAll(".report-sheet")].filter(vis).length,
    paths: [...document.querySelectorAll(".report-sheet svg path")].every((p) => getComputedStyle(p).opacity === "1"),
  };
});
check("print: sidebar and tabs are hidden", !printState.sidebar && !printState.tablist, JSON.stringify(printState));
check("print: analysis, bullets and letter all print", printState.sheets === 3, `${printState.sheets} sheets`);
check("print: proof marks print finished", printState.paths);
await page.pdf({ path: path.join(shots, "p6-report-print.pdf"), format: "A4", printBackground: false });
await page.emulateMedia({ media: "screen" });

// ── History, then a screening ──
await page.goto(`${APP}/dashboard/history`);
await page.getByRole("table").waitFor({ timeout: 30000 });
check("history lists the analysis with a report link", (await page.getByRole("link", { name: /Open the report for/ }).count()) === 1);
await shot("13-history");

await page.goto(`${APP}/dashboard/screen`);
await page.getByRole("heading", { name: "Add the resumes to screen" }).waitFor({ timeout: 30000 });
for (const f of ["resume_2.pdf", "resume_3.pdf", "resume_4.pdf"]) {
  await page.locator('input[type="file"]').setInputFiles(path.join(samples, f));
  await page.getByRole("button", { name: "Add resume" }).click();
  await page.getByRole("checkbox", { name: new RegExp(f) }).waitFor({ timeout: 30000 });
  if ((await page.getByRole("button", { name: "Add another resume" }).count()) > 0) await page.getByRole("button", { name: "Add another resume" }).click();
}
await shot("14-screen-pick");
await page.getByRole("button", { name: /Continue with 3 resumes/ }).click();
await page.getByText("Paste text", { exact: true }).click();
await page.getByLabel("Text of the posting").fill(jd);
await page.getByRole("button", { name: "Add posting" }).click();
await page.getByRole("heading", { name: "Ready to screen" }).waitFor({ timeout: 30000 });
await page.getByRole("button", { name: /Screen \(3 credits\)/ }).click();
await page.getByRole("status").filter({ hasText: /Scoring resumes/ }).waitFor({ timeout: 15000 });
await shot("15-screening-live-steps");
await page.getByRole("heading", { name: "Ranking", level: 2 }).waitFor({ timeout: 60000 });
check("screening results are a ranked table", (await page.locator("table tbody tr").count()) === 3);
await shot("16-screen-results");
await page.getByRole("link", { name: /Open the report for/ }).first().click();
await page.waitForURL("**/dashboard/reports/**");
await page.getByRole("heading", { level: 1 }).waitFor();
check("drill-down opens that candidate's report (recruiter: no tabs)", (await page.getByRole("tablist").count()) === 0);
await page.waitForTimeout(500);
await shot("17-report-recruiter");

// ── Settings ──
await page.goto(`${APP}/dashboard/settings?tab=credits`);
await page.getByRole("heading", { name: "Ledger" }).waitFor({ timeout: 30000 });
const ledgerRows = await page.locator("table").last().locator("tbody tr").count();
check("credits tab: ledger lists signup, analysis, letter, screening", ledgerRows >= 6, `${ledgerRows} rows`);
await shot("18-settings-credits");
await page.goto(`${APP}/dashboard/settings`);
await page.getByRole("heading", { name: "Profile" }).first().waitFor();
await shot("19-settings-profile");

await page.goto(`${APP}/dashboard/settings?tab=account`);
await page.getByRole("heading", { name: "Download my data" }).waitFor();
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "Download my data" }).click(),
]);
const zipPath = path.join(shots, "p6-export.zip");
await download.saveAs(zipPath);
check("export downloads a ZIP", fs.statSync(zipPath).size > 200 && download.suggestedFilename().endsWith(".zip"), download.suggestedFilename());
await page.getByRole("button", { name: "Download my data" }).click();
const limited = page.getByRole("alert").filter({ hasText: /once an hour/i });
await limited.waitFor({ timeout: 15000 }).catch(() => {});
const exportAlert = await limited.innerText().catch(() => "");
check("a second export shows the once-an-hour message", /once an hour/i.test(exportAlert), exportAlert.replace(/\s+/g, " "));
await shot("20-settings-account-export-limited");

// delete: wrong email keeps the button disabled; wrong password is refused; right one erases
await page.getByRole("button", { name: "Delete my account", exact: true }).click();
const del = page.getByRole("button", { name: "Delete my account for good" });
check("delete button disabled until the email is typed", await del.isDisabled());
await page.getByLabel("Type your email address to confirm").fill(EMAIL);
await page.getByLabel("Your password").fill("not-the-password");
await shot("21-settings-delete-form");
await del.click();
await page.getByRole("alert").filter({ hasText: /password is not right/i }).waitFor({ timeout: 15000 });
check("wrong password is refused and nothing is deleted", psql(`select count(*) from resume_match."user" where email='${EMAIL}'`) === "1");
await page.getByLabel("Your password").fill(PASSWORD);
await del.click();
await page.waitForURL(`${APP}/`, { timeout: 60000 });
check("after deletion the user lands on the landing page", true);
const gone = psql(`select count(*) from resume_match."user" where email='${EMAIL}'`);
check("Better Auth user is gone", gone === "0");
await page.goto(`${APP}/dashboard`);
await page.waitForURL("**/sign-in**", { timeout: 15000 });
check("dashboard is protected again (session gone)", true);

await browser.close();
console.log("\nConsole errors/warnings seen:", consoleErrors.length);
for (const e of [...new Set(consoleErrors)].slice(0, 15)) console.log("  ", e);
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
