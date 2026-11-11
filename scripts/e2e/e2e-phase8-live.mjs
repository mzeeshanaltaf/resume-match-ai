// Phase 8: the deployed product, end to end, against the REAL production site, API and MinIO.
//   env: CORPUS (dir written by backend/dev/live_corpus.py), plus optional
//        APP_URL (default https://resumatch.zeeshanai.cloud), API_URL (default https://api.resumatch.zeeshanai.cloud),
//        SSH_KEY (default ~/.ssh/hostinger_vps_ed25519), VPS (default root@76.13.7.106),
//        BACKEND_UUID, MINIO_UUID, BUCKET.
// It creates ONE throwaway account (a Resend test address, so no real email is sent), marks its email verified
// over SSH, runs a match and the storage checks, deletes the account and checks everything is gone.
// It never prints credentials. Requires: ssh access to the VPS.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = process.env.APP_URL ?? "https://resumatch.zeeshanai.cloud";
const API = process.env.API_URL ?? "https://api.resumatch.zeeshanai.cloud";
const CORPUS = process.env.CORPUS;
const SSH_KEY = process.env.SSH_KEY ?? path.join(os.homedir(), ".ssh", "hostinger_vps_ed25519");
const VPS = process.env.VPS ?? "root@76.13.7.106";
const BACKEND_UUID = process.env.BACKEND_UUID ?? "kupjhfcdqsn2xnh9b41iqysc";
const MINIO_UUID = process.env.MINIO_UUID ?? "ik0av0n8ajbxezjvhcf4jwn4";
const BUCKET = process.env.BUCKET ?? "resumatch";
if (!CORPUS) throw new Error("set CORPUS to the directory written by backend/dev/live_corpus.py");

const STAMP = Date.now();
const EMAIL = `delivered+p8-${STAMP}@resend.dev`;
const PASSWORD = `P8-${STAMP}-Pw!x`;
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!ok) failures++;
};
const note = (label, detail) => console.log(`INFO  ${label}  -> ${detail}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── VPS helpers (input goes over stdin as bytes so nothing is re-encoded) ──────────────────────
const ssh = (remote, input = "") => {
  const r = spawnSync("ssh", ["-i", SSH_KEY, "-o", "BatchMode=yes", VPS, remote], { input: Buffer.from(input, "utf8"), encoding: "utf8", maxBuffer: 1 << 26 });
  return (r.stdout ?? "").trim();
};
const psql = (sql) =>
  ssh(
    `c=$(docker ps --format '{{.Names}}' | grep ${BACKEND_UUID} | head -1); DB=$(docker exec $c printenv DATABASE_URL); ` +
      `docker run -i --rm -e U="$DB" postgres:17-alpine sh -c 'psql "$U" -At -F"|" 2>/dev/null'`,
    sql,
  );
const minio = (cmd) =>
  ssh(
    `docker exec -e MC_CONFIG_DIR=/tmp/mc minio-${MINIO_UUID} sh -c 'mc alias set m http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; ${cmd}' 2>&1`,
  );
const objects = (prefix) => minio(`mc ls --recursive m/${BUCKET}/${prefix} | wc -l`);

// ── auth (real Better Auth over HTTPS) ──────────────────────────────────────────────────────────
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
async function signIn(email) {
  jar.clear();
  const res = await authCall("/sign-in/email", { email, password: PASSWORD });
  remember(res);
  if (res.status !== 200) return { status: res.status };
  const token = (await (await fetch(`${APP}/api/auth/token`, { headers: { Cookie: cookie() } })).json()).token;
  return { status: 200, token, userId: JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub };
}

let TOKEN;
const api = (p, init = {}) => fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } });
const json = (p, init) => api(p, init).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const post = (p, body) => json(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function waitJob(jobId, maxSeconds = 600) {
  const t0 = Date.now();
  for (;;) {
    const { body } = await json(`/v1/jobs/${jobId}`);
    if (body.status === "succeeded" || body.status === "failed") return { job: body, seconds: (Date.now() - t0) / 1000 };
    if ((Date.now() - t0) / 1000 > maxSeconds) throw new Error(`job ${jobId} still ${body.status} after ${maxSeconds}s`);
    await sleep(1000);
  }
}
async function uploadResume(file, mode = "candidate") {
  const fd = new FormData();
  fd.append("mode", mode);
  fd.append("file", new Blob([fs.readFileSync(path.join(CORPUS, file))], { type: "application/pdf" }), file);
  const res = await api("/v1/resumes", { method: "POST", body: fd });
  const body = await res.json();
  if (res.status !== 202) return { immediate: { status: res.status, body } };
  return await waitJob(body.job_id);
}
const balance = async () => (await json("/v1/credits")).body.balance;

try {
  // ── account ───────────────────────────────────────────────────────────────────────────────────
  console.log(`== Throwaway account ${EMAIL.replace(/\+.*@/, "+…@")} ==`);
  const up = await authCall("/sign-up/email", { email: EMAIL, password: PASSWORD, name: "Phase Eight" });
  check("sign-up accepted (verification email goes to the Resend test sink)", up.status === 200, `status ${up.status}`);
  check("sign-in is refused until the email is verified", (await signIn(EMAIL)).status === 403);
  psql(`update resume_match."user" set "emailVerified" = true where email = '${EMAIL}'`);
  const s = await signIn(EMAIL);
  check("sign-in works once verified", s.status === 200);
  TOKEN = s.token;
  const userId = s.userId;
  const ledger0 = Number(psql(`select count(*) from resume_match.user_credit_accounts where user_id='${userId}'`));
  check("JWT issued by the live Better Auth is accepted by the live backend (JWKS verification)", (await json("/v1/credits")).status === 200);
  check("new account starts with 10 credits (lazy grant)", (await balance()) === 10, `ledger accounts before: ${ledger0}`);
  check("no token is refused", (await fetch(`${API}/v1/credits`)).status === 401);
  check("another issuer's token is refused", (await fetch(`${API}/v1/credits`, { headers: { Authorization: `Bearer ${TOKEN.slice(0, -4)}AAAA` } })).status === 401);

  // ── resume + MinIO ────────────────────────────────────────────────────────────────────────────
  console.log("\n== Resume upload and storage ==");
  const r = await uploadResume("resume_maya.pdf");
  check("resume upload succeeds (real extraction + Decisions gate)", r.job?.status === "succeeded", r.job ? `${r.seconds.toFixed(1)}s` : JSON.stringify(r.immediate));
  const resumeId = r.job?.result?.resume_id;
  const key = psql(`select storage_key from resume_match.user_resume where file_id='${resumeId}'`);
  check("DB row holds a storage_key under resumes/<user>/", key.startsWith(`resumes/${userId}/`), key.replace(userId, "<user>"));
  check("object exists in the bucket", Number(objects(`resumes/${userId}/`)) === 1);
  const bytes = Buffer.from(await (await api(`/v1/resumes/${resumeId}/file`)).arrayBuffer());
  check("GET /file streams back the original bytes (preview path)", bytes.equals(fs.readFileSync(path.join(CORPUS, "resume_maya.pdf"))), `${bytes.length} bytes`);
  check("GET /file without a token is refused", (await fetch(`${API}/v1/resumes/${resumeId}/file`)).status === 401);
  const direct = await fetch(`http://76.13.7.106:9000/${BUCKET}/${key}`, { signal: AbortSignal.timeout(6000) }).then((x) => x.status, () => "unreachable");
  check("bucket is not reachable from the internet", direct === "unreachable" || direct === 403 || direct === 404, String(direct));

  // ── JD + match ────────────────────────────────────────────────────────────────────────────────
  console.log("\n== Job description and match ==");
  const jd = await post("/v1/job-descriptions", { text: fs.readFileSync(path.join(CORPUS, "jd_orbital.txt"), "utf8"), mode: "candidate" });
  const jdDone = await waitJob(jd.body.job_id);
  check("job description accepted", jdDone.job.status === "succeeded", `${jdDone.seconds.toFixed(1)}s`);
  const jdId = jdDone.job.result.jd_id;
  const m = await post("/v1/matches", { resume_id: resumeId, jd_id: jdId });
  const mDone = await waitJob(m.body.job_id);
  check("match completes", mDone.job.status === "succeeded", `${mDone.seconds.toFixed(1)}s ${mDone.job.steps.map((x) => x.name).join(">")}`);
  const matchId = mDone.job.result?.match_id;
  const report = mDone.job.result?.match?.report;
  check("report has the expected sections", !!report?.match_summary && Array.isArray(report?.detailed_analysis?.requirements_met), `score=${report?.match_summary?.overall_score_percent}`);
  check("match cost exactly 1 credit", (await balance()) === 9);
  const tx = (await json("/v1/credits/transactions")).body;
  check("ledger: signup +10 and match -1", tx.length === 2 && tx.reduce((a, t) => a + t.credits_delta, 0) === 9, tx.map((t) => `${t.transaction_type}:${t.credits_delta}`).join(" "));
  const b = await post(`/v1/matches/${matchId}/tailored-bullets`, {});
  const bDone = await waitJob(b.body.job_id);
  check("tailored bullets are free", bDone.job.status === "succeeded" && (await balance()) === 9, `${bDone.seconds.toFixed(1)}s`);

  // ── delete semantics ──────────────────────────────────────────────────────────────────────────
  console.log("\n== Delete semantics ==");
  check("delete match -> 204", (await api(`/v1/matches/${matchId}`, { method: "DELETE" })).status === 204);
  check("resume and job description survive a match delete", (await json(`/v1/job-descriptions/${jdId}`)).status === 200 && (await json("/v1/resumes")).body.some((x) => x.id === resumeId));
  check("delete resume -> 204", (await api(`/v1/resumes/${resumeId}`, { method: "DELETE" })).status === 204);
  await sleep(1500);
  check("delete resume removed the object", Number(objects(`resumes/${userId}/`)) === 0);

  // ── account deletion ──────────────────────────────────────────────────────────────────────────
  console.log("\n== Account deletion ==");
  const again = await uploadResume("resume_maya.pdf");
  check("re-upload after delete works (so deletion has something to erase)", again.job?.status === "succeeded");
  check("one object under the user's prefix before deletion", Number(objects(`resumes/${userId}/`)) === 1);
  const del = await authCall("/delete-user", { password: PASSWORD });
  check("POST /api/auth/delete-user -> 200", del.status === 200, `status ${del.status}`);
  const counts = psql(
    ["user_resume", "user_jds", "job_match_summary", "user_credit_accounts", "user_credit_transactions", "jobs"].map((t) => `select '${t}', count(*) from resume_match.${t} where user_id='${userId}'`).join(" union all ") +
      `; select 'ba_user', count(*) from resume_match."user" where id='${userId}'; select 'ba_session', count(*) from resume_match.session where "userId"='${userId}'; select 'ba_account', count(*) from resume_match.account where "userId"='${userId}';`,
  );
  check("zero rows left for the user in every table", counts.split("\n").every((l) => l.endsWith("|0")), counts.replace(/\n/g, " "));
  check("no objects left under the user's prefix", Number(objects(`resumes/${userId}/`)) === 0);
  check("sign-in no longer works", (await signIn(EMAIL)).status !== 200);
  const hashed = Number(psql(`select count(*) from resume_match.deleted_accounts`));
  check("a deleted-email hash was recorded", hashed >= 1, `deleted_accounts=${hashed}`);
  // Re-registering the same email must start with 0 credits (signup-credit farming guard, needs the prod salt).
  await authCall("/sign-up/email", { email: EMAIL, password: PASSWORD, name: "Phase Eight" });
  psql(`update resume_match."user" set "emailVerified" = true where email = '${EMAIL}'`);
  const s2 = await signIn(EMAIL);
  TOKEN = s2.token;
  check("re-registering the same email starts with 0 credits", s2.status === 200 && (await balance()) === 0);
  const del2 = await authCall("/delete-user", { password: PASSWORD });
  check("cleanup: second throwaway account deleted", del2.status === 200);
  const left = psql(`select count(*) from resume_match."user" where email = '${EMAIL}'`);
  check("no throwaway user remains", left === "0");
} catch (err) {
  console.error("SCRIPT ERROR", err);
  failures++;
}
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
