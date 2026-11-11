from __future__ import annotations

import hashlib
import uuid
from collections.abc import AsyncIterator, Callable

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import UserResume
from app.services.documents import resume_checksum
from app.services.storage import resume_key
from tests.conftest import Pipeline
from tests.fakes import (
    RESUME_TEXT,
    make_docx,
    make_password_pdf,
    make_pdf,
    make_scanned_pdf,
    unique_resume_text,
)


async def _row_count(sessionmaker: async_sessionmaker[AsyncSession]) -> int:
    async with sessionmaker() as session:
        return int(await session.scalar(select(func.count()).select_from(UserResume)) or 0)


async def _stored_keys(p: Pipeline) -> list[str]:
    return [info.key async for info in p.storage.list_objects("resumes/")]


# ── happy paths ─────────────────────────────────────────────────────────────


async def test_upload_text_pdf_end_to_end(pipeline: Pipeline) -> None:
    data = make_pdf(pages=2)
    response = await pipeline.upload(data, "Jane CV.pdf")
    assert response.status_code == 202
    body = response.json()
    assert set(body) == {"job_id", "status"}

    job = await pipeline.finish(response)
    assert job["status"] == "succeeded"
    assert [(s["name"], s["status"]) for s in job["steps"]] == [
        ("parsing", "done"),
        ("validating", "done"),
        ("saving", "done"),
    ]
    resume = job["result"]["resume"]
    assert resume["file_name"] == "Jane CV.pdf" and resume["mime_type"] == "application/pdf"
    assert (resume["num_pages"], resume["is_scanned"], resume["mode"]) == (2, False, "candidate")
    assert resume["file_size"] == len(data) and resume["num_words"] > 10

    # file stored in object storage, row holds the key and the text
    key = resume_key("user-1", resume["id"])
    assert await _stored_keys(pipeline) == [key]
    async with pipeline.runner.sessionmaker() as session:
        row = (await session.scalars(select(UserResume))).one()
    assert row.storage_key == key and "Jane Candidate" in row.file_text
    assert row.checksum == resume_checksum(data, True, "user-1")
    assert "probability" in row.reasoning

    # the document went to the gate as text (an upstream call), never stored text-less
    assert pipeline.llm.decide_calls[0]["input"] == row.file_text


async def test_upload_docx_and_txt(pipeline: Pipeline) -> None:
    docx = await pipeline.upload_ok(make_docx(unique_resume_text(1)), "cv.docx")
    txt = await pipeline.upload_ok(unique_resume_text(2).encode(), "cv.txt", mode="recruiter")
    assert docx["mime_type"].endswith("wordprocessingml.document") and docx["mode"] == "candidate"
    assert txt["mime_type"] == "text/plain" and txt["mode"] == "recruiter" and txt["num_pages"] is None


async def test_file_type_is_decided_by_bytes_not_name_or_content_type(pipeline: Pipeline) -> None:
    resume = await pipeline.upload_ok(make_pdf(), "totally-a-photo.jpg")
    assert resume["mime_type"] == "application/pdf"
    response = await pipeline.upload(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "resume.pdf")
    assert response.status_code == 415 and response.json()["code"] == "UNSUPPORTED_TYPE"


async def test_scanned_pdf_goes_through_vision_ocr_and_completes(pipeline: Pipeline) -> None:
    pipeline.llm.ocr_text = unique_resume_text(7)
    data = make_scanned_pdf(pages=2)
    job = await pipeline.finish(await pipeline.upload(data, "scan.pdf"))

    assert job["status"] == "succeeded", job
    assert [s["name"] for s in job["steps"]] == ["parsing", "ocr", "validating", "saving"]
    resume = job["result"]["resume"]
    assert resume["is_scanned"] is True and resume["num_pages"] == 2
    assert pipeline.llm.text_calls[0]["task"] == "ocr"
    async with pipeline.runner.sessionmaker() as session:
        row = (await session.scalars(select(UserResume))).one()
    assert row.is_scanned and row.file_text == unique_resume_text(7)  # OCR text is what's stored
    assert pipeline.llm.decide_calls[0]["input"] == row.file_text  # and what the gate sees


async def test_unreadable_scan_is_rejected_and_not_stored(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    pipeline.llm.ocr_text = ""
    job = await pipeline.finish(await pipeline.upload(make_scanned_pdf(), "scan.pdf"))
    assert job["status"] == "failed" and job["error"]["code"] == "UNREADABLE_DOCUMENT"
    assert await _row_count(sessionmaker) == 0 and await _stored_keys(pipeline) == []
    assert pipeline.llm.decide_calls == []  # no gate call for text that doesn't exist


# ── limits, in order ────────────────────────────────────────────────────────


async def test_oversized_file_is_refused_413(make_pipeline: Callable[..., Pipeline]) -> None:
    p = make_pipeline(max_upload_bytes=2000, upload_overhead_bytes=500)
    response = await p.upload(b"A" * 2001)  # a real (declared) body over the file cap
    assert response.status_code == 413
    assert response.json()["code"] == "FILE_TOO_LARGE"
    assert response.json()["details"] == {"max_bytes": 2000}
    assert p.llm.decide_calls == [] and await _stored_keys(p) == []


async def test_file_just_over_the_cap_but_inside_the_framing_allowance(
    make_pipeline: Callable[..., Pipeline],
) -> None:
    """Total body under cap+overhead, but the file part itself exceeds MAX_UPLOAD_BYTES."""
    p = make_pipeline(max_upload_bytes=2000, upload_overhead_bytes=5000)
    response = await p.upload(b"A" * 2001)
    assert response.status_code == 413 and response.json()["code"] == "FILE_TOO_LARGE"


async def test_file_exactly_at_the_cap_is_accepted(make_pipeline: Callable[..., Pipeline]) -> None:
    text = (unique_resume_text(3) + "\n").encode()
    p = make_pipeline(max_upload_bytes=len(text), upload_overhead_bytes=2000)
    assert (await p.upload(text, "r.txt")).status_code == 202


async def test_streamed_body_is_cut_off_without_being_buffered(
    make_pipeline: Callable[..., Pipeline],
) -> None:
    """A chunked 100 MB body (no Content-Length) must be aborted soon after the cap."""
    p = make_pipeline()  # real 5 MB cap
    cap = p.settings.max_upload_bytes + p.settings.upload_overhead_bytes
    chunk = 256 * 1024
    target = 100 * 1024 * 1024
    sent = 0

    async def body() -> AsyncIterator[bytes]:
        nonlocal sent
        head = (
            b'--xyz\r\nContent-Disposition: form-data; name="file"; filename="big.pdf"\r\n'
            b"Content-Type: application/pdf\r\n\r\n"
        )
        sent += len(head)
        yield head
        while sent < target:
            sent += chunk
            yield b"A" * chunk

    response = await p.client.post(
        "/v1/resumes",
        content=body(),
        headers={**p.headers(), "Content-Type": "multipart/form-data; boundary=xyz"},
    )
    assert response.status_code == 413 and response.json()["code"] == "FILE_TOO_LARGE"
    assert cap < sent <= cap + 3 * chunk, f"server consumed {sent} bytes of a {target}-byte body"
    assert sent < target / 10


async def test_declared_content_length_over_the_cap_is_refused_before_reading(
    make_pipeline: Callable[..., Pipeline],
) -> None:
    p = make_pipeline(max_upload_bytes=1000, upload_overhead_bytes=100)
    consumed = 0

    async def body() -> AsyncIterator[bytes]:
        nonlocal consumed
        consumed += 1
        yield b"x" * 10

    response = await p.client.post(
        "/v1/resumes",
        content=body(),
        headers={**p.headers(), "Content-Type": "multipart/form-data; boundary=xyz", "Content-Length": "5000"},
    )
    assert response.status_code == 413 and consumed == 0


async def test_six_page_pdf_is_refused_422(pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
    response = await pipeline.upload(make_pdf(pages=6))
    assert response.status_code == 422
    assert response.json()["code"] == "PAGE_LIMIT_EXCEEDED"
    assert response.json()["details"] == {"pages": 6, "max_pages": 5}
    # refused inline: no job, no AI call, nothing stored
    assert pipeline.llm.decide_calls == [] and pipeline.llm.text_calls == []
    assert await _row_count(sessionmaker) == 0 and await _stored_keys(pipeline) == []


async def test_five_page_pdf_is_accepted(pipeline: Pipeline) -> None:
    assert (await pipeline.upload_ok(make_pdf(pages=5)))["num_pages"] == 5


async def test_page_limit_is_a_setting(make_pipeline: Callable[..., Pipeline]) -> None:
    p = make_pipeline(max_resume_pages=1)
    assert (await p.upload(make_pdf(pages=2))).status_code == 422


async def test_character_limit_fails_the_job_before_the_gate(
    make_pipeline: Callable[..., Pipeline], sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    p = make_pipeline(max_resume_chars=500)
    long_text = (RESUME_TEXT + "\n") * 5
    job = await p.finish(await p.upload(long_text.encode(), "long.txt"))
    assert job["status"] == "failed" and job["error"]["code"] == "TEXT_LIMIT_EXCEEDED"
    assert job["error"]["details"]["max_characters"] == 500
    assert p.llm.decide_calls == []  # refused before it could cost a model call
    assert await _row_count(sessionmaker) == 0

    short = unique_resume_text(1).encode()
    assert len(short) <= 500
    assert (await p.upload_ok(short, "ok.txt"))["num_characters"] > 0


async def test_per_user_resume_cap(make_pipeline: Callable[..., Pipeline]) -> None:
    p = make_pipeline(max_resumes_per_user=2)
    await p.upload_ok(unique_resume_text(1).encode(), "a.txt")
    await p.upload_ok(unique_resume_text(2).encode(), "b.txt")
    response = await p.upload(unique_resume_text(3).encode(), "c.txt")
    assert response.status_code == 409 and response.json()["code"] == "RESUME_LIMIT_REACHED"
    # the cap is per user
    assert (await p.upload(unique_resume_text(3).encode(), "c.txt", sub="user-2")).status_code == 202
    # deleting one frees a slot
    listing = (await p.client.get("/v1/resumes", headers=p.headers())).json()
    await p.client.delete(f"/v1/resumes/{listing[0]['id']}", headers=p.headers())
    assert (await p.upload(unique_resume_text(3).encode(), "c.txt")).status_code == 202


async def test_password_protected_and_corrupt_pdfs(pipeline: Pipeline) -> None:
    protected = await pipeline.upload(make_password_pdf())
    assert protected.status_code == 422 and protected.json()["code"] == "PDF_PASSWORD_PROTECTED"
    corrupt = await pipeline.upload(b"%PDF-1.4 garbage")
    assert corrupt.status_code == 422 and corrupt.json()["code"] == "UNREADABLE_DOCUMENT"
    assert (await pipeline.upload(b"")).json()["code"] == "EMPTY_FILE"


# ── request validation ──────────────────────────────────────────────────────


async def test_mode_is_required_and_validated(pipeline: Pipeline) -> None:
    for mode in (None, "admin"):
        response = await pipeline.upload(make_pdf(), mode=mode)
        assert response.status_code == 422 and response.json()["code"] == "VALIDATION_ERROR"
        assert response.json()["details"][0]["loc"] == ["body", "mode"]


async def test_missing_file_and_wrong_content_type(pipeline: Pipeline) -> None:
    no_file = await pipeline.client.post("/v1/resumes", data={"mode": "candidate"}, files={"x": ("a", b"b")},
                                         headers=pipeline.headers())
    assert no_file.status_code == 422 and no_file.json()["details"][0]["loc"] == ["body", "file"]
    wrong = await pipeline.client.post("/v1/resumes", json={"mode": "candidate"}, headers=pipeline.headers())
    assert wrong.status_code == 400 and wrong.json()["code"] == "BAD_REQUEST"


async def test_requires_auth(pipeline: Pipeline) -> None:
    for method, path in (
        ("POST", "/v1/resumes"),
        ("GET", "/v1/resumes"),
        ("GET", f"/v1/resumes/{uuid.uuid4()}/file"),
        ("DELETE", f"/v1/resumes/{uuid.uuid4()}"),
    ):
        response = await pipeline.client.request(method, path)
        assert response.status_code == 401, (method, path)


# ── validation gate ─────────────────────────────────────────────────────────


async def test_invalid_resume_is_rejected_with_a_specific_message_and_not_stored(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    pipeline.llm.resume_probability, pipeline.llm.resume_type = 0.04, "cover_letter"
    job = await pipeline.finish(await pipeline.upload(make_pdf(text="Dear hiring manager, I am writing to apply..."), "cl.pdf"))
    assert job["status"] == "failed"
    assert job["error"]["code"] == "INVALID_RESUME"
    assert job["error"]["message"] == "This looks like a cover letter, not a resume."
    assert [(s["name"], s["status"]) for s in job["steps"]][-1] == ("validating", "failed")
    assert await _row_count(sessionmaker) == 0 and await _stored_keys(pipeline) == []

    # and a rejected document can be retried later (it left no dedup record)
    pipeline.llm.resume_probability, pipeline.llm.resume_type = 0.95, "resume"
    again = await pipeline.finish(await pipeline.upload(make_pdf(text="Dear hiring manager, I am writing to apply..."), "cl.pdf"))
    assert again["status"] == "succeeded"


async def test_decision_threshold_boundary_through_the_api(make_pipeline: Callable[..., Pipeline]) -> None:
    p = make_pipeline(decision_min_probability=0.8)
    p.llm.resume_probability = 0.79
    assert (await p.finish(await p.upload(unique_resume_text(1).encode(), "a.txt")))["status"] == "failed"
    p.llm.resume_probability = 0.8
    assert (await p.finish(await p.upload(unique_resume_text(1).encode(), "a.txt")))["status"] == "succeeded"


async def test_blank_text_file_is_rejected_without_a_model_call(pipeline: Pipeline) -> None:
    job = await pipeline.finish(await pipeline.upload(b"   \n \n", "blank.txt"))
    assert job["status"] == "failed" and job["error"]["code"] == "INVALID_RESUME"
    assert pipeline.llm.decide_calls == []


async def test_upstream_llm_failure_fails_the_job_and_stores_nothing(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    from app.errors import AppError

    pipeline.llm.error = AppError(504, "LLM_TIMEOUT", "slow")
    job = await pipeline.finish(await pipeline.upload(make_pdf()))
    assert job["status"] == "failed" and job["error"]["code"] == "LLM_TIMEOUT"
    assert await _row_count(sessionmaker) == 0 and await _stored_keys(pipeline) == []


# ── dedup ───────────────────────────────────────────────────────────────────


async def test_dedup_per_user_and_checksum(pipeline: Pipeline) -> None:
    data = make_pdf()
    first = await pipeline.upload_ok(data, "cv.pdf")

    again = await pipeline.upload(data, "renamed.pdf")  # same bytes, new name
    assert again.status_code == 409
    assert again.json()["code"] == "DUPLICATE_RESUME"
    assert again.json()["details"]["resume_id"] == first["id"]

    # same file, other user: independent record (checksum is per user)
    other = await pipeline.upload_ok(data, "cv.pdf", sub="user-2")
    assert other["id"] != first["id"]

    # same file in the other mode counts as different (mode is part of the hash)
    assert (await pipeline.upload(data, "cv.pdf", mode="recruiter")).status_code == 202


def test_checksum_matches_the_n8n_recipe() -> None:
    data = b"hello"
    inner = hashlib.sha256(data).hexdigest()
    assert resume_checksum(data, True, "u1") == hashlib.sha256(f"{inner}trueu1".encode()).hexdigest()
    assert resume_checksum(data, False, "u1") == hashlib.sha256(f"{inner}falseu1".encode()).hexdigest()


# ── list / file / delete / isolation ────────────────────────────────────────


async def test_list_is_ordered_newest_first_metadata_only_and_empty_is_a_list(pipeline: Pipeline) -> None:
    empty = await pipeline.client.get("/v1/resumes", headers=pipeline.headers())
    assert empty.status_code == 200 and empty.json() == []

    for n in range(3):
        await pipeline.upload_ok(unique_resume_text(n).encode(), f"r{n}.txt")
    rows = (await pipeline.client.get("/v1/resumes", headers=pipeline.headers())).json()
    assert [r["file_name"] for r in rows] == ["r2.txt", "r1.txt", "r0.txt"]
    forbidden = {"file_text", "file_binary_data", "storage_key", "checksum", "user_id", "base64"}
    assert not forbidden & set(rows[0])


async def test_file_is_streamed_back_byte_for_byte(pipeline: Pipeline) -> None:
    data = make_pdf(pages=2)
    resume = await pipeline.upload_ok(data, "Zoë's CV.pdf")
    response = await pipeline.client.get(f"/v1/resumes/{resume['id']}/file", headers=pipeline.headers())
    assert response.status_code == 200 and response.content == data
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-length"] == str(len(data))
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("inline;") and "filename*=UTF-8''Zo%C3%ABs%20CV.pdf" in disposition.replace("%27", "")
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_ownership_isolation_between_two_users(pipeline: Pipeline) -> None:
    mine = await pipeline.upload_ok(make_pdf(), "mine.pdf", sub="alice")
    theirs = await pipeline.upload_ok(make_pdf(text=unique_resume_text(9)), "theirs.pdf", sub="bob")

    alice = await pipeline.client.get("/v1/resumes", headers=pipeline.headers("alice"))
    assert [r["id"] for r in alice.json()] == [mine["id"]]

    # bob's resume is invisible to alice on every route (404, never 403)
    for method, path in (
        ("GET", f"/v1/resumes/{theirs['id']}/file"),
        ("DELETE", f"/v1/resumes/{theirs['id']}"),
    ):
        response = await pipeline.client.request(method, path, headers=pipeline.headers("alice"))
        assert response.status_code == 404 and response.json()["code"] == "NOT_FOUND"

    still = await pipeline.client.get(f"/v1/resumes/{theirs['id']}/file", headers=pipeline.headers("bob"))
    assert still.status_code == 200  # alice's failed delete changed nothing


async def test_delete_removes_row_then_object(pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
    resume = await pipeline.upload_ok(make_pdf())
    assert len(await _stored_keys(pipeline)) == 1

    deleted = await pipeline.client.delete(f"/v1/resumes/{resume['id']}", headers=pipeline.headers())
    assert deleted.status_code == 204 and deleted.content == b""
    assert await _row_count(sessionmaker) == 0 and await _stored_keys(pipeline) == []
    again = await pipeline.client.delete(f"/v1/resumes/{resume['id']}", headers=pipeline.headers())
    assert again.status_code == 404

    # freed: the same file can be uploaded again
    assert (await pipeline.upload(make_pdf())).status_code == 202


async def test_failed_object_delete_still_deletes_the_row(pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
    from app.services.storage import StorageError

    resume = await pipeline.upload_ok(make_pdf())

    async def broken(key: str) -> None:
        raise StorageError("minio down")

    pipeline.storage.delete = broken  # type: ignore[method-assign]
    response = await pipeline.client.delete(f"/v1/resumes/{resume['id']}", headers=pipeline.headers())
    assert response.status_code == 204  # row gone; the orphan is the startup sweep's job
    assert await _row_count(sessionmaker) == 0 and len(await _stored_keys(pipeline)) == 1


async def test_missing_object_for_an_existing_row_is_a_clean_404(pipeline: Pipeline) -> None:
    resume = await pipeline.upload_ok(make_pdf())
    await pipeline.storage.delete(resume_key("user-1", resume["id"]))
    response = await pipeline.client.get(f"/v1/resumes/{resume['id']}/file", headers=pipeline.headers())
    assert response.status_code == 404 and response.json()["code"] == "FILE_NOT_FOUND"


async def test_bad_uuid_is_a_validation_error(pipeline: Pipeline) -> None:
    response = await pipeline.client.delete("/v1/resumes/not-a-uuid", headers=pipeline.headers())
    assert response.status_code == 422 and response.json()["code"] == "VALIDATION_ERROR"


async def test_concurrent_identical_uploads_store_one(pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
    """Both pass the inline dedup check; the unique constraint settles it in the job."""
    import asyncio

    data = make_pdf()
    a, b = await asyncio.gather(pipeline.upload(data), pipeline.upload(data))
    statuses = sorted([a.status_code, b.status_code])
    if statuses == [202, 202]:
        await pipeline.runner.wait_idle()
        jobs = [
            (await pipeline.client.get(f"/v1/jobs/{r.json()['job_id']}", headers=pipeline.headers())).json()
            for r in (a, b)
        ]
        assert sorted(j["status"] for j in jobs) == ["failed", "succeeded"]
        assert next(j for j in jobs if j["status"] == "failed")["error"]["code"] == "DUPLICATE_RESUME"
    else:
        assert statuses == [202, 409]
        await pipeline.runner.wait_idle()
    assert await _row_count(sessionmaker) == 1 and len(await _stored_keys(pipeline)) == 1


@pytest.mark.parametrize("filename", ["../../etc/passwd", "C:\\Users\\x\\cv.pdf", "a\x00b\nc.pdf"])
async def test_file_names_are_sanitised(pipeline: Pipeline, filename: str) -> None:
    resume = await pipeline.upload_ok(make_pdf(text=unique_resume_text(sum(map(ord, filename)))), filename)
    name = resume["file_name"]
    assert "/" not in name and "\\" not in name and "\x00" not in name and "\n" not in name
    assert name  # never empty

