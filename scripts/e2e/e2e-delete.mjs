// Account deletion through Better Auth's user.deleteUser + beforeDelete hook -> FastAPI /internal erase.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// APP_URL / API_URL default to the Phase 4 ports. Set REAL=1 to restart the real backend
// (real AI; needs OPENAI_API_KEY / FIRECRAWL_API_KEY in this process's environment) instead of
// the fake-AI dev server, and SAMPLE to a resume the real validation gate will accept.
const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const API = process.env.API_URL ?? "http://127.0.0.1:8000";
const API_PORT = new URL(API).port;
const SAMPLE = process.env.SAMPLE ?? path.join(here, "samples", "resume_1.pdf");
const BACKEND_DIR = path.resolve(here, "../../backend");
const EMAIL = `del+${Date.now()}@example.test`;
const PASSWORD = "Del-Password-123!";
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (sql) =>
  execFileSync("docker", ["exec", "resumatch-dev-postgres", "psql", "-U", "resumatch", "-d", "resumatch_dev", "-At", "-c", sql], { encoding: "utf8" }).trim();

function backendPid() {
  const out = execFileSync("powershell", ["-NoProfile", "-Command", `(Get-NetTCPConnection -LocalPort ${API_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`], { encoding: "utf8" }).trim();
  return out ? Number(out) : null;
}
async function waitHealth(up) {
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
    if (ok === up) return true;
    await sleep(500);
  }
  return false;
}
function stopBackend() {
  const pid = backendPid();
  if (pid) execFileSync("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`]);
}
function startBackend() {
  const log = fs.openSync(path.join(here, "backend-restart.log"), "a");
  const args = process.env.REAL
    ? ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", API_PORT]
    : ["run", "python", "dev/dev_server.py"];
  const child = spawn("uv", args, {
    cwd: BACKEND_DIR,
    env: { ...process.env, DEV_REAL_AUTH: "1", DEV_FAKE_DELAY: "0.2" },
    detached: true,
    stdio: ["ignore", log, log],
    shell: true,
  });
  child.unref();
}

const jar = new Map();
function remember(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const auth = (path, body, method = "POST") =>
  fetch(`${APP}/api/auth${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: APP, Cookie: cookie() },
    body: body ? JSON.stringify(body) : undefined,
  });

async function registerAndSignIn() {
  jar.clear();
  await auth("/sign-up/email", { email: EMAIL, password: PASSWORD, name: "Del Tester" });
  psql(`update resume_match."user" set "emailVerified" = true where email = '${EMAIL}'`);
  const res = await auth("/sign-in/email", { email: EMAIL, password: PASSWORD });
  remember(res);
  const token = (await (await fetch(`${APP}/api/auth/token`, { headers: { Cookie: cookie() } })).json()).token;
  return { status: res.status, token };
}
const api = (token, p, init = {}) => fetch(`${API}${p}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

// ── JWT shape ──
const { status: siStatus, token } = await registerAndSignIn();
check("sign-in API works", siStatus === 200, `status ${siStatus}`);
const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
check("JWT is EdDSA", header.alg === "EdDSA", JSON.stringify(header));
check("JWT iss and aud equal BETTER_AUTH_URL", payload.iss === APP && payload.aud === APP, `iss=${payload.iss} aud=${payload.aud}`);
check("JWT carries sub and email only (no other profile fields)", !!payload.sub && payload.email === EMAIL && !("name" in payload) && !("image" in payload), Object.keys(payload).join(","));
const userId = payload.sub;

// backend accepts it; lazy credit account = 10
const credits = await (await api(token, "/v1/credits")).json();
check("backend verifies the JWT via JWKS; new account has 10 credits", credits.balance === 10, JSON.stringify(credits));
check("backend rejects a request without a token", (await fetch(`${API}/v1/credits`)).status === 401);
check("backend rejects a tampered token", (await api(token.slice(0, -4) + "AAAA", "/v1/credits")).status === 401);

// give the user app data
const fd = new FormData();
fd.append("mode", "candidate");
fd.append("file", new Blob([fs.readFileSync(SAMPLE)], { type: "application/pdf" }), "del_resume.pdf");
const up = await api(token, "/v1/resumes", { method: "POST", body: fd });
const { job_id } = await up.json();
for (let i = 0; i < 40; i++) {
  const j = await (await api(token, `/v1/jobs/${job_id}`)).json();
  if (j.status === "succeeded") break;
  await sleep(500);
}
const appRows = () => psql(`select count(*) from resume_match.user_resume where user_id = '${userId}'`);
check("user has a stored resume", appRows() === "1");

// ── 1) Backend DOWN: the hook must throw and nothing is deleted ──
stopBackend();
check("backend stopped", await waitHealth(false));
const failDelete = await auth("/delete-user", { password: PASSWORD });
const failBody = await failDelete.text();
check("deleteUser fails while the erase call cannot succeed", failDelete.status >= 400, `status ${failDelete.status} ${failBody.slice(0, 120)}`);
check("account intact after the failed deletion (user, session, data)",
  psql(`select count(*) from resume_match."user" where id = '${userId}'`) === "1" &&
  Number(psql(`select count(*) from resume_match.session where "userId" = '${userId}'`)) >= 1 &&
  appRows() === "1");

// ── 2) Backend UP: deletion goes through ──
startBackend();
check("backend restarted", await waitHealth(true));
const okDelete = await auth("/delete-user", { password: PASSWORD });
check("deleteUser succeeds when the backend erases", okDelete.status === 200, `status ${okDelete.status} ${(await okDelete.text()).slice(0, 100)}`);

const tables = psql(`select table_name from information_schema.columns where table_schema = 'resume_match' and column_name = 'user_id' order by 1`).split("\n");
let leftovers = [];
for (const t of tables) {
  const n = psql(`select count(*) from resume_match.${t} where user_id = '${userId}'`);
  if (n !== "0") leftovers.push(`${t}=${n}`);
}
check("zero app rows left for the user in every table with user_id", leftovers.length === 0, `${tables.length} tables checked ${leftovers.join(",")}`);
check("Better Auth user and sessions gone",
  psql(`select count(*) from resume_match."user" where id = '${userId}'`) === "0" &&
  psql(`select count(*) from resume_match.session where "userId" = '${userId}'`) === "0");
const files = fs.existsSync(path.join(BACKEND_DIR, ".local_storage")) ? execFileSync("powershell", ["-NoProfile", "-Command", `(Get-ChildItem -Recurse -File '${BACKEND_DIR}/.local_storage/resumes/${userId}' -ErrorAction SilentlyContinue | Measure-Object).Count`], { encoding: "utf8" }).trim() : "0";
check("no stored objects left under the user's prefix", files === "0" || files === "", `files=${files}`);
const signIn2 = await auth("/sign-in/email", { email: EMAIL, password: PASSWORD });
check("sign-in no longer works", signIn2.status >= 400, `status ${signIn2.status}`);

// ── 3) Re-register the same email: 0 credits ──
const again = await registerAndSignIn();
const payload2 = JSON.parse(Buffer.from(again.token.split(".")[1], "base64url").toString());
const credits2 = await (await api(again.token, "/v1/credits")).json();
check("re-registering the same email starts with 0 credits", credits2.balance === 0, JSON.stringify(credits2));
console.log(`new user id ${payload2.sub}`);

console.log(failures === 0 ? "\nALL DELETE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
