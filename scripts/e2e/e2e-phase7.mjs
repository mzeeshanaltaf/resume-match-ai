// Phase 7: the whole product against REAL OpenAI + Firecrawl, over HTTP, through real Better Auth sign-in.
//   env: APP_URL (default http://127.0.0.1:3000), API_URL (default http://127.0.0.1:8010),
//        CORPUS (dir written by backend/dev/live_corpus.py), OUT (dir for dumps), JD_URL (a live posting)
// Creates throwaway users in the LOCAL dev DB only. Prints every observed latency and message.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const API = process.env.API_URL ?? "http://127.0.0.1:8010";
const CORPUS = process.env.CORPUS;
const OUT = process.env.OUT ?? path.join(CORPUS, "..", "p7out");
const JD_URL = process.env.JD_URL ?? "https://job-boards.greenhouse.io/gitlab/jobs/8771512002";
const ABOUT_URL = process.env.ABOUT_URL ?? "https://about.gitlab.com/company/";
const NEWS_URL = process.env.NEWS_URL ?? "https://www.bbc.com/future/article/20150713-how-worried-should-you-be-about-artificial-intelligence";
fs.mkdirSync(OUT, { recursive: true });

const EMAIL = `p7+${Date.now()}@example.test`;
const PASSWORD = "P7-Password-123!";
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!ok) failures++;
};
const note = (label, detail) => console.log(`INFO  ${label}  -> ${detail}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (sql) =>
  execFileSync("docker", ["exec", "resumatch-dev-postgres", "psql", "-U", "resumatch", "-d", "resumatch_dev", "-At", "-c", sql], { encoding: "utf8" }).trim();
const dump = (name, value) => fs.writeFileSync(path.join(OUT, name), typeof value === "string" ? value : JSON.stringify(value, null, 2));

// ── auth (real Better Auth) ─────────────────────────────────────────────────
const jar = new Map();
const remember = (res) => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
};
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const authCall = (p, body) =>
  fetch(`${APP}/api/auth${p}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: APP, Cookie: cookie() }, body: JSON.stringify(body) });
async function signUpAndIn(email) {
  jar.clear();
  await authCall("/sign-up/email", { email, password: PASSWORD, name: "Phase Seven" });
  psql(`update resume_match."user" set "emailVerified" = true where email = '${email}'`);
  remember(await authCall("/sign-in/email", { email, password: PASSWORD }));
  const token = (await (await fetch(`${APP}/api/auth/token`, { headers: { Cookie: cookie() } })).json()).token;
  return { token, userId: JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub };
}

let TOKEN;
const api = (p, init = {}) => fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } });
const json = (p, init) => api(p, init).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers }));
const post = (p, body) => json(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function waitJob(jobId, maxSeconds = 900) {
  const t0 = Date.now();
  for (;;) {
    const { body } = await json(`/v1/jobs/${jobId}`);
    if (body.status === "succeeded" || body.status === "failed") return { job: body, seconds: (Date.now() - t0) / 1000 };
    if ((Date.now() - t0) / 1000 > maxSeconds) throw new Error(`job ${jobId} still ${body.status} after ${maxSeconds}s`);
    await sleep(750);
  }
}
const stepTimes = (job) => job.steps.map((s) => `${s.name}=${s.finished_at && s.started_at ? ((new Date(s.finished_at) - new Date(s.started_at)) / 1000).toFixed(1) + "s" : s.status}`).join(" ");

async function uploadResume(file, mode, mime = "application/pdf", name = file) {
  const fd = new FormData();
  fd.append("mode", mode);
  fd.append("file", new Blob([fs.readFileSync(path.join(CORPUS, file))], { type: mime }), name);
  const res = await api("/v1/resumes", { method: "POST", body: fd });
  const body = await res.json();
  if (res.status !== 202) return { immediate: { status: res.status, body } };
  const done = await waitJob(body.job_id);
  return { job: done.job, seconds: done.seconds };
}
const mimeOf = (f) => (f.endsWith(".pdf") ? "application/pdf" : f.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain");
async function submitJd(payload) {
  const res = await post("/v1/job-descriptions", payload);
  if (res.status !== 202) return { immediate: res };
  const done = await waitJob(res.body.job_id);
  return { job: done.job, seconds: done.seconds };
}
const balance = async () => (await json("/v1/credits")).body.balance;

// ════════════════════════════════════════════════════════════════════════════
const { token, userId } = await signUpAndIn(EMAIL);
TOKEN = token;
console.log(`user ${userId}`);
check("new account starts with 10 credits", (await balance()) === 10);

// ── 1. Resume uploads (candidate mode) ──────────────────────────────────────
console.log("\n== Resume uploads (real extraction, OCR and gate) ==");
const ids = {};
for (const f of ["resume_maya.pdf", "resume_maya_scanned.pdf", "resume_maya.docx", "resume_maya.txt", "resume_daniel.pdf"]) {
  const r = await uploadResume(f, "candidate", mimeOf(f));
  const ok = r.job?.status === "succeeded";
  check(`upload ${f}`, ok, ok ? `${r.seconds.toFixed(1)}s  ${stepTimes(r.job)}` : JSON.stringify(r.job?.error ?? r.immediate));
  if (ok) {
    ids[f] = r.job.result.resume_id;
    const info = r.job.result.resume;
    note(`  ${f}`, `pages=${info.num_pages} chars=${info.num_characters} words=${info.num_words} scanned=${info.is_scanned}`);
  }
}
// The scanned copy has a different checksum, so it is stored separately; same text as maya.pdf.
check("scanned resume flagged is_scanned", ids["resume_maya_scanned.pdf"] && (await json("/v1/resumes")).body.find((x) => x.id === ids["resume_maya_scanned.pdf"])?.is_scanned === true);

console.log("\n== Refused uploads ==");
{
  const r = await uploadResume("resume_6pages.pdf", "candidate");
  check("6-page PDF refused", r.immediate?.status === 422 && r.immediate.body.code === "PAGE_LIMIT_EXCEEDED", `${r.immediate?.status} ${r.immediate?.body?.code}: ${r.immediate?.body?.message}`);
}
{
  const r = await uploadResume("resume_big.pdf", "candidate");
  check("file over 5 MB refused", r.immediate?.status === 413 && r.immediate.body.code === "FILE_TOO_LARGE", `${r.immediate?.status} ${r.immediate?.body?.code}: ${r.immediate?.body?.message}`);
}
for (const [f, expectCodes] of [
  ["cover_letter.pdf", ["INVALID_RESUME"]],
  ["article.pdf", ["INVALID_RESUME"]],
  ["company_about.pdf", ["INVALID_RESUME"]],
  ["jd_as_resume.pdf", ["INVALID_RESUME"]],
  ["blank.pdf", ["INVALID_RESUME", "UNREADABLE_DOCUMENT"]],
]) {
  const r = await uploadResume(f, "candidate");
  const err = r.job?.error;
  check(`${f} rejected`, r.job?.status === "failed" && expectCodes.includes(err?.code), `${r.seconds?.toFixed(1)}s ${err?.code}: "${err?.message}" p=${err?.details?.probability}`);
}
const stored = (await json("/v1/resumes")).body.length;
check("rejected documents were not stored", stored === 5, `stored=${stored}`);
check("repeat upload is a duplicate", (await uploadResume("resume_maya.pdf", "candidate")).immediate?.body?.code === "DUPLICATE_RESUME");

// ── 2. Job postings ─────────────────────────────────────────────────────────
console.log("\n== Job descriptions ==");
const jdText = fs.readFileSync(path.join(CORPUS, "jd_orbital.txt"), "utf8");
const jdByText = await submitJd({ text: jdText, mode: "candidate" });
check("JD by pasted text", jdByText.job?.status === "succeeded", jdByText.job?.status === "succeeded" ? `${jdByText.seconds.toFixed(1)}s ${stepTimes(jdByText.job)}` : JSON.stringify(jdByText.job?.error ?? jdByText.immediate));
const jdTextId = jdByText.job?.result?.jd_id;
if (jdTextId) {
  const o = jdByText.job.result.job_description.jd_object;
  note("  extracted", `${o.job_title} @ ${o.company_name} | ${o.location} | ${o.employment_type} | resp=${o.responsibilities?.length} req=${o.requirements?.length} ben=${o.benefits?.length}`);
}
const jdByUrl = await submitJd({ url: JD_URL, mode: "candidate" });
check("JD by URL (live posting via Firecrawl)", jdByUrl.job?.status === "succeeded", jdByUrl.job?.status === "succeeded" ? `${jdByUrl.seconds.toFixed(1)}s ${stepTimes(jdByUrl.job)}` : JSON.stringify(jdByUrl.job?.error ?? jdByUrl.immediate));
const jdUrlId = jdByUrl.job?.result?.jd_id;
if (jdUrlId) {
  const o = jdByUrl.job.result.job_description.jd_object;
  note("  extracted", `${o.job_title} @ ${o.company_name} | ${o.location} | resp=${o.responsibilities?.length} req=${o.requirements?.length}`);
}
for (const [label, payload] of [
  ["company about page URL", { url: ABOUT_URL, mode: "candidate" }],
  ["news article URL", { url: NEWS_URL, mode: "candidate" }],
  ["resume text as JD", { text: fs.readFileSync(path.join(CORPUS, "resume_maya.txt"), "utf8"), mode: "candidate" }],
]) {
  const r = await submitJd(payload);
  check(`${label} rejected`, r.job?.status === "failed" && r.job.error.code === "INVALID_JD", `${r.seconds?.toFixed(1)}s ${r.job?.error?.code}: "${r.job?.error?.message}"`);
}
check("repeat JD is a duplicate", (await submitJd({ text: jdText, mode: "candidate" })).immediate?.body?.code === "DUPLICATE_JD");

// ── 3. Job Fit match ────────────────────────────────────────────────────────
console.log("\n== Job Fit match (candidate) ==");
let matchId;
{
  const before = await balance();
  const t0 = Date.now();
  const res = await post("/v1/matches", { resume_id: ids["resume_maya.pdf"], jd_id: jdTextId });
  check("POST /matches accepted", res.status === 202, JSON.stringify(res.body).slice(0, 120));
  const done = await waitJob(res.body.job_id);
  check("match job succeeded", done.job.status === "succeeded", `${done.seconds.toFixed(1)}s ${stepTimes(done.job)} ${JSON.stringify(done.job.error ?? "")}`);
  matchId = done.job.result?.match_id;
  const after = await balance();
  check("match cost exactly 1 credit", before - after === 1, `${before} -> ${after}`);
  const m = (await json(`/v1/matches/${matchId}`)).body;
  dump("match_candidate.json", m);
  const r = m.report;
  const ms = r.match_summary;
  check("report has the candidate shape", !!ms && Array.isArray(ms.key_strengths) && !!r.detailed_analysis && !!r.improvement_suggestions && !!r.ats_optimization, `score=${ms?.overall_score_percent} confidence=${ms?.score_confidence}`);
  note("  report sizes", `strengths=${ms.key_strengths.length} gaps=${ms.critical_gaps.length} met=${r.detailed_analysis.requirements_met.length} weak=${r.detailed_analysis.gaps_and_weak_matches.length} high=${r.improvement_suggestions.high_priority.length} keywords=${r.ats_optimization.keywords_to_add.length}`);
  const longest = Math.max(...JSON.stringify(r).match(/"[^"]{40,}"/g).map((s) => s.length));
  note("  longest single report string", `${longest} chars`);
  check("score is a sane number for a good match (60-100)", ms.overall_score_percent >= 60 && ms.overall_score_percent <= 100, String(ms.overall_score_percent));
}
// a deliberately poor match should score noticeably lower
{
  const res = await post("/v1/matches", { resume_id: ids["resume_daniel.pdf"], jd_id: jdTextId });
  const done = await waitJob(res.body.job_id);
  const m = (await json(`/v1/matches/${done.job.result?.match_id}`)).body;
  const maya = (await json(`/v1/matches/${matchId}`)).body.report.match_summary.overall_score_percent;
  const dan = m.report.match_summary.overall_score_percent;
  check("junior resume scores lower than the senior one for a senior role", dan < maya, `${dan} vs ${maya}  (${done.seconds.toFixed(1)}s)`);
  dump("match_candidate_weak.json", m);
}
// scanned + DOCX + TXT resumes against the URL posting (live JD)
{
  const res = await post("/v1/matches", { resume_id: ids["resume_maya_scanned.pdf"], jd_id: jdUrlId });
  const done = await waitJob(res.body.job_id);
  check("match from the OCR'd resume against the URL posting", done.job.status === "succeeded", `${done.seconds.toFixed(1)}s score=${(await json(`/v1/matches/${done.job.result?.match_id}`)).body?.report?.match_summary?.overall_score_percent}`);
}

// ── 4. Tailored bullets and cover letter ────────────────────────────────────
console.log("\n== Generated documents ==");
{
  const before = await balance();
  const res = await post(`/v1/matches/${matchId}/tailored-bullets`, {});
  const done = await waitJob(res.body.job_id);
  check("tailored bullets generated (free)", done.job.status === "succeeded" && before === (await balance()), `${done.seconds.toFixed(1)}s`);
  const c = done.job.result?.document?.content;
  dump("bullets.json", done.job.result ?? done.job.error);
  check("bullets have summary + experience", !!c?.summary && c?.experience?.length > 0, `experience groups=${c?.experience?.length} first heading="${c?.experience?.[0]?.heading}"`);
  const second = await post(`/v1/matches/${matchId}/tailored-bullets`, {});
  check("second bullets request is 409", second.status === 409 && second.body.code === "ALREADY_GENERATED");
}
{
  const before = await balance();
  const res = await post(`/v1/matches/${matchId}/cover-letter`, {});
  const done = await waitJob(res.body.job_id);
  const after = await balance();
  check("cover letter generated (1 credit)", done.job.status === "succeeded" && before - after === 1, `${done.seconds.toFixed(1)}s ${before} -> ${after}`);
  dump("cover_letter.json", done.job.result ?? done.job.error);
  const doc = done.job.result?.document?.content;
  check("cover letter has a full text", (doc?.text?.length ?? 0) > 400, `${doc?.text?.length} chars`);
}

// ── 5. Screening (recruiter mode, 3 resumes) ────────────────────────────────
console.log("\n== Recruiter screening ==");
{
  const rIds = [];
  for (const f of ["resume_maya.pdf", "resume_daniel.pdf", "resume_maya.docx"]) {
    const r = await uploadResume(f, "recruiter", mimeOf(f));
    if (r.job?.status === "succeeded") rIds.push(r.job.result.resume_id);
    else console.log("  recruiter upload failed", f, JSON.stringify(r.job?.error ?? r.immediate));
  }
  const rJd = await submitJd({ text: jdText, mode: "recruiter" });
  check("recruiter resumes and posting stored", rIds.length === 3 && rJd.job?.status === "succeeded");
  const before = await balance();
  const res = await post("/v1/screenings", { resume_ids: rIds, jd_id: rJd.job.result.jd_id });
  check("screening accepted", res.status === 202, JSON.stringify(res.body).slice(0, 100));
  const done = await waitJob(res.body.job_id);
  const out = done.job.result;
  dump("screening.json", out ?? done.job.error);
  check("screening succeeded and ranked 3", done.job.status === "succeeded" && out.ranked.length === 3, `${done.seconds.toFixed(1)}s ${stepTimes(done.job)}`);
  check("screening cost 3 credits", before - (await balance()) === 3, `${before} -> ${await balance()}`);
  note("  ranking", out?.ranked.map((x) => `${x.rank}. ${x.file_name} ${x.overall_score_percent}% (${x.score_confidence})`).join(" | "));
  const first = out.ranked[0];
  check("best candidate is a Maya resume, Daniel last", /maya/.test(first.file_name) && /daniel/.test(out.ranked[2].file_name));
  const rm = (await json(`/v1/matches/${first.match_id}`)).body;
  check("ranked row drills down to a recruiter report", rm.mode === "recruiter" && !!rm.report.match_summary.rationale, `rationale ${rm.report.match_summary.rationale?.length} chars`);
}

// ── 6. History, ledger, delete match keeps resume and JD ────────────────────
console.log("\n== History, ledger, delete semantics ==");
{
  const matches = (await json("/v1/matches")).body;
  const tx = (await json("/v1/credits/transactions")).body;
  dump("transactions.json", tx);
  const types = tx.reduce((a, t) => ((a[t.transaction_type] = (a[t.transaction_type] ?? 0) + 1), a), {});
  note("  ledger", `${tx.length} rows ${JSON.stringify(types)}`);
  check("ledger sums to the balance", tx.reduce((s, t) => s + t.credits_delta, 0) === (await balance()));
  check("ledger has signup, match, cover letter and screening rows", ["signup_bonus", "match_analysis", "cover_letter", "screening"].every((t) => tx.some((x) => x.transaction_type === t)), Object.keys(types).join(","));
  check("history lists every match (candidate and screening)", matches.length >= 6, `${matches.length}`);

  const del = await api(`/v1/matches/${matchId}`, { method: "DELETE" });
  check("delete match -> 204", del.status === 204);
  check("match gone, its documents gone", (await api(`/v1/matches/${matchId}`)).status === 404);
  const resumeRow = psql(`select count(*) from resume_match.user_resume where file_id = '${ids["resume_maya.pdf"]}'`);
  const jdRow = psql(`select count(*) from resume_match.user_jds where url_id = '${jdTextId}'`);
  const docRows = psql(`select count(*) from resume_match.generated_documents where match_id = '${matchId}'`);
  check("resume and JD survive deleting the match (SQL)", resumeRow === "1" && jdRow === "1" && docRows === "0", `resume=${resumeRow} jd=${jdRow} docs=${docRows}`);
}

// ── 7. Storage (local backend) ──────────────────────────────────────────────
console.log("\n== Storage ==");
{
  const cols = psql(`select string_agg(column_name, ',') from information_schema.columns where table_schema='resume_match' and table_name='user_resume'`);
  check("user_resume has no binary column", !/binary|bytea/.test(cols) && !/file_binary_data/.test(cols), cols);
  const id = ids["resume_maya.pdf"];
  const file = await api(`/v1/resumes/${id}/file`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const original = fs.readFileSync(path.join(CORPUS, "resume_maya.pdf"));
  check("GET /resumes/{id}/file returns the original bytes", file.status === 200 && bytes.equals(original) && file.headers.get("content-type") === "application/pdf", `${bytes.length} bytes, ${file.headers.get("content-type")}`);
  const key = psql(`select storage_key from resume_match.user_resume where file_id = '${id}'`);
  const onDisk = path.join(process.env.BACKEND_DIR ?? path.resolve(CORPUS, "..", "..", "..", "..", "backend"), ".local_storage", key);
  note("  storage key", key);
  const exists = fs.existsSync(onDisk);
  check("object exists in storage before delete", exists, onDisk);
  const del = await api(`/v1/resumes/${id}`, { method: "DELETE" });
  check("DELETE resume -> 204", del.status === 204);
  check("object removed from storage after delete", !fs.existsSync(onDisk));
  check("file endpoint 404s after delete", (await api(`/v1/resumes/${id}/file`)).status === 404);
  // re-add so the export has a full set
  const again = await uploadResume("resume_maya.pdf", "candidate");
  ids["resume_maya.pdf"] = again.job?.result?.resume_id;
  check("re-upload after delete works (no stale dedup)", again.job?.status === "succeeded");
  // cascade note: matches that used the deleted resume went with it
}

// ── 8. No credits: 402 ──────────────────────────────────────────────────────
console.log("\n== Zero credits ==");
{
  const bal = await balance();
  psql(`update resume_match.user_credit_accounts set current_balance = 0 where user_id = '${userId}'`);
  const res = await post("/v1/matches", { resume_id: ids["resume_daniel.pdf"], jd_id: jdUrlId });
  check("match at 0 credits -> 402 INSUFFICIENT_CREDITS", res.status === 402 && res.body.code === "INSUFFICIENT_CREDITS", `${res.status} ${JSON.stringify(res.body.details)} "${res.body.message}"`);
  const cl = await post(`/v1/matches/${(await json("/v1/matches")).body[0].id}/cover-letter`, {});
  check("cover letter at 0 credits -> 402", cl.status === 402, `${cl.status} ${cl.body?.code}`);
  const up = await uploadResume("resume_daniel.pdf", "candidate");
  check("uploads stay free at 0 credits (duplicate here, not 402)", up.immediate?.body?.code === "DUPLICATE_RESUME");
  psql(`update resume_match.user_credit_accounts set current_balance = ${bal} where user_id = '${userId}'`);
}

// ── 9. Export ───────────────────────────────────────────────────────────────
console.log("\n== Export ==");
{
  const res = await api("/v1/account/export");
  const zip = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT, "export.zip"), zip);
  check("export is a ZIP", res.status === 200 && res.headers.get("content-type") === "application/zip" && zip.subarray(0, 2).toString() === "PK", `${zip.length} bytes ${res.headers.get("content-disposition")}`);
  // what the app shows, for the verifier to compare
  dump("app_resumes.json", (await json("/v1/resumes")).body);
  dump("app_jds.json", (await json("/v1/job-descriptions?limit=500")).body);
  const list = (await json("/v1/matches")).body;
  const full = [];
  for (const m of list) full.push((await json(`/v1/matches/${m.id}`)).body);
  dump("app_matches.json", full);
  dump("app_transactions.json", (await json("/v1/credits/transactions")).body);
  dump("app_balance.json", (await json("/v1/credits")).body);
  const second = await api("/v1/account/export");
  check("second export within the hour -> 429", second.status === 429, `${second.status} ${JSON.stringify((await second.json()).details)}`);
}
dump("user.json", { email: EMAIL, userId });

console.log(failures === 0 ? "\nALL PHASE 7 CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
