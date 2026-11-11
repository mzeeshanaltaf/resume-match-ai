"""Writes sample resumes for the phase 4 end-to-end run (run from backend/ with uv)."""
import sys
from pathlib import Path

sys.path.insert(0, ".")  # run from backend/: uv run python ../scripts/e2e/make_samples.py ../scripts/e2e/samples
from tests.fakes import JD_TEXT, make_pdf, unique_resume_text  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for i in range(1, 5):
    (out / f"resume_{i}.pdf").write_bytes(make_pdf(1, unique_resume_text(1000 + i)))
(out / "resume_6pages.pdf").write_bytes(make_pdf(6, unique_resume_text(2000)))
(out / "resume_big.pdf").write_bytes(b"%PDF-1.4\n" + b"0" * (6 * 1024 * 1024))
(out / "resume.txt").write_text(unique_resume_text(3000), encoding="utf-8")
(out / "jd.txt").write_text(JD_TEXT + " Posting ref E2E-1.", encoding="utf-8")
print("ok", sorted(p.name for p in out.iterdir()))
