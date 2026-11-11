"""Writes a realistic test corpus for the live (real OpenAI / Firecrawl) checks of phase 7.

    cd backend && uv run python dev/live_corpus.py <out_dir>

All people and companies are invented. Produces PDFs (text, scanned, cover letter, article,
blank, 6-page), a DOCX and TXT resume, and pasted-text job postings.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import pymupdf

# ── Texts ───────────────────────────────────────────────────────────────────

RESUME_MAYA = [
    ("name", "Maya Okafor"),
    ("small", "Austin, TX  |  maya.okafor@example.com  |  +1 512 555 0148  |  linkedin.com/in/mayaokafor-demo"),
    ("h", "PROFESSIONAL SUMMARY"),
    ("p", "Data engineer with seven years of experience building batch and streaming pipelines for "
          "e-commerce and fintech teams. Strong in Python, SQL and Airflow, with a record of cutting "
          "warehouse costs while improving data freshness."),
    ("h", "EXPERIENCE"),
    ("role", "Senior Data Engineer, Brightcart Inc., Austin TX  (Mar 2022 - Present)"),
    ("b", "Redesigned the order-events pipeline on Kafka and Spark, reducing end-to-end latency from 45 minutes to 4 minutes."),
    ("b", "Led migration of 120 Airflow DAGs to a containerised deployment, cutting failed runs by 63%."),
    ("b", "Introduced dbt tests and data contracts across 14 domains; incident tickets about bad data fell by 40%."),
    ("b", "Mentored three junior engineers and ran the weekly data quality review."),
    ("role", "Data Engineer, Ledgerly, Remote  (Jun 2019 - Feb 2022)"),
    ("b", "Built ELT pipelines loading 2 TB/day from payment processors into Snowflake using Python and Fivetran."),
    ("b", "Reduced monthly Snowflake spend by 28% through clustering, query tuning and auto-suspend policies."),
    ("b", "Created a reconciliation service in Python that matched 99.8% of transactions automatically."),
    ("role", "Junior Analyst, Northwind Retail, Dallas TX  (Aug 2017 - May 2019)"),
    ("b", "Wrote SQL reports for merchandising and automated weekly dashboards in Tableau."),
    ("b", "Cleaned and joined point-of-sale data from 300 stores for demand forecasting."),
    ("h", "EDUCATION"),
    ("p", "B.S. Computer Science, University of Texas at Austin, 2017"),
    ("h", "SKILLS"),
    ("p", "Python, SQL, Spark, Kafka, Airflow, dbt, Snowflake, BigQuery, Docker, Kubernetes, Terraform, AWS (S3, Glue, EMR), Tableau"),
    ("h", "CERTIFICATIONS"),
    ("p", "AWS Certified Data Analytics - Specialty (2023); dbt Analytics Engineering Certification (2022)"),
]

RESUME_DANIEL = [  # junior, sparse, informal layout
    ("name", "Daniel Reyes"),
    ("small", "Chicago, IL | daniel.reyes@example.com | 312-555-0191"),
    ("h", "OBJECTIVE"),
    ("p", "Recent graduate looking for an entry-level software developer role where I can learn and contribute."),
    ("h", "EDUCATION"),
    ("p", "B.A. Information Systems, DePaul University, graduated May 2025. GPA 3.4."),
    ("h", "PROJECTS"),
    ("b", "Campus Rides: React and Node app that matches students for carpooling; 200 active users."),
    ("b", "Budget Buddy: Python script that categorises bank CSV exports and charts monthly spending."),
    ("h", "WORK"),
    ("role", "Barista, Lakeview Coffee (2022 - 2025)"),
    ("b", "Handled up to 80 orders per hour and trained four new hires."),
    ("role", "IT Help Desk Intern, DePaul University (Summer 2024)"),
    ("b", "Resolved 150+ tickets for student laptops and Wi-Fi access."),
    ("h", "SKILLS"),
    ("p", "JavaScript, React, Node.js, Python, Git, SQL basics, Excel"),
]

COVER_LETTER = [
    ("p", "Dear Hiring Manager,"),
    ("p", "I am writing to express my strong interest in the Senior Data Engineer position at "
          "Orbital Freight Systems, which I found on your careers page. With seven years of "
          "experience designing data pipelines, I believe I would be a valuable addition to your team."),
    ("p", "In my current role at Brightcart I led the redesign of our order-events pipeline, and I "
          "am excited by the chance to bring the same approach to your logistics data. I admire "
          "Orbital's commitment to sustainable shipping and would welcome the opportunity to "
          "discuss how my background fits your needs."),
    ("p", "Thank you for your time and consideration. I look forward to hearing from you."),
    ("p", "Sincerely,"),
    ("p", "Maya Okafor"),
]

ARTICLE = [
    ("name", "Why Your Team's Dashboards Are Lying to You"),
    ("small", "Posted by the Data Culture Weekly editorial team"),
    ("p", "Every quarter, a new analytics tool promises a single source of truth. Every quarter, "
          "the numbers in the executive dashboard still disagree with the numbers in finance. "
          "The problem is rarely the tool. It is the unspoken assumptions baked into each metric."),
    ("p", "Consider monthly active users. One team counts anyone who opened the app; another counts "
          "anyone who completed an action. Both are defensible, and neither is wrong, but placing "
          "them on the same chart invites bad decisions. We spoke to a dozen analytics leaders "
          "about how they handle this, and their answers shared a common thread: write the "
          "definition down, put it next to the chart, and make one person responsible for it."),
    ("p", "In this article we walk through three practices that helped the teams we interviewed, "
          "and share a lightweight template for metric definitions that you can adapt today."),
    ("p", "Share this post on social media, and subscribe to our newsletter for more stories."),
]

ABOUT_PAGE = [
    ("name", "About Orbital Freight Systems"),
    ("p", "Orbital Freight Systems is a logistics technology company founded in 2014. We connect "
          "shippers and carriers across North America and believe the supply chain can be both "
          "faster and cleaner. Our platform moves more than two million shipments a year."),
    ("h", "OUR VALUES"),
    ("b", "Customers first"),
    ("b", "Own the outcome"),
    ("b", "Sustainable by default"),
    ("p", "Interested in joining us? Visit our careers page to see what's open, or follow us on LinkedIn."),
]

JD_ORBITAL = (
    "Senior Data Engineer\n"
    "Orbital Freight Systems - Denver, CO (Hybrid) - Full-time\n\n"
    "About the role\n"
    "We are looking for a Senior Data Engineer to own the pipelines that power shipment tracking, "
    "pricing and carrier analytics. You will work with analytics, product and operations teams.\n\n"
    "Responsibilities\n"
    "- Design, build and operate batch and streaming data pipelines on AWS.\n"
    "- Own data quality: tests, contracts and monitoring for the core shipment domain.\n"
    "- Reduce warehouse cost and improve data freshness.\n"
    "- Mentor engineers and review designs.\n\n"
    "Requirements\n"
    "- 5+ years of data engineering experience.\n"
    "- Strong Python and SQL; experience with Airflow and dbt.\n"
    "- Experience with Kafka or other streaming systems.\n"
    "- Familiarity with Snowflake or BigQuery.\n\n"
    "Nice to have\n"
    "- Terraform, Kubernetes, logistics or marketplace experience.\n\n"
    "Benefits\n"
    "- Health, dental and vision; 401(k) match; 20 days PTO; learning budget.\n"
)

JD_JUNIOR_DEV = (
    "Junior Software Developer, Harbor Apps (Chicago, IL, on-site, full-time). "
    "Harbor Apps is hiring a junior developer to join our product team. You will build features "
    "in React and Node.js, fix bugs and write tests with guidance from senior engineers. "
    "Requirements: a degree or equivalent experience, familiarity with JavaScript and Git, "
    "and curiosity. Nice to have: SQL, Python. We offer mentoring, health insurance and a "
    "learning stipend."
)

# ── Rendering ───────────────────────────────────────────────────────────────

_FONT = {"name": ("hebo", 20), "small": ("helv", 9.5), "h": ("hebo", 11.5), "role": ("hebo", 10.5),
         "p": ("helv", 10.5), "b": ("helv", 10.5)}


def _wrap(text: str, font: str, size: float, width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if pymupdf.get_text_length(trial, fontname=font, fontsize=size) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def render_pdf(blocks: list[tuple[str, str]], *, min_pages: int = 1) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    margin, y = 54.0, 62.0
    width = page.rect.width - 2 * margin
    for style, text in blocks:
        font, size = _FONT[style]
        indent = 14.0 if style == "b" else 0.0
        if style in ("h",):
            y += 8
        lines = _wrap(text, font, size, width - indent)
        for i, line in enumerate(lines):
            if y > page.rect.height - 60:
                page = doc.new_page()
                y = 62.0
            if style == "b" and i == 0:
                page.insert_text((margin + 2, y), "-", fontname="helv", fontsize=size)
            page.insert_text((margin + indent, y), line, fontname=font, fontsize=size)
            y += size * 1.35
        y += 3
    while doc.page_count < min_pages:
        doc.new_page().insert_text((54, 80), "Additional page", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


def scan_of(pdf: bytes, dpi: int = 110) -> bytes:
    """An image-only PDF (no text layer): grey, JPEG-compressed page images."""
    src = pymupdf.open(stream=pdf, filetype="pdf")
    out = pymupdf.open()
    for page in src:
        pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
        jpeg = pix.tobytes("jpeg", jpg_quality=55)
        new = out.new_page(width=page.rect.width, height=page.rect.height)
        new.insert_image(new.rect, stream=jpeg)
    data = out.tobytes()
    src.close()
    out.close()
    return data


def docx_of(blocks: list[tuple[str, str]]) -> bytes:
    from docx import Document

    doc = Document()
    for style, text in blocks:
        if style == "name":
            doc.add_heading(text, level=0)
        elif style == "h":
            doc.add_heading(text.title(), level=2)
        elif style == "b":
            doc.add_paragraph(text, style="List Bullet")
        else:
            doc.add_paragraph(text)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def plain(blocks: list[tuple[str, str]]) -> str:
    return "\n".join(("- " if s == "b" else "") + t for s, t in blocks)


def blank_pdf() -> bytes:
    doc = pymupdf.open()
    doc.new_page()
    data = doc.tobytes()
    doc.close()
    return data


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    maya = render_pdf(RESUME_MAYA)
    files: dict[str, bytes | str] = {
        "resume_maya.pdf": maya,
        "resume_maya_scanned.pdf": scan_of(maya),
        "resume_maya.docx": docx_of(RESUME_MAYA),
        "resume_maya.txt": plain(RESUME_MAYA),
        "resume_daniel.pdf": render_pdf(RESUME_DANIEL),
        "cover_letter.pdf": render_pdf(COVER_LETTER),
        "article.pdf": render_pdf(ARTICLE),
        "company_about.pdf": render_pdf(ABOUT_PAGE),
        "blank.pdf": blank_pdf(),
        "resume_6pages.pdf": render_pdf(RESUME_MAYA, min_pages=6),
        "jd_orbital.txt": JD_ORBITAL,
        "jd_junior.txt": JD_JUNIOR_DEV,
        "jd_as_resume.pdf": render_pdf([("p", JD_ORBITAL.replace("\n\n", "\n"))]),
    }
    for name, content in files.items():
        path = out / name
        if isinstance(content, str):
            path.write_text(content, encoding="utf-8")
        else:
            path.write_bytes(content)
    (out / "resume_big.pdf").write_bytes(b"%PDF-1.4\n" + b"0" * (6 * 1024 * 1024))
    print("wrote", sorted(p.name for p in out.iterdir()))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
