from __future__ import annotations

import os
import time
import uuid
from pathlib import Path

import pytest

from app.models import UserResume
from app.services.storage import (
    LocalStorage,
    S3Storage,
    StorageBackend,
    StorageKeyError,
    StorageNotFound,
    resume_key,
    sweep_orphaned_objects,
    user_prefix,
)


async def _read(storage: StorageBackend, key: str) -> bytes:
    return b"".join([chunk async for chunk in await storage.get_stream(key)])


async def _keys(storage: StorageBackend, prefix: str = "") -> set[str]:
    return {info.key async for info in storage.list_objects(prefix)}


@pytest.fixture
def local(tmp_path: Path) -> LocalStorage:
    return LocalStorage(tmp_path / "store")


async def _exercise_backend(storage: StorageBackend) -> None:
    """Behaviour every backend must share."""
    await storage.delete_prefix(user_prefix("user-a"))  # tolerate a reused bucket
    await storage.delete_prefix(user_prefix("user-b"))
    key =resume_key("user-a", uuid.uuid4())
    payload = os.urandom(200_000)  # spans several stream chunks

    await storage.put(key, payload, "application/pdf")
    assert await _read(storage, key) == payload

    await storage.put(key, b"replaced")  # overwrite
    assert await _read(storage, key) == b"replaced"

    other = resume_key("user-b", uuid.uuid4())
    await storage.put(other, b"b-data")

    with pytest.raises(StorageNotFound):
        await storage.get_stream("resumes/user-a/missing")

    await storage.delete(key)
    await storage.delete(key)  # deleting twice is fine
    with pytest.raises(StorageNotFound):
        await storage.get_stream(key)

    await storage.put(resume_key("user-a", "1"), b"1")
    await storage.put(resume_key("user-a", "2"), b"2")
    assert await _keys(storage, user_prefix("user-a")) == {
        resume_key("user-a", "1"),
        resume_key("user-a", "2"),
    }
    assert await storage.delete_prefix(user_prefix("user-a")) == 2
    assert await _keys(storage, user_prefix("user-a")) == set()
    assert await _read(storage, other) == b"b-data"  # other user untouched
    assert await storage.delete_prefix(user_prefix("nobody")) == 0


async def test_local_backend_round_trip(local: LocalStorage) -> None:
    await _exercise_backend(local)


async def test_local_get_stream_is_chunked(local: LocalStorage) -> None:
    await local.put("resumes/u/f", os.urandom(300_000))
    chunks = [c async for c in await local.get_stream("resumes/u/f")]
    assert len(chunks) > 1
    assert all(len(c) <= 64 * 1024 for c in chunks)


@pytest.mark.parametrize(
    "key",
    ["", "../escape", "a/../../escape", "/abs/path", "a//b", "a/./b", "a\\b", " padded", "nul\x00"],
)
async def test_local_rejects_unsafe_keys(local: LocalStorage, key: str) -> None:
    with pytest.raises(StorageKeyError):
        await local.put(key, b"x")
    with pytest.raises(StorageKeyError):
        await local.get_stream(key)
    with pytest.raises(StorageKeyError):
        await local.delete(key)


async def test_local_put_leaves_no_temp_files(local: LocalStorage, tmp_path: Path) -> None:
    await local.put("resumes/u/f", b"data")
    leftovers = [p for p in (tmp_path / "store").rglob(".tmp-*")]
    assert leftovers == []


async def test_delete_prefix_prunes_empty_directories(local: LocalStorage, tmp_path: Path) -> None:
    await local.put("resumes/u/f", b"data")
    await local.delete_prefix("resumes/u/")
    assert not (tmp_path / "store" / "resumes" / "u").exists()


# ── Orphan sweep (needs the test database) ──────────────────────────────────


async def test_sweep_removes_only_unreferenced_old_objects(
    local: LocalStorage, sessionmaker, session
) -> None:
    kept = resume_key("u1", "kept")
    orphan = resume_key("u1", "orphan")
    fresh_orphan = resume_key("u1", "fresh")
    for key in (kept, orphan, fresh_orphan):
        await local.put(key, b"x")

    session.add(UserResume(user_id="u1", storage_key=kept, checksum="c1"))
    await session.commit()

    # Age everything except `fresh_orphan` past the grace period.
    old = time.time() - 7200
    for key in (kept, orphan):
        path = local._path(key)
        os.utime(path, (old, old))

    removed = await sweep_orphaned_objects(local, sessionmaker, min_age_seconds=3600)
    assert removed == 1
    assert await _keys(local) == {kept, fresh_orphan}  # in-flight upload survives


async def test_sweep_with_zero_grace_removes_all_orphans(local: LocalStorage, sessionmaker) -> None:
    await local.put(resume_key("u1", "a"), b"x")
    assert await sweep_orphaned_objects(local, sessionmaker, min_age_seconds=0) == 1
    assert await _keys(local) == set()


# ── S3 / MinIO (optional: set TEST_S3_ENDPOINT etc.) ────────────────────────


@pytest.mark.skipif(not os.environ.get("TEST_S3_ENDPOINT"), reason="TEST_S3_ENDPOINT not set")
async def test_s3_backend_round_trip() -> None:
    storage = S3Storage(
        endpoint=os.environ["TEST_S3_ENDPOINT"],
        access_key=os.environ["TEST_S3_ACCESS_KEY"],
        secret_key=os.environ["TEST_S3_SECRET_KEY"],
        bucket=os.environ["TEST_S3_BUCKET"],
        region="us-east-1",
    )
    await _exercise_backend(storage)
