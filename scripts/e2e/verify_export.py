"""Checks that a data-export ZIP opens and matches what the app shows (phase 7).

    python scripts/e2e/verify_export.py <export.zip> <dump_dir> <corpus_dir>

<dump_dir> holds app_resumes.json, app_jds.json, app_matches.json, app_transactions.json and
app_balance.json written by e2e-phase7(-export).mjs straight from the API at export time.
<corpus_dir> holds the original uploaded files, to compare the stored copies byte for byte.
"""

from __future__ import annotations

import hashlib
import json
import sys
import zipfile
from datetime import datetime
from pathlib import Path

zip_path, dump_dir, corpus_dir = (Path(a) for a in sys.argv[1:4])
failures = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global failures
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  -> ' + detail if detail else ''}")
    failures += not ok


def norm(value):
    """Timestamps are compared as instants (the API writes 'Z', the ZIP '+00:00')."""
    if isinstance(value, dict):
        return {k: (datetime.fromisoformat(v).timestamp() if k == "created_at" and isinstance(v, str) else norm(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [norm(v) for v in value]
    return value


def app(name: str):
    return json.loads((dump_dir / name).read_text(encoding="utf-8"))


with zipfile.ZipFile(zip_path) as z:
    check("ZIP integrity (CRC of every member)", z.testzip() is None)
    names = z.namelist()
    expected = {"profile.json", "resumes.json", "job_descriptions.json", "matches.json",
                "generated_documents.json", "credit_transactions.json", "README.txt"}
    check("all documented files are present", expected <= set(names), f"missing {sorted(expected - set(names))}")

    def load(name: str):
        return json.loads(z.read(name).decode("utf-8"))

    for name in sorted(n for n in names if n.endswith(".json")):
        try:
            load(name)
            ok = True
        except ValueError:
            ok = False
        check(f"{name} is valid JSON", ok)

    readme = z.read("README.txt").decode("utf-8")
    check("README.txt describes every file", all(n.split("/")[0] in readme for n in expected - {"README.txt"}))

    # profile
    profile = load("profile.json")
    check("profile balance equals the app's balance", profile["credits_balance"] == app("app_balance.json")["balance"],
          f"{profile['credits_balance']}")
    check("profile carries the user id and email", bool(profile["user_id"]) and "@" in (profile["email"] or ""))

    # resumes
    exported = load("resumes.json")
    shown = {r["id"]: r for r in app("app_resumes.json")}
    check("resumes.json lists exactly the resumes the app shows", {r["id"] for r in exported} == set(shown), f"{len(exported)} vs {len(shown)}")
    for r in exported:
        s = shown[r["id"]]
        same = all(r[k] == s[k] for k in ("file_name", "file_size", "mime_type", "num_pages", "num_characters", "num_words", "is_scanned", "mode"))
        check(f"resume {r['file_name']} ({r['mode']}): metadata equals the app", same)
        text = r["extracted_text"] or ""
        # the app counts characters without newlines (as the n8n workflow did) and whitespace-split words
        check(f"  extracted text present ({len(text)} chars) and the counts the app shows are exact",
              bool(text) and len(text.replace("\n", "")) == r["num_characters"] and len(text.split()) == r["num_words"])
        member = r["file_in_export"]
        check("  original file is in the ZIP", member in names, str(member))
        if member in names:
            original = corpus_dir / r["file_name"]
            same_bytes = original.exists() and hashlib.sha256(z.read(member)).digest() == hashlib.sha256(original.read_bytes()).digest()
            check("  file is byte-identical to what was uploaded", same_bytes)
    check("no stray members under resumes/", {n for n in names if n.startswith("resumes/")} == {r["file_in_export"] for r in exported})

    # job descriptions
    jds = load("job_descriptions.json")
    shown_jds = {j["id"]: j for j in app("app_jds.json")}
    check("job_descriptions.json equals the app's list", norm({j["id"]: j for j in jds}) == norm(shown_jds), f"{len(jds)} postings")

    # matches
    matches = load("matches.json")
    app_matches = {m["id"]: m for m in app("app_matches.json")}
    check("matches.json lists exactly the app's matches", {m["id"] for m in matches} == set(app_matches), f"{len(matches)}")
    for m in matches:
        a = app_matches[m["id"]]
        check(f"match {m['id'][:8]} report equals the app (score {m['overall_score_percent']})",
              m["report"] == a["report"] and m["overall_score_percent"] == a["overall_score_percent"] and m["mode"] == a["mode"]
              and m["resume_id"] == a["resume_id"] and m["jd_id"] == a["jd_id"])

    # generated documents
    docs = load("generated_documents.json")
    app_docs = {d["id"]: d for m in app_matches.values() for d in m["documents"]}
    check("generated_documents.json equals the documents shown in the reports", {d["id"]: (d["kind"], d["match_id"], d["content"]) for d in docs} == {i: (d["kind"], d["match_id"], d["content"]) for i, d in app_docs.items()} and len(docs) > 0,
          f"{len(docs)} documents: {sorted(d['kind'] for d in docs)}")

    # ledger
    tx = load("credit_transactions.json")
    app_tx = app("app_transactions.json")
    check("credit_transactions.json equals the ledger", sorted(t["id"] for t in tx) == sorted(t["id"] for t in app_tx), f"{len(tx)} rows")
    check("ledger sums to the balance", sum(t["credits_delta"] for t in tx) == profile["credits_balance"])

print("\nALL EXPORT CHECKS PASSED" if not failures else f"\n{failures} CHECK(S) FAILED")
sys.exit(1 if failures else 0)
