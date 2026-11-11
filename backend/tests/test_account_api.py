"""GET /v1/account/export and DELETE /internal/users/{id}."""

from __future__ import annotations

import asyncio
import glob
import io
import json
import tempfile
import zipfile
from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.storage import StorageError, user_prefix
from tests.conftest import Pipeline
from tests.fakes import RESUME_TEXT, make_pdf, unique_resume_text

INTERNAL = {"X-Internal-Key": "test-internal-key"}


async def _populate(pipeline: Pipeline, sub: str = "user-1", n: int = 0) -> dict[str, Any]:
    """A resume (with file), JD, match, tailored bullets and cover letter for ``sub``."""
    pdf = make_pdf(text=unique_resume_text(n))
    resume = await pipeline.upload_ok(pdf, f"my resume {n}.pdf", sub=sub)
    jd = await pipeline.jd_ok(sub, n=n)
    match_id = (await pipeline.match_ok(resume["id"], jd["id"], sub))["match_id"]
    for what in ("tailored-bullets", "cover-letter"):
        await pipeline.finish(
            await pipeline.client.post(f"/v1/matches/{match_id}/{what}", headers=pipeline.headers(sub)), sub
        )
    return {"resume": resume, "jd": jd, "match_id": match_id, "pdf": pdf}


async def _export(pipeline: Pipeline, sub: str = "user-1", **claims: Any) -> Any:
    return await pipeline.client.get(
        "/v1/account/export", headers=pipeline.headers(sub, email=f"{sub}@example.com", **claims)
    )


def _zip(response: Any) -> zipfile.ZipFile:
    assert response.status_code == 200, response.text
    return zipfile.ZipFile(io.BytesIO(response.content))


# ── Export ──────────────────────────────────────────────────────────────────


async def test_export_contains_everything_the_user_owns(pipeline: Pipeline) -> None:
    data = await _populate(pipeline)
    response = await _export(pipeline)
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"].startswith('attachment; filename="resumatch-export-')
    assert response.headers["cache-control"] == "private, no-store"

    archive = _zip(response)
    assert archive.testzip() is None
    resume_id = data["resume"]["id"]
    member = f"resumes/{resume_id}-my resume 0.pdf"
    assert sorted(archive.namelist()) == sorted(
        [
            "README.txt",
            "profile.json",
            "resumes.json",
            "job_descriptions.json",
            "matches.json",
            "generated_documents.json",
            "credit_transactions.json",
            member,
        ]
    )
    assert archive.read(member) == data["pdf"]  # the original file, byte for byte

    profile = json.loads(archive.read("profile.json"))
    assert profile["user_id"] == "user-1" and profile["email"] == "user-1@example.com"
    assert profile["credits_balance"] == 8 and profile["exported_at"]

    resumes = json.loads(archive.read("resumes.json"))
    assert len(resumes) == 1
    assert resumes[0]["id"] == resume_id and resumes[0]["file_in_export"] == member
    assert resumes[0]["file_name"] == "my resume 0.pdf" and resumes[0]["mode"] == "candidate"
    assert "Jane Candidate" in resumes[0]["extracted_text"]

    jds = json.loads(archive.read("job_descriptions.json"))
    assert [j["id"] for j in jds] == [data["jd"]["id"]]
    assert jds[0]["jd_object"]["job_title"] == "Senior Backend Engineer"

    matches = json.loads(archive.read("matches.json"))
    assert [m["id"] for m in matches] == [data["match_id"]]
    assert matches[0]["report"]["match_summary"]["overall_score_percent"] == 82
    assert matches[0]["resume_id"] == resume_id and matches[0]["jd_id"] == data["jd"]["id"]
    assert "documents" not in matches[0]  # they live in generated_documents.json

    documents = json.loads(archive.read("generated_documents.json"))
    assert sorted(d["kind"] for d in documents) == ["cover_letter", "tailored_bullets"]
    assert all(d["match_id"] == data["match_id"] for d in documents)

    ledger = json.loads(archive.read("credit_transactions.json"))
    assert sorted(t["transaction_type"] for t in ledger) == ["cover_letter", "match_analysis", "signup_bonus"]

    readme = archive.read("README.txt").decode()
    for name in ("profile.json", "resumes/", "matches.json", "generated_documents.json", "credit_transactions.json"):
        assert name in readme


async def test_export_of_an_empty_account(pipeline: Pipeline) -> None:
    archive = _zip(await _export(pipeline))
    assert json.loads(archive.read("resumes.json")) == []
    assert json.loads(archive.read("matches.json")) == []
    assert json.loads(archive.read("job_descriptions.json")) == []
    assert not [n for n in archive.namelist() if n.startswith("resumes/")]


async def test_export_only_contains_the_callers_data(pipeline: Pipeline) -> None:
    await _populate(pipeline, "user-a", 1)
    await _populate(pipeline, "user-b", 2)
    archive = _zip(await _export(pipeline, "user-a"))
    everything = b"".join(archive.read(n) for n in archive.namelist() if n.endswith(".json"))
    assert b"Reference number 1" in everything and b"Reference number 2" not in everything
    assert b"user-b" not in everything
    assert len([n for n in archive.namelist() if n.startswith("resumes/")]) == 1


async def test_export_survives_a_missing_object_and_says_so(pipeline: Pipeline) -> None:
    data = await _populate(pipeline)
    await pipeline.storage.delete_prefix(user_prefix("user-1"))
    archive = _zip(await _export(pipeline))
    resumes = json.loads(archive.read("resumes.json"))
    assert resumes[0]["file_in_export"] is None and resumes[0]["id"] == data["resume"]["id"]
    assert not [n for n in archive.namelist() if n.startswith("resumes/")]


async def test_export_is_limited_to_one_per_hour_per_user(pipeline: Pipeline) -> None:
    assert (await _export(pipeline)).status_code == 200
    again = await _export(pipeline)
    assert again.status_code == 429
    body = again.json()
    assert body["code"] == "EXPORT_RATE_LIMITED"
    retry = body["details"]["retry_after_seconds"]
    assert 3500 < retry <= 3601 and again.headers["retry-after"] == str(retry)
    # Another user has their own allowance.
    assert (await _export(pipeline, "user-b")).status_code == 200


async def test_export_allowance_returns_after_the_cooldown(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    assert (await _export(pipeline)).status_code == 200
    async with sessionmaker() as session:  # move the previous export back past the cooldown
        await session.execute(
            text(
                "UPDATE resume_match.jobs SET created_at = now() - interval '3601 seconds' "
                "WHERE kind = 'account_export'"
            )
        )
        await session.commit()
    assert (await _export(pipeline)).status_code == 200


async def test_cooldown_is_a_setting(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(export_cooldown_seconds=0)
    for _ in range(2):
        assert (await _export(pipeline)).status_code == 200


async def test_simultaneous_exports_allow_exactly_one(pipeline: Pipeline) -> None:
    responses = await asyncio.gather(*(_export(pipeline) for _ in range(5)))
    assert sorted(r.status_code for r in responses) == [200, 429, 429, 429, 429]


async def test_a_failed_export_does_not_use_up_the_allowance(pipeline: Pipeline) -> None:
    await _populate(pipeline)
    original = pipeline.storage.get_stream

    async def broken(key: str) -> Any:
        raise StorageError("disk on fire")

    pipeline.storage.get_stream = broken  # type: ignore[method-assign]
    assert (await _export(pipeline)).status_code == 500
    pipeline.storage.get_stream = original  # type: ignore[method-assign]
    assert (await _export(pipeline)).status_code == 200


async def test_export_temp_files_are_removed(pipeline: Pipeline) -> None:
    pattern = f"{tempfile.gettempdir()}/resumatch-export-*.zip"
    before = set(glob.glob(pattern))
    assert (await _export(pipeline)).status_code == 200
    failing = pipeline.storage.get_stream

    async def broken(key: str) -> Any:
        raise StorageError("nope")

    await _populate(pipeline, "user-b", 3)
    pipeline.storage.get_stream = broken  # type: ignore[method-assign]
    assert (await _export(pipeline, "user-b")).status_code == 500
    pipeline.storage.get_stream = failing  # type: ignore[method-assign]
    assert set(glob.glob(pattern)) == before


async def test_export_needs_a_token_and_has_no_user_id_parameter(pipeline: Pipeline) -> None:
    assert (await pipeline.client.get("/v1/account/export")).status_code == 401
    # Someone else's id in the query string changes nothing: the token decides.
    await _populate(pipeline, "user-b", 4)
    archive = _zip(
        await pipeline.client.get(
            "/v1/account/export?user_id=user-b", headers=pipeline.headers("user-a", email="a@example.com")
        )
    )
    assert json.loads(archive.read("resumes.json")) == []


# ── Internal erase: who may call it ─────────────────────────────────────────


async def _erase(pipeline: Pipeline, user_id: str, *, headers: dict[str, str] | None = None, body: Any = None) -> Any:
    return await pipeline.client.request(
        "DELETE",
        f"/internal/users/{user_id}",
        json={"email": f"{user_id}@example.com"} if body is None else body,
        headers=INTERNAL if headers is None else headers,
    )


async def test_internal_erase_rejects_a_user_jwt(pipeline: Pipeline) -> None:
    await _populate(pipeline)
    response = await _erase(pipeline, "user-1", headers=pipeline.headers("user-1"))  # a perfectly valid JWT
    assert response.status_code == 403 and response.json()["code"] == "FORBIDDEN"
    # ...even one for the very user being erased, and nothing was touched.
    assert len((await pipeline.client.get("/v1/resumes", headers=pipeline.headers())).json()) == 1


@pytest.mark.parametrize("key", ["", "wrong-key", "test-internal-keyX", "TEST-INTERNAL-KEY"])
async def test_internal_erase_rejects_a_wrong_key(pipeline: Pipeline, key: str) -> None:
    await _populate(pipeline)
    response = await _erase(pipeline, "user-1", headers={"X-Internal-Key": key})
    assert response.status_code == 403
    assert len((await pipeline.client.get("/v1/matches", headers=pipeline.headers())).json()) == 1


async def test_internal_erase_with_no_key_at_all_is_rejected(pipeline: Pipeline) -> None:
    assert (await _erase(pipeline, "user-1", headers={})).status_code == 403


async def test_internal_api_is_disabled_without_a_configured_key(make_pipeline: Callable[..., Pipeline]) -> None:
    pipeline = make_pipeline(internal_api_key="")
    response = await _erase(pipeline, "user-1", headers={"X-Internal-Key": ""})
    assert response.status_code == 503 and response.json()["code"] == "INTERNAL_API_DISABLED"


@pytest.mark.parametrize("user_id", ["..", "a%2Fb", "a%5Cb", "%20"])
async def test_internal_erase_refuses_path_like_user_ids(pipeline: Pipeline, user_id: str) -> None:
    response = await _erase(pipeline, user_id)
    assert response.status_code in (404, 422)  # 422 from our check (or 404 if the router never matched)
    assert response.status_code != 200


@pytest.mark.parametrize("body", [{}, {"email": ""}, {"email": "not-an-email"}, {"email": "a@b.c", "x": 1}, "nope"])
async def test_internal_erase_requires_the_email(pipeline: Pipeline, body: Any) -> None:
    response = await _erase(pipeline, "user-1", body=body)
    assert response.status_code == 422 and response.json()["code"] == "VALIDATION_ERROR"


# ── Full erase ──────────────────────────────────────────────────────────────


async def _user_row_counts(sessionmaker: async_sessionmaker[AsyncSession], user_id: str) -> dict[str, int]:
    """Rows owned by ``user_id`` in EVERY resume_match table that has a user_id column (plus
    generated_documents via its match), so a table added later cannot be forgotten here."""
    async with sessionmaker() as session:
        tables = (
            await session.execute(
                text(
                    "SELECT table_name FROM information_schema.columns "
                    "WHERE table_schema = 'resume_match' AND column_name = 'user_id' ORDER BY table_name"
                )
            )
        ).scalars().all()
        counts = {
            table: (
                await session.execute(
                    text(f'SELECT count(*) FROM resume_match."{table}" WHERE user_id = :u'), {"u": user_id}
                )
            ).scalar_one()
            for table in tables
        }
        counts["generated_documents"] = (
            await session.execute(
                text(
                    "SELECT count(*) FROM resume_match.generated_documents g "
                    "JOIN resume_match.job_match_summary m ON m.summary_id = g.match_id WHERE m.user_id = :u"
                ),
                {"u": user_id},
            )
        ).scalar_one()
    assert {"user_resume", "user_jds", "job_match_summary", "jobs", "user_credit_accounts",
            "user_credit_transactions"} <= set(counts)
    return counts


async def _objects(pipeline: Pipeline, user_id: str) -> list[str]:
    return [info.key async for info in pipeline.storage.list_objects(user_prefix(user_id))]


async def test_erase_leaves_zero_rows_and_no_objects(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    await _populate(pipeline, "user-a", 1)
    await _populate(pipeline, "user-b", 2)
    await pipeline.client.get("/v1/account/export", headers=pipeline.headers("user-a"))  # leaves an export job row
    b_before = await _user_row_counts(sessionmaker, "user-b")
    before = await _user_row_counts(sessionmaker, "user-a")
    assert all(count > 0 for count in before.values()), before  # the user really owned something everywhere
    assert len(await _objects(pipeline, "user-a")) == 1

    response = await _erase(pipeline, "user-a")
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "user-a" and body["objects_deleted"] == 1
    assert body["deleted"]["resumes"] == 1 and body["deleted"]["matches"] == 1
    assert body["deleted"]["generated_documents"] == 2 and body["deleted"]["credit_accounts"] == 1

    assert set((await _user_row_counts(sessionmaker, "user-a")).values()) == {0}
    assert await _objects(pipeline, "user-a") == []
    # The API agrees: nothing left to read.
    assert (await pipeline.client.get("/v1/resumes", headers=pipeline.headers("user-a"))).json() == []
    assert (await pipeline.client.get("/v1/matches", headers=pipeline.headers("user-a"))).json() == []

    # The other user is untouched, rows and files.
    assert await _user_row_counts(sessionmaker, "user-b") == b_before
    assert len(await _objects(pipeline, "user-b")) == 1
    assert len((await pipeline.client.get("/v1/matches", headers=pipeline.headers("user-b"))).json()) == 1


async def test_erase_is_idempotent_and_ok_for_a_user_with_no_data(pipeline: Pipeline) -> None:
    for _ in range(2):
        response = await _erase(pipeline, "ghost")
        assert response.status_code == 200
        assert set(response.json()["deleted"].values()) == {0} and response.json()["objects_deleted"] == 0


async def test_erase_stores_only_a_salted_hash_of_the_email(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    await _erase(pipeline, "user-a", body={"email": "Person@Example.com"})
    async with sessionmaker() as session:
        rows = (await session.execute(text("SELECT email_hash FROM resume_match.deleted_accounts"))).scalars().all()
    assert len(rows) == 1 and len(rows[0]) == 64
    assert "person" not in rows[0].lower() and "example" not in rows[0].lower()


async def test_re_registering_with_the_same_email_gets_zero_credits(pipeline: Pipeline) -> None:
    email = "Farmer@Example.com"
    # First life: signs up (10 credits), spends some, deletes the account.
    first = pipeline.headers("old-id", email=email)
    assert (await pipeline.client.get("/v1/credits", headers=first)).json()["balance"] == 10
    resume = await pipeline.upload_ok(make_pdf(text=RESUME_TEXT), "r.pdf", sub="old-id")
    jd = await pipeline.jd_ok("old-id")
    await pipeline.match_ok(resume["id"], jd["id"], "old-id")
    assert (await _erase(pipeline, "old-id", body={"email": email})).status_code == 200

    # Second life: a new user id (Better Auth issues a new one), same address in another case.
    second = pipeline.headers("new-id", email="farmer@example.com")
    credits_now = await pipeline.client.get("/v1/credits", headers=second)
    assert credits_now.json()["balance"] == 0
    assert (await pipeline.client.get("/v1/credits/transactions", headers=second)).json() == []
    # ...and they cannot spend what they do not have.
    resume2 = await pipeline.upload_ok(make_pdf(text=unique_resume_text(9)), "r2.pdf", sub="new-id")
    jd2 = await pipeline.jd_ok("new-id", n=9)
    blocked = await pipeline.client.post(
        "/v1/matches", json={"resume_id": resume2["id"], "jd_id": jd2["id"]}, headers=second
    )
    assert blocked.status_code == 402

    # A genuinely new email is unaffected.
    fresh = pipeline.headers("someone-else", email="other@example.com")
    assert (await pipeline.client.get("/v1/credits", headers=fresh)).json()["balance"] == 10


async def test_erase_cancels_running_jobs_so_nothing_is_written_afterwards(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    resume = await pipeline.upload_ok(make_pdf(text=unique_resume_text(5)), "r.pdf", sub="user-a")
    jd = await pipeline.jd_ok("user-a", n=5)
    started = asyncio.Event()

    async def hold(task: str, schema: type, input: Any) -> None:
        started.set()
        await asyncio.Event().wait()

    pipeline.llm.parse_hook = hold
    await pipeline.post_match(resume["id"], jd["id"], "user-a")
    await started.wait()

    response = await _erase(pipeline, "user-a")
    assert response.status_code == 200 and response.json()["cancelled_jobs"] == 1
    await pipeline.runner.wait_idle()
    assert set((await _user_row_counts(sessionmaker, "user-a")).values()) == {0}


async def test_erase_with_failing_storage_is_502_and_a_retry_finishes_it(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    await _populate(pipeline, "user-a", 1)
    original = pipeline.storage.delete_prefix

    async def broken(prefix: str) -> int:
        raise StorageError("minio is down")

    pipeline.storage.delete_prefix = broken  # type: ignore[method-assign]
    response = await _erase(pipeline, "user-a")
    assert response.status_code == 502 and response.json()["code"] == "ERASE_INCOMPLETE"
    assert set((await _user_row_counts(sessionmaker, "user-a")).values()) == {0}  # rows are gone
    assert len(await _objects(pipeline, "user-a")) == 1  # the file is not

    pipeline.storage.delete_prefix = original  # type: ignore[method-assign]
    retry = await _erase(pipeline, "user-a")
    assert retry.status_code == 200 and retry.json()["objects_deleted"] == 1
    assert await _objects(pipeline, "user-a") == []


async def test_a_database_failure_during_erase_rolls_everything_back(
    pipeline: Pipeline, sessionmaker: async_sessionmaker[AsyncSession], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import credits

    await _populate(pipeline, "user-a", 1)
    before = await _user_row_counts(sessionmaker, "user-a")

    async def boom(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("db went away")

    monkeypatch.setattr(credits, "record_deleted_account", boom)  # fails after the deletes, before commit
    response = await _erase(pipeline, "user-a")
    assert response.status_code == 500
    assert await _user_row_counts(sessionmaker, "user-a") == before  # all or nothing
    assert len(await _objects(pipeline, "user-a")) == 1  # and no file was deleted
