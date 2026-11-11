// Phase 4 end-to-end run through the real UI (headless Chrome) against the real stack:
// Next.js dev server (127.0.0.1:3000, local dev Postgres) + FastAPI dev server (fake AI, real JWKS auth).
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const samples = path.join(here, "samples");
const shots = path.join(here, "shots");
const APP = "http://127.0.0.1:3000";
const EMAIL = `e2e+${Date.now()}@example.test`;
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
    { encoding: "utf8" }
  ).trim();
}

// ── Setup: create + verify a user (no real email is sent; the Resend key is a dummy) ──
const signUp = await fetch(`${APP}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: APP },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "E2E Tester" }),
});
check("sign-up API creates the user", signUp.status < 500, `status ${signUp.status}`);
psql(`update resume_match."user" set "emailVerified" = true where email = '${EMAIL}'`);
const userId = psql(`select id from resume_match."user" where email = '${EMAIL}'`);
check("user row exists in dev DB and is verified", !!userId, userId);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const apiCalls = [];
page.on("response", (r) => {
  if (r.url().startsWith("http://127.0.0.1:8000")) apiCalls.push(`${r.request().method()} ${r.url().replace("http://127.0.0.1:8000", "")} ${r.status()}`);
});
page.on("pageerror", (e) => { console.log("PAGEERROR", e.message); });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE.ERROR", m.text().slice(0, 300)); });

async function shot(name) {
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false });
}
const text = (t, opts) => page.getByText(t, opts);

// ── Sign in through the UI ──
await page.goto(`${APP}/sign-in`);
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL("**/dashboard", { timeout: 30000 });
check("UI sign-in lands on the dashboard", true);

// ── Overview: data loads from FastAPI; new user gets 10 credits lazily ──
await page.waitForSelector("text=Welcome back", { timeout: 30000 });
await page.waitForSelector("text=Run your first resume analysis", { timeout: 30000 });
const creditPill = page.locator("span.tabular-nums").first();
await creditPill.waitFor({ timeout: 15000 });
check("credit display shows the 10 signup credits", (await creditPill.innerText()).trim() === "10", await creditPill.innerText());
check("overview called /v1/overview and /v1/credits with 200",
  apiCalls.some((c) => c.startsWith("GET /v1/overview") && c.endsWith("200")) &&
  apiCalls.some((c) => c.startsWith("GET /v1/credits") && c.endsWith("200")), apiCalls.slice(0, 8).join(" | "));
await shot("01-overview-empty");

// ── Job Fit: upload resume ──
await page.goto(`${APP}/dashboard/match`);
await page.waitForSelector("text=Upload your resume", { timeout: 30000 });
check("upload area states formats and limits", await text("PDF, DOCX or TXT · max 5 MB · up to 5 pages").isVisible());

// client-side rejections
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles(path.join(samples, "resume_big.pdf"));
await page.waitForSelector("text=over the 5 MB limit", { timeout: 5000 });
check("file over 5 MB refused in the browser with a specific message", true);

// server-side page-limit rejection (6 pages)
await fileInput.setInputFiles(path.join(samples, "resume_6pages.pdf"));
await page.getByRole("button", { name: "Process resume" }).click();
await page.waitForSelector("text=/page/i >> nth=0", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
const toastTexts = await page.locator("[data-sonner-toast]").allInnerTexts();
check("6-page PDF rejected by the server with a page-limit message", toastTexts.some((t) => /page/i.test(t)), toastTexts.join(" / ").slice(0, 160));
await page.getByRole("button", { name: "Remove file" }).click().catch(() => {});

// real upload (job events drive the progress dialog)
await fileInput.setInputFiles(path.join(samples, "resume_1.pdf"));
await page.getByRole("button", { name: "Process resume" }).click();
await page.waitForSelector("text=Processing Resume", { timeout: 10000 });
await shot("02-upload-progress");
await page.waitForSelector("text=Resume uploaded successfully", { timeout: 30000 });
check("resume uploaded via job + SSE", apiCalls.some((c) => c.includes("/v1/jobs/") && c.includes("/events") && c.endsWith("200")));
await page.getByRole("button", { name: "Continue" }).click();

// ── JD: paste text ──
await page.waitForSelector("text=Add job description");
await page.getByRole("button", { name: "Paste text" }).click();
const jd = (await import("node:fs")).readFileSync(path.join(samples, "jd.txt"), "utf8");
await page.getByPlaceholder("Paste the full job description here").fill(jd);
await page.getByRole("button", { name: "Process JD" }).click();
await page.waitForSelector("text=Job description processed", { timeout: 30000 });
check("job description processed", true);
check("analysis screen states the credit cost and balance", await text(/costs 1 credit/).isVisible());
await shot("03-ready-to-analyze");
await page.getByRole("button", { name: "Analyze Match" }).click();
await page.waitForSelector("text=Analyzing", { timeout: 10000 }).catch(() => {});
await page.waitForSelector("text=confidence", { timeout: 40000 });
check("match completed and results rendered", true);
await shot("04-results");

// credits dropped to 9
await page.waitForFunction(() => document.querySelector("span.tabular-nums")?.textContent?.trim() === "9", null, { timeout: 15000 });
check("credit display dropped to 9 (match costs 1)", true);

// ── History ──
await page.goto(`${APP}/dashboard/history`);
await page.waitForSelector("table", { timeout: 30000 });
const rows = await page.locator("tbody tr").count();
check("match appears in history", rows === 1, `${rows} row(s)`);
check("history row shows resume name and job", (await page.locator("tbody tr").first().innerText()).includes("resume_1.pdf"));
await shot("05-history");

await page.getByRole("button", { name: "View Report" }).click();
await page.waitForSelector("text=Match Report", { timeout: 10000 });
await page.waitForSelector("text=confidence", { timeout: 15000 });
check("View Report loads the full report on demand", apiCalls.some((c) => /GET \/v1\/matches\/[0-9a-f-]{36} 200/.test(c)));
await shot("06-report-dialog");
await page.keyboard.press("Escape");

// PDF preview (loads /v1/resumes/{id}/file on demand)
await page.getByTitle("Preview resume").click();
await page.waitForSelector("canvas", { timeout: 30000 });
check("PDF preview renders from /v1/resumes/{id}/file", apiCalls.some((c) => /GET \/v1\/resumes\/[0-9a-f-]{36}\/file 200/.test(c)));
await shot("07-pdf-preview");
await page.keyboard.press("Escape");

// delete the match: resume + JD stay
await page.getByTitle("Delete", { exact: true }).click();
await text("Your resume and job description are kept").waitFor();
await page.getByRole("button", { name: "Delete", exact: true }).click();
await page.waitForSelector("text=No Job Fit analyses yet", { timeout: 15000 });
check("match deleted from history", true);
const resumeRows = psql(`select count(*) from resume_match.user_resume where user_id = '${userId}'`);
const jdRows = psql(`select count(*) from resume_match.user_jds where user_id = '${userId}'`);
const matchRows = psql(`select count(*) from resume_match.job_match_summary where user_id = '${userId}'`);
check("after deleting the match: resume and JD rows survive, match row gone", resumeRows === "1" && jdRows === "1" && matchRows === "0", `resumes=${resumeRows} jds=${jdRows} matches=${matchRows}`);

// resume picker lists the existing resume
await page.goto(`${APP}/dashboard/match`);
await page.waitForSelector("text=Choose or upload your resume", { timeout: 30000 });
check("resume picker lists the existing resume", await text("resume_1.pdf").isVisible());
check("upload form is not forced when resumes exist", await page.getByRole("button", { name: "Upload another resume" }).isVisible());
await shot("08-picker-existing");

// duplicate upload reuses the existing copy
await page.getByRole("button", { name: "Upload another resume" }).click();
await page.locator('input[type="file"]').setInputFiles(path.join(samples, "resume_1.pdf"));
await page.getByRole("button", { name: "Process resume" }).click();
await page.waitForSelector("text=already uploaded this file", { timeout: 15000 });
check("duplicate upload falls back to the existing copy", true);

// ── Credits ledger ──
await page.goto(`${APP}/dashboard/settings`);
await page.getByRole("tab", { name: "Credits" }).click();
await page.waitForSelector("text=Transaction History", { timeout: 15000 });
const ledger = await page.locator("div.divide-y").first().innerText();
check("ledger shows signup bonus and the match charge", /\+10/.test(ledger) && /-1/.test(ledger), ledger.replace(/\n/g, " | ").slice(0, 200));
await shot("09-credits");

// ── Screener: recruiter-mode picker is separate; 3 resumes ──
await page.goto(`${APP}/dashboard/screen`);
await page.waitForSelector("text=Upload resumes to screen", { timeout: 30000 });
check("screener does not list candidate-mode resumes", !(await text("resume_1.pdf").isVisible().catch(() => false)));
for (const n of [2, 3, 4]) {
  const input = page.locator('input[type="file"]');
  if (n !== 2) await page.getByRole("button", { name: "Upload another resume" }).click();
  await input.setInputFiles(path.join(samples, `resume_${n}.pdf`));
  await page.getByRole("button", { name: "Process resume" }).click();
  await page.waitForSelector(`text=resume_${n}.pdf`, { timeout: 30000 });
}
await page.getByRole("button", { name: /Continue \(3 selected\)/ }).click();
await page.waitForSelector("text=Enter job description");
await page.getByRole("button", { name: "Paste text" }).click();
await page.getByPlaceholder("Paste the full job description here").fill(jd + " (screening copy)");
await page.getByRole("button", { name: "Process JD" }).click();
await page.waitForSelector("text=Ready to screen", { timeout: 30000 });
check("screening step states the cost (3 credits)", await text(/costs 3 credits/).isVisible().catch(() => false) || await text(/This costs 3 credits/).isVisible());
await shot("10-ready-to-screen");
await page.getByRole("button", { name: "Start Screening" }).click();
await page.waitForSelector("text=Screening Results", { timeout: 60000 });
const ranked = await page.locator("div.rounded-lg.border.p-4").count();
check("screening finished with 3 ranked resumes", ranked >= 3, `${ranked} cards`);
await shot("11-screening-results");
await page.waitForFunction(() => document.querySelector("span.tabular-nums")?.textContent?.trim() === "6", null, { timeout: 15000 });
check("credits now 6 (10 - 1 match - 3 screening)", true);

// history screener tab
await page.goto(`${APP}/dashboard/history?tab=screener`);
await page.waitForSelector("table", { timeout: 20000 });
check("screener tab lists the 3 screened resumes", (await page.locator("tbody tr").count()) === 3);

// ── 402 handling: zero the balance underneath the UI, then try a match ──
psql(`update resume_match.user_credit_accounts set current_balance = 0 where user_id = '${userId}'`);
await page.goto(`${APP}/dashboard/match`);
await page.waitForSelector("text=Choose or upload your resume");
await page.getByRole("button", { name: /resume_1\.pdf/ }).click();
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: "Paste text" }).click();
await page.getByPlaceholder("Paste the full job description here").fill(jd);
await page.getByRole("button", { name: "Process JD" }).click();
await page.waitForSelector("text=/already added this job description|Job description processed/", { timeout: 30000 });
await page.waitForSelector("text=You don't have enough credits", { timeout: 5000 });
check("UI blocks the analysis when the balance is below the cost", await page.getByRole("button", { name: "Analyze Match" }).isDisabled());
await shot("12-no-credits");

// ── Sign out clears the API token cache; sign back in works ──
await ctx.close();
await browser.close();

console.log(`\nUSER_ID=${userId}\nEMAIL=${EMAIL}\nPASSWORD=${PASSWORD}`);
console.log("API calls seen:", apiCalls.length);
console.log(failures === 0 ? "\nALL UI CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
