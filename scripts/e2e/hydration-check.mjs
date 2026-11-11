// Production-build hydration check: visits dashboard pages and prints every page error / console
// error with the URL and viewport, so a React hydration mismatch (minified #418/#423/#425 in a
// production build) can be pinned to a page. Fresh page per visit.
//   SEED_JSON=<{email,password}> APP_URL=http://127.0.0.1:3000 node scripts/e2e/hydration-check.mjs [path ...]
import { chromium } from "playwright-core";
import fs from "node:fs";

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const { email, password } = JSON.parse(fs.readFileSync(process.env.SEED_JSON, "utf8"));
const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/dashboard", "/dashboard/settings", "/dashboard/settings?tab=credits", "/dashboard/settings?tab=account", "/dashboard/history", "/dashboard/history?tab=screener", "/dashboard/match", "/dashboard/screen", "/dashboard/help"];
const REPEAT = Number(process.env.REPEAT ?? 1);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let bad = 0;
const WIDTHS = (process.env.WIDTHS ?? "390,820,1440").split(",").map((w) => [Number(w), 900]);
for (const [w, h] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  if (process.env.THEME) await ctx.addInitScript((t) => localStorage.setItem("theme", t), process.env.THEME);
  const page = await ctx.newPage();
  // THROTTLE=6 slows the CPU 6x (CDP): hydration then finishes later than data fetches that
  // started earlier, which is how timing-dependent mismatches show up.
  if (process.env.THROTTLE) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) });
  }
  let current = "sign-in";
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message.slice(0, 160)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error ${m.text().slice(0, 300)}`); });
  await page.goto(`${APP}/sign-in`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  for (const p of paths) {
    for (let i = 0; i < REPEAT; i++) {
      errors.length = 0;
      current = p;
      await page.goto(`${APP}${p}`);
      await page.getByRole("heading").first().waitFor({ timeout: 30000 });
      await page.waitForTimeout(1500);
      console.log(`${errors.length ? "✗" : "✓"} ${w}px ${p}${errors.length ? "\n    " + errors.join("\n    ") : ""}`);
      bad += errors.length;
    }
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `\n${bad} error(s)` : "\nno hydration or console errors");
process.exit(bad ? 1 : 0);
