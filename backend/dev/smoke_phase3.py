"""End-to-end smoke test over real HTTP: dev server (fake AI) + dev JWT, the whole API surface.

    cd backend
    docker compose -f docker-compose.dev.yml up -d && uv run alembic upgrade head
    uv run python dev/smoke_phase3.py

It starts ``dev/dev_server.py`` on a spare port (own user, throwaway signing key, fake OpenAI and
Firecrawl), drives: resume + JD uploads (with SSE progress), a Job Fit match, tailored bullets,
a cover letter, a 3-resume screening, history/overview/credits, the data export ZIP, delete of a
match (resume and JD survive), and finally the internal erase, and prints one line per check.
Exits non-zero on the first failed check. Only ever talks to the local dev database.
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import httpx

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from tests.fakes import JD_TEXT, make_pdf, unique_resume_text  # noqa: E402

PORT = int(os.environ.get("SMOKE_PORT", "8011"))
BASE = f"http://127.0.0.1:{PORT}"
# A fresh user every run: the final erase records the email's hash, so reusing a user would
# (correctly) start the next run with 0 credits.
USER = f"smoke-{int(time.time())}"
INTERNAL_KEY = "smoke-internal-key"


def check(label: str, condition: bool, detail: object = "") -> None:
    print(f"{'PASS' if condition else 'FAIL'}  {label}" + (f"  [{detail}]" if not condition and detail != "" else ""))
    if not condition:
        raise SystemExit(1)


def start_server() -> tuple[subprocess.Popen[str], str]:
    env = {
        **os.environ,
        "PORT": str(PORT),
        "DEV_USER": USER,
        "DEV_FAKE_DELAY": "0.05",
        "INTERNAL_API_KEY": INTERNAL_KEY,
        "STORAGE_LOCAL_DIR": str(BACKEND / ".local_storage_smoke"),
        "PYTHONUNBUFFERED": "1",
    }
    # Server output goes to a file, not a pipe: a pipe nobody reads fills up and blocks the
    # server's event loop on its next log line.
    log_path = Path(tempfile.gettempdir()) / "resumatch-smoke-server.log"
    log_path.write_text("")
    log_file = log_path.open("w", encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, str(BACKEND / "dev" / "dev_server.py")],
        cwd=BACKEND,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    token = ""
    deadline = time.time() + 60
    while time.time() < deadline and proc.poll() is None:
        text = log_path.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"^([\w-]+\.[\w-]+\.[\w-]+)$", text, re.MULTILINE)
        if match and "Application startup complete" in text:
            token = match.group(1)
            break
        time.sleep(0.3)
    check(f"dev server started and printed a JWT (log: {log_path})", bool(token))
    return proc, token


def wait_job(client: httpx.Client, headers: dict[str, str], job_id: str) -> dict:
    """Read the SSE stream to the end (as the browser will), return the final snapshot."""
    events: list[tuple[str, dict]] = []
    with client.stream("GET", f"/v1/jobs/{job_id}/events", headers=headers, timeout=60) as stream:
        name = ""
        for line in stream.iter_lines():
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: ") and name:
                events.append((name, json.loads(line[6:])))
    check(f"  SSE stream for {job_id[:8]} ended with a terminal event", events[-1][0] in ("succeeded", "failed"))
    snapshot = client.get(f"/v1/jobs/{job_id}", headers=headers).json()
    snapshot["_events"] = events
    return snapshot


def main() -> None:
    proc, token = start_server()
    headers = {"Authorization": f"Bearer {token}"}
    try:
        with httpx.Client(base_url=BASE, timeout=30) as client:
            check("GET /health", client.get("/health").json() == {"status": "ok"})
            check("no token -> 401", client.get("/v1/credits").status_code == 401)
            check("signup credits are 10", client.get("/v1/credits", headers=headers).json()["balance"] == 10)

            # Documents (candidate mode) -------------------------------------------------------
            up = client.post("/v1/resumes", headers=headers, data={"mode": "candidate"},
                             files={"file": ("jane.pdf", make_pdf(text=unique_resume_text(901)), "application/pdf")})
            check("resume upload -> 202", up.status_code == 202, up.text)
            job = wait_job(client, headers, up.json()["job_id"])
            check("resume job succeeded", job["status"] == "succeeded", job)
            check("  progress steps seen", [e[1]["name"] for e in job["_events"] if e[0] == "step"][:1] == ["parsing"])
            resume = job["result"]["resume"]

            jd_post = client.post("/v1/job-descriptions", headers=headers, json={"text": JD_TEXT + " 901", "mode": "candidate"})
            jd = wait_job(client, headers, jd_post.json()["job_id"])["result"]["job_description"]
            check("job description stored", jd["jd_object"]["job_title"] == "Senior Backend Engineer")

            # Job Fit match --------------------------------------------------------------------
            m = client.post("/v1/matches", headers=headers, json={"resume_id": resume["id"], "jd_id": jd["id"]})
            check("POST /v1/matches -> 202", m.status_code == 202, m.text)
            mjob = wait_job(client, headers, m.json()["job_id"])
            check("match job succeeded", mjob["status"] == "succeeded", mjob)
            match_id = mjob["result"]["match_id"]
            check("credit charged (10 -> 9)", client.get("/v1/credits", headers=headers).json()["balance"] == 9)

            detail = client.get(f"/v1/matches/{match_id}", headers=headers).json()
            check("GET /v1/matches/{id} has the full report", "ats_optimization" in detail["report"])

            # Tailored bullets (free) + cover letter (1 credit) --------------------------------
            b = wait_job(client, headers, client.post(f"/v1/matches/{match_id}/tailored-bullets", headers=headers).json()["job_id"])
            check("tailored bullets generated", b["status"] == "succeeded" and b["result"]["document"]["kind"] == "tailored_bullets")
            check("bullets cost nothing", client.get("/v1/credits", headers=headers).json()["balance"] == 9)
            check("bullets only once", client.post(f"/v1/matches/{match_id}/tailored-bullets", headers=headers).status_code == 409)
            c = wait_job(client, headers, client.post(f"/v1/matches/{match_id}/cover-letter", headers=headers).json()["job_id"])
            check("cover letter generated", c["status"] == "succeeded" and "Dear Acme" in c["result"]["document"]["content"]["text"])
            check("cover letter cost 1 (9 -> 8)", client.get("/v1/credits", headers=headers).json()["balance"] == 8)
            check("match detail lists both documents", len(client.get(f"/v1/matches/{match_id}", headers=headers).json()["documents"]) == 2)

            # Screening (recruiter mode) -------------------------------------------------------
            ids = []
            for n in range(3):
                r = client.post("/v1/resumes", headers=headers, data={"mode": "recruiter"},
                                files={"file": (f"cand{n}.pdf", make_pdf(text=unique_resume_text(910 + n)), "application/pdf")})
                ids.append(wait_job(client, headers, r.json()["job_id"])["result"]["resume_id"])
            rjd = client.post("/v1/job-descriptions", headers=headers, json={"text": JD_TEXT + " 902", "mode": "recruiter"})
            rjd_id = wait_job(client, headers, rjd.json()["job_id"])["result"]["jd_id"]
            s = client.post("/v1/screenings", headers=headers, json={"resume_ids": ids, "jd_id": rjd_id})
            check("POST /v1/screenings -> 202", s.status_code == 202, s.text)
            sjob = wait_job(client, headers, s.json()["job_id"])
            check("screening succeeded with 3 ranked", sjob["status"] == "succeeded" and len(sjob["result"]["ranked"]) == 3, sjob)
            check("  one progress step per resume", len([e for e in sjob["_events"] if e[0] == "step" and e[1]["name"].startswith("score:")]) >= 6)
            check("credits 8 -> 5", client.get("/v1/credits", headers=headers).json()["balance"] == 5)

            # Reads ---------------------------------------------------------------------------
            hist = client.get("/v1/matches", headers=headers)
            check("history: 4 matches newest first, total header", len(hist.json()) == 4 and hist.headers["x-total-count"] == "4")
            ov = client.get("/v1/overview", headers=headers).json()
            check("overview counts", ov["counts"] == {"resumes": 4, "job_descriptions": 2, "matches": 4} and ov["balance"] == 5, ov)
            tx = client.get("/v1/credits/transactions", headers=headers).json()
            check("ledger: bonus + match + cover letter + 3 screening", len(tx) == 6, [t["transaction_type"] for t in tx])

            # Export --------------------------------------------------------------------------
            ex = client.get("/v1/account/export", headers=headers)
            check("export -> zip", ex.status_code == 200 and ex.headers["content-type"] == "application/zip")
            names = zipfile.ZipFile(io.BytesIO(ex.content)).namelist()
            check("  zip has the plan's files", {"profile.json", "resumes.json", "job_descriptions.json", "matches.json",
                                                  "generated_documents.json", "credit_transactions.json", "README.txt"} <= set(names), names)
            again = client.get("/v1/account/export", headers=headers)
            check("second export within the hour -> 429", again.status_code == 429 and again.json()["code"] == "EXPORT_RATE_LIMITED")

            # Delete only the match -----------------------------------------------------------
            check("DELETE match -> 204", client.delete(f"/v1/matches/{match_id}", headers=headers).status_code == 204)
            check("  resume survives", any(r["id"] == resume["id"] for r in client.get("/v1/resumes", headers=headers).json()))
            check("  job description survives", client.get(f"/v1/job-descriptions/{jd['id']}", headers=headers).status_code == 200)
            check("  match is gone", client.get(f"/v1/matches/{match_id}", headers=headers).status_code == 404)

            # Internal erase ------------------------------------------------------------------
            erase_url, body = f"/internal/users/{USER}", {"email": f"{USER}@example.test"}
            check("erase with a user JWT -> 403", client.request("DELETE", erase_url, json=body, headers=headers).status_code == 403)
            check("erase with a wrong key -> 403", client.request("DELETE", erase_url, json=body, headers={"X-Internal-Key": "nope"}).status_code == 403)
            gone = client.request("DELETE", erase_url, json=body, headers={"X-Internal-Key": INTERNAL_KEY})
            check("erase with the key -> 200", gone.status_code == 200, gone.text)
            check("  rows removed", gone.json()["deleted"]["resumes"] == 4 and gone.json()["objects_deleted"] == 4, gone.json())
            check("  nothing left to read", client.get("/v1/resumes", headers=headers).json() == [] and client.get("/v1/matches", headers=headers).json() == [])
            check("  re-registering this email gets 0 credits", client.get("/v1/credits", headers=headers).json()["balance"] == 0)
        print("\nSmoke test passed.")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(BACKEND / ".local_storage_smoke", ignore_errors=True)


if __name__ == "__main__":
    main()
