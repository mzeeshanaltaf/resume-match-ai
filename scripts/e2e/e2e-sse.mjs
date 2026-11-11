// Confirms live job steps reach the progress dialog over SSE (not via the polling fallback).
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = "http://127.0.0.1:3000";
const EMAIL = `sse+${Date.now()}@example.test`;
const PW = "Sse-Password-123!";
const psql = (sql) => execFileSync("docker", ["exec", "resumatch-dev-postgres", "psql", "-U", "resumatch", "-d", "resumatch_dev", "-At", "-c", sql], { encoding: "utf8" }).trim();

await fetch(`${APP}/api/auth/sign-up/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ email: EMAIL, password: PW, name: "Sse" }) });
psql(`update resume_match."user" set "emailVerified"=true where email='${EMAIL}'`);

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await (await b.newContext()).newPage();
const calls = [];
p.on("request", (r) => { if (r.url().includes(":8000/v1/jobs/")) calls.push(r.url().replace("http://127.0.0.1:8000", "")); });
await p.goto(`${APP}/sign-in`);
await p.fill("#email", EMAIL); await p.fill("#password", PW);
await p.getByRole("button", { name: "Sign in", exact: true }).click();
await p.waitForURL("**/dashboard");
await p.goto(`${APP}/dashboard/match`);
await p.waitForSelector("text=Upload your resume");
await p.locator('input[type="file"]').setInputFiles(path.join(here, "samples", "resume_2.pdf"));
await p.getByRole("button", { name: "Process resume" }).click();

const seen = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 12000) {
  const labels = await p.locator('[role="status"]').allInnerTexts().catch(() => []);
  labels.forEach((l) => seen.add(l.replace(/\s+/g, " ").trim()));
  if (await p.getByText("Resume uploaded successfully").first().isVisible().catch(() => false)) break;
  await p.waitForTimeout(80);
}
console.log("progress labels seen:", [...seen]);
console.log("job requests:", calls);
const eventsOnly = calls.length > 0 && calls.every((c) => c.endsWith("/events"));
const labelsOk = [...seen].some((s) => /Reading your file/i.test(s)) && [...seen].some((s) => /(Checking|Validat|Saving)/i.test(s));
console.log(eventsOnly ? "PASS  only the SSE endpoint was used (no polling)" : "FAIL  polling fallback was used");
console.log(labelsOk ? "PASS  live step labels from the backend were shown" : "FAIL  backend step labels not seen");
await b.close();
process.exit(eventsOnly && labelsOk ? 0 : 1);
