// Phase 6 visual + accessibility sweep. Seeds one user through the API (fake AI), then visits every
// dashboard screen at mobile / tablet / desktop in light and dark: screenshot, horizontal-scroll check,
// axe-core (WCAG 2.2 AA + best practice), and full console text.
//
//   APP_URL=http://127.0.0.1:3005 API_URL=http://127.0.0.1:8012 node scripts/e2e/shots-phase6.mjs
//   ONLY=report SIZES=desktop THEMES=light node scripts/e2e/shots-phase6.mjs   (narrow the sweep)
//
// Needs `npm i --no-save playwright-core axe-core`, the dev stack, and the make_samples.py files.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const samples = path.join(here, "samples");
const shots = path.join(here, "shots", "matrix");
fs.mkdirSync(shots, { recursive: true });
const APP = process.env.APP_URL ?? "http://127.0.0.1:3005";
const API = process.env.API_URL ?? "http://127.0.0.1:8012";
// SEED_JSON=<file {email, password, ids: {match, recruiterMatch}}> skips seeding and sweeps an
// account that already has data (Phase 7 uses it on the account built with real OpenAI output).
const SEED = process.env.SEED_JSON ? JSON.parse(fs.readFileSync(process.env.SEED_JSON, "utf8")) : null;
const EMAIL = SEED?.email ?? `sweep+${Date.now()}@example.test`;
const PASSWORD = SEED?.password ?? "E2e-Password-123!";
const axeSource = fs.readFileSync(path.join(here, "..", "..", "node_modules", "axe-core", "axe.min.js"), "utf8");

const SIZES = { mobile: [390, 844], tablet: [820, 1180], desktop: [1440, 900] };
const sizes = (process.env.SIZES ?? "mobile,tablet,desktop").split(",");
const themes = (process.env.THEMES ?? "light,dark").split(",");
const only = process.env.ONLY;

function psql(sql) {
  return execFileSync("docker", ["exec", "resumatch-dev-postgres", "psql", "-U", "resumatch", "-d", "resumatch_dev", "-At", "-c", sql], { encoding: "utf8" }).trim();
}

// ── Seed through the API ──
const ids = SEED ? { ...SEED.ids } : {};
if (!SEED) {
await fetch(`${APP}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: APP },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Pat Tester" }),
});
psql(`update resume_match."user" set "emailVerified" = true where email = '${EMAIL}'`);
const signIn = await fetch(`${APP}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: APP },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const token = (await (await fetch(`${APP}/api/auth/token`, { headers: { Cookie: cookie, Origin: APP } })).json()).token;
const auth = { Authorization: `Bearer ${token}` };

async function api(p, init = {}) {
  const res = await fetch(`${API}${p}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${p} ${res.status} ${JSON.stringify(body)}`);
  return body;
}
async function job(jobId) {
  for (let i = 0; i < 80; i++) {
    const j = await api(`/v1/jobs/${jobId}`);
    if (j.status === "succeeded") return j.result;
    if (j.status === "failed") throw new Error("job failed " + JSON.stringify(j.error));
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("job timeout");
}
async function upload(file, mode) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(path.join(samples, file))], { type: "application/pdf" }), file);
  form.append("mode", mode);
  return (await job((await api("/v1/resumes", { method: "POST", body: form })).job_id)).resume_id;
}
async function posting(text, mode) {
  const r = await api("/v1/job-descriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode }) });
  return (await job(r.job_id)).jd_id;
}
const jdText = fs.readFileSync(path.join(samples, "jd.txt"), "utf8");
const r1 = await upload("resume_1.pdf", "candidate");
const jd1 = await posting(jdText, "candidate");
ids.match = (await job((await api("/v1/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume_id: r1, jd_id: jd1 }) })).job_id)).match_id;
await job((await api(`/v1/matches/${ids.match}/tailored-bullets`, { method: "POST" })).job_id);
await job((await api(`/v1/matches/${ids.match}/cover-letter`, { method: "POST" })).job_id);
const rr = [];
for (const f of ["resume_2.pdf", "resume_3.pdf", "resume_4.pdf"]) rr.push(await upload(f, "recruiter"));
const jd2 = await posting(jdText + "\nRecruiter copy.", "recruiter");
const screening = await job((await api("/v1/screenings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume_ids: rr, jd_id: jd2 }) })).job_id);
ids.recruiterMatch = screening.ranked[0].match_id;
console.log("seeded:", EMAIL, JSON.stringify(ids));
}

const PAGES = [
  ["overview", "/dashboard"],
  ["match-pick", "/dashboard/match"],
  ["screen-pick", "/dashboard/screen"],
  ["history", "/dashboard/history"],
  ["history-screener", "/dashboard/history?tab=screener"],
  ["report", `/dashboard/reports/${ids.match}`],
  ["report-bullets", `/dashboard/reports/${ids.match}?tab=bullets`],
  ["report-letter", `/dashboard/reports/${ids.match}?tab=letter`],
  ["report-recruiter", `/dashboard/reports/${ids.recruiterMatch}`],
  ["report-missing", "/dashboard/reports/00000000-0000-0000-0000-000000000000"],
  ["settings-profile", "/dashboard/settings"],
  ["settings-credits", "/dashboard/settings?tab=credits"],
  ["settings-account", "/dashboard/settings?tab=account"],
  ["help", "/dashboard/help"],
].filter(([name]) => !only || name.includes(only));

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

let issues = 0;
const seenConsole = new Set();
for (const theme of themes) {
  for (const size of sizes) {
    const [width, height] = SIZES[size];
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => seenConsole.add(`PAGEERROR [${page.url().replace(APP, "")}] ${e.message}`));
    page.on("console", (m) => {
      const t = m.text();
      if (!["error", "warning"].includes(m.type()) || /DevTools|Reduced Motion|non-static position|Failed to load resource/.test(t)) return;
      seenConsole.add(`${m.type().toUpperCase()} [${page.url().replace(APP, "")}] ${t.slice(0, 1500)}`);
    });
    await page.goto(`${APP}/sign-in`);
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 30000 });

    for (const [name, url] of PAGES) {
      await page.goto(`${APP}${url}`);
      await page.getByRole("heading").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(name.startsWith("report") ? 1200 : 500);
      const file = `${name}__${size}-${theme}`;
      await page.screenshot({ path: path.join(shots, `${file}.png`), fullPage: true });

      const overflow = await page.evaluate(() => {
        const main = document.querySelector("main");
        return { doc: document.documentElement.scrollWidth - innerWidth, main: main ? main.scrollWidth - main.clientWidth : 0 };
      });
      await page.addScriptTag({ content: axeSource });
      const axe = await page.evaluate(() =>
        window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } }).then((r) =>
          r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].target.join(" ").slice(0, 120), help: v.help })),
        ),
      );
      const bad = axe.filter((v) => !["region"].includes(v.id)); // landmark "region" noise from Next route announcer
      const problems = [];
      if (overflow.doc > 1 || overflow.main > 1) problems.push(`H-SCROLL doc:${overflow.doc} main:${overflow.main}`);
      for (const v of bad) problems.push(`AXE ${v.impact} ${v.id} x${v.n} (${v.sample}): ${v.help}`);
      if (problems.length) {
        issues += problems.length;
        console.log(`✗ ${file}`);
        for (const p of problems) console.log("    " + p);
      } else console.log(`✓ ${file}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log("\nConsole errors/warnings (deduped):");
for (const c of seenConsole) console.log("  ", c);
console.log(issues === 0 ? "\nNO ISSUES" : `\n${issues} ISSUE(S)`);
