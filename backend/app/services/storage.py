"""Object storage for original resume files.

Two interchangeable backends chosen by ``STORAGE_BACKEND``:

* ``s3``    - MinIO / any S3-compatible store (production)
* ``local`` - a folder on disk (local dev and tests)

Files are never public and no presigned URLs are issued: the API checks ownership and
streams the bytes itself. Keys look like ``resumes/{user_id}/{file_id}``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings, get_settings
from app.models import UserResume

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024
RESUME_PREFIX = "resumes/"
# Keys are checked against the DB in batches during the orphan sweep.
_SWEEP_BATCH = 500


class StorageError(Exception):
    """Backend failure (network, permissions, ...)."""


class StorageKeyError(ValueError):
    """The key is not a safe relative object key."""


class StorageNotFound(StorageError):
    """No object exists under the key."""


@dataclass(frozen=True)
class ObjectInfo:
    key: str
    last_modified: float  # unix seconds


def validate_key(key: str) -> str:
    """Reject anything that is not a plain relative key (no traversal, no absolute paths)."""
    if not key or key != key.strip() or "\\" in key or "\x00" in key:
        raise StorageKeyError(f"Invalid storage key: {key!r}")
    path = PurePosixPath(key)
    if path.is_absolute() or any(part in ("", ".", "..") for part in key.split("/")):
        raise StorageKeyError(f"Invalid storage key: {key!r}")
    return key


def resume_key(user_id: str, file_id: object) -> str:
    """Canonical key for a resume file: ``resumes/{user_id}/{file_id}``."""
    return f"{RESUME_PREFIX}{user_id}/{file_id}"


def user_prefix(user_id: str) -> str:
    """Prefix covering every object a user owns (used by account erase)."""
    return f"{RESUME_PREFIX}{user_id}/"


class StorageBackend(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes, content_type: str | None = None) -> None:
        """Store ``data`` under ``key``, replacing any existing object."""

    @abstractmethod
    async def get_stream(self, key: str) -> AsyncIterator[bytes]:
        """Open ``key`` and return an async iterator of byte chunks.

        Raises ``StorageNotFound`` *before* returning, so a router can answer 404
        instead of failing halfway through a streamed response.
        """

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete one object. Deleting a missing object is not an error."""

    @abstractmethod
    async def delete_prefix(self, prefix: str) -> int:
        """Delete every object whose key starts with ``prefix``; returns the count."""

    @abstractmethod
    def list_objects(self, prefix: str = "") -> AsyncIterator[ObjectInfo]:
        """Iterate objects whose key starts with ``prefix``."""


# ── Local folder backend ────────────────────────────────────────────────────


class LocalStorage(StorageBackend):
    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self._root / validate_key(key)).resolve()
        if not path.is_relative_to(self._root):
            raise StorageKeyError(f"Invalid storage key: {key!r}")
        return path

    async def put(self, key: str, data: bytes, content_type: str | None = None) -> None:
        path = self._path(key)

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(data)
                os.replace(tmp_name, path)  # atomic: readers never see a partial file
            except BaseException:
                Path(tmp_name).unlink(missing_ok=True)
                raise

        await asyncio.to_thread(_write)

    async def get_stream(self, key: str) -> AsyncIterator[bytes]:
        path = self._path(key)
        if not await asyncio.to_thread(path.is_file):
            raise StorageNotFound(key)
        return self._iter_file(path, key)

    @staticmethod
    async def _iter_file(path: Path, key: str) -> AsyncIterator[bytes]:
        try:
            handle = await asyncio.to_thread(path.open, "rb")
        except FileNotFoundError as exc:
            raise StorageNotFound(key) from exc
        try:
            while chunk := await asyncio.to_thread(handle.read, CHUNK_SIZE):
                yield chunk
        finally:
            await asyncio.to_thread(handle.close)

    async def delete(self, key: str) -> None:
        path = self._path(key)
        await asyncio.to_thread(path.unlink, missing_ok=True)

    async def delete_prefix(self, prefix: str) -> int:
        deleted = 0
        async for info in self.list_objects(prefix):
            await self.delete(info.key)
            deleted += 1
        await asyncio.to_thread(self._prune_empty_dirs)
        return deleted

    def _prune_empty_dirs(self) -> None:
        for directory, _, _ in os.walk(self._root, topdown=False):
            path = Path(directory)
            if path != self._root:
                try:
                    path.rmdir()  # only succeeds when empty
                except OSError:
                    pass

    def _scan(self, prefix: str) -> list[ObjectInfo]:
        # Start walking at the deepest directory the prefix pins down.
        head = prefix.rsplit("/", 1)[0] if "/" in prefix else ""
        base = self._path(head) if head else self._root
        found: list[ObjectInfo] = []
        if not base.is_dir():
            return found
        for directory, _, files in os.walk(base):
            for name in files:
                if name.startswith(".tmp-"):
                    continue
                path = Path(directory) / name
                key = path.relative_to(self._root).as_posix()
                if key.startswith(prefix):
                    found.append(ObjectInfo(key, path.stat().st_mtime))
        return found

    async def list_objects(self, prefix: str = "") -> AsyncIterator[ObjectInfo]:
        for info in await asyncio.to_thread(self._scan, prefix):
            yield info


# ── S3 / MinIO backend ──────────────────────────────────────────────────────


class S3Storage(StorageBackend):
    def __init__(
        self,
        *,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str,
        force_path_style: bool = True,
    ) -> None:
        import aioboto3
        from botocore.config import Config

        self._bucket = bucket
        self._session = aioboto3.Session()
        self._client_kwargs: dict[str, Any] = {
            "endpoint_url": endpoint or None,
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "region_name": region,
            "config": Config(
                s3={"addressing_style": "path" if force_path_style else "auto"},
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        }

    def _client(self) -> Any:
        return self._session.client("s3", **self._client_kwargs)

    @staticmethod
    def _is_missing(exc: Exception) -> bool:
        from botocore.exceptions import ClientError

        if isinstance(exc, ClientError):
            code = str(exc.response.get("Error", {}).get("Code", ""))
            return code in ("404", "NoSuchKey", "NotFound")
        return False

    async def put(self, key: str, data: bytes, content_type: str | None = None) -> None:
        validate_key(key)
        extra = {"ContentType": content_type} if content_type else {}
        try:
            async with self._client() as client:
                await client.put_object(Bucket=self._bucket, Key=key, Body=data, **extra)
        except Exception as exc:
            raise StorageError(f"put {key} failed: {exc}") from exc

    async def get_stream(self, key: str) -> AsyncIterator[bytes]:
        validate_key(key)
        try:
            async with self._client() as client:
                await client.head_object(Bucket=self._bucket, Key=key)
        except Exception as exc:
            if self._is_missing(exc):
                raise StorageNotFound(key) from exc
            raise StorageError(f"head {key} failed: {exc}") from exc
        return self._iter_object(key)

    async def _iter_object(self, key: str) -> AsyncIterator[bytes]:
        # The response body is only valid while the client context is open, so the
        # whole stream lives inside this generator.
        try:
            async with self._client() as client:
                response = await client.get_object(Bucket=self._bucket, Key=key)
                body = response["Body"]  # StreamingBody; closed with the client context
                async for chunk in body.iter_chunks(CHUNK_SIZE):
                    yield chunk
        except Exception as exc:
            if self._is_missing(exc):
                raise StorageNotFound(key) from exc
            raise

    async def delete(self, key: str) -> None:
        validate_key(key)
        try:
            async with self._client() as client:
                await client.delete_object(Bucket=self._bucket, Key=key)  # idempotent in S3
        except Exception as exc:
            raise StorageError(f"delete {key} failed: {exc}") from exc

    async def delete_prefix(self, prefix: str) -> int:
        deleted = 0
        try:
            async with self._client() as client:
                paginator = client.get_paginator("list_objects_v2")
                async for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
                    objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
                    if not objects:
                        continue
                    result = await client.delete_objects(
                        Bucket=self._bucket, Delete={"Objects": objects, "Quiet": True}
                    )
                    errors = result.get("Errors", [])
                    if errors:
                        raise StorageError(f"delete_prefix {prefix}: {errors[:3]}")
                    deleted += len(objects)
        except StorageError:
            raise
        except Exception as exc:
            raise StorageError(f"delete_prefix {prefix} failed: {exc}") from exc
        return deleted

    async def list_objects(self, prefix: str = "") -> AsyncIterator[ObjectInfo]:
        async with self._client() as client:
            paginator = client.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
                for item in page.get("Contents", []):
                    yield ObjectInfo(item["Key"], item["LastModified"].timestamp())


# ── Factory ─────────────────────────────────────────────────────────────────


def build_storage(settings: Settings) -> StorageBackend:
    if settings.storage_backend == "local":
        return LocalStorage(settings.storage_local_dir)
    missing = [
        name
        for name, value in (
            ("S3_ENDPOINT", settings.s3_endpoint),
            ("S3_ACCESS_KEY", settings.s3_access_key),
            ("S3_SECRET_KEY", settings.s3_secret_key),
            ("S3_BUCKET", settings.s3_bucket),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(f"STORAGE_BACKEND=s3 requires: {', '.join(missing)}")
    return S3Storage(
        endpoint=settings.s3_endpoint,
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        bucket=settings.s3_bucket,
        region=settings.s3_region,
        force_path_style=settings.s3_force_path_style,
    )


@lru_cache
def _cached_storage() -> StorageBackend:
    return build_storage(get_settings())


def get_storage() -> StorageBackend:
    """FastAPI dependency / accessor. Override in tests via ``dependency_overrides``."""
    return _cached_storage()


# ── Orphan sweep ────────────────────────────────────────────────────────────


async def sweep_orphaned_objects(
    storage: StorageBackend,
    sessionmaker: async_sessionmaker[AsyncSession],
    *,
    min_age_seconds: int,
    prefix: str = RESUME_PREFIX,
) -> int:
    """Delete stored files that no ``user_resume`` row points at.

    A resume delete removes the row first and the object second; if the object delete
    fails the key is left behind. This sweep (run at startup) removes such leftovers.
    Objects younger than ``min_age_seconds`` are skipped so an upload that stored its
    file but has not yet inserted its row is never collected.
    Returns the number of objects deleted.
    """
    cutoff = time.time() - min_age_seconds
    deleted = 0

    async def _flush(batch: Sequence[str]) -> int:
        if not batch:
            return 0
        async with sessionmaker() as session:
            known = set(
                (
                    await session.execute(
                        select(UserResume.storage_key).where(UserResume.storage_key.in_(batch))
                    )
                ).scalars()
            )
        removed = 0
        for key in batch:
            if key in known:
                continue
            try:
                await storage.delete(key)
                removed += 1
                logger.info("Swept orphaned object %s", key)
            except StorageError:
                logger.exception("Could not delete orphaned object %s", key)
        return removed

    batch: list[str] = []
    async for info in storage.list_objects(prefix):
        if info.last_modified > cutoff:
            continue
        batch.append(info.key)
        if len(batch) >= _SWEEP_BATCH:
            deleted += await _flush(batch)
            batch = []
    deleted += await _flush(batch)
    return deleted
