// Phase 7, stage 2: export a POPULATED account (bullets + cover letter present) and verify the ZIP.
// Reuses the user written by e2e-phase7.mjs (OUT/user.json). Local dev DB only.
//   env: APP_URL, API_URL, CORPUS, OUT (same as stage 1)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const API = process.env.API_URL ?? "http://127.0.0.1:8010";
const CORPUS = process.env.CORPUS;
const OUT = process.env.OUT ?? path.join(CORPUS, "..", "p7out");
const { email, userId } = JSON.parse(fs.readFileSync(path.join(OUT, "user.json"), "utf8"));
const PASSWORD = "P7-Password-123!";
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (sql) =>
  execFileSync("docker", ["exec", "resumatch-dev-postgres", "psql", "-U", "resumatch", "-d", "resumatch_dev", "-At", "-c", sql], { encoding: "utf8" }).trim();
const dump = (name, value) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));

const jar = new Map();
const remember = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
};
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
remember(await fetch(`${APP}/api/auth/sign-in/email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ email, password: PASSWORD }) }));
const TOKEN = (await (await fetch(`${APP}/api/auth/token`, { headers: { Cookie: cookie() } })).json()).token;
const api = (p, init = {}) => fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } });
const json = (p, init) => api(p, init).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const post = (p, body) => json(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function waitJob(id) {
  for (;;) {
    const { body } = await json(`/v1/jobs/${id}`);
    if (body.status === "succeeded" || body.status === "failed") return body;
    await sleep(750);
  }
}

// a surviving candidate-mode match to hang bullets and a letter on
const list = (await json("/v1/matches")).body.filter((m) => m.mode === "candidate");
check("a candidate match survives from stage 1", list.length > 0, `${list.length}`);
const target = list[0];

// cover letters cost a credit: at zero balance the request is refused up front (and nothing is reserved)
{
  const bal = Number(psql(`select current_balance from resume_match.user_credit_accounts where user_id = '${userId}'`));
  psql(`update resume_match.user_credit_accounts set current_balance = 0 where user_id = '${userId}'`);
  const r = await post(`/v1/matches/${target.id}/cover-letter`, {});
  check("cover letter at 0 credits -> 402 INSUFFICIENT_CREDITS", r.status === 402 && r.body?.code === "INSUFFICIENT_CREDITS", `${r.status} ${JSON.stringify(r.body?.details)}`);
  check("no ledger row was written for the refused request", psql(`select count(*) from resume_match.user_credit_transactions where user_id = '${userId}' and transaction_type = 'cover_letter' and created_at > now() - interval '1 minute'`) === "0");
  psql(`update resume_match.user_credit_accounts set current_balance = ${bal} where user_id = '${userId}'`);
}

const b = await waitJob((await post(`/v1/matches/${target.id}/tailored-bullets`, {})).body.job_id);
check("tailored bullets generated", b.status === "succeeded", b.status === "failed" ? JSON.stringify(b.error) : "");
const c = await waitJob((await post(`/v1/matches/${target.id}/cover-letter`, {})).body.job_id);
check("cover letter generated", c.status === "succeeded", c.status === "failed" ? JSON.stringify(c.error) : "");

// for shots-phase6.mjs (SEED_JSON): sweep the screens with real model output
const recruiter = (await json("/v1/matches")).body.find((m) => m.mode === "recruiter");
dump("seed.json", { email, password: PASSWORD, ids: { match: target.id, recruiterMatch: recruiter?.id } });

// the export is limited to one an hour; stage 1 already used it. Reset the cooldown record (local dev DB).
psql(`delete from resume_match.jobs where user_id = '${userId}' and kind = 'account_export'`);

dump("app_resumes.json", (await json("/v1/resumes")).body);
dump("app_jds.json", (await json("/v1/job-descriptions?limit=500")).body);
const full = [];
for (const m of (await json("/v1/matches")).body) full.push((await json(`/v1/matches/${m.id}`)).body);
dump("app_matches.json", full);
dump("app_transactions.json", (await json("/v1/credits/transactions")).body);
dump("app_balance.json", (await json("/v1/credits")).body);

const res = await api("/v1/account/export");
const zip = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(path.join(OUT, "export_populated.zip"), zip);
check("export downloads", res.status === 200 && zip.subarray(0, 2).toString() === "PK", `${zip.length} bytes`);

let verified = true;
try {
  const out = execFileSync("python", [path.join(here, "verify_export.py"), path.join(OUT, "export_populated.zip"), OUT, CORPUS], { encoding: "utf8" });
  console.log(out);
} catch (e) {
  verified = false;
  console.log(e.stdout ?? String(e));
}
check("verify_export.py: every file opens and matches the app", verified);
console.log(failures === 0 ? "\nEXPORT STAGE PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
