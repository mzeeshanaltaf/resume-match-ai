"""GET /v1/jobs/{id} and the SSE stream, end to end through the upload pipeline."""

from __future__ import annotations

import json
import uuid

from tests.conftest import Pipeline
from tests.fakes import make_pdf, make_scanned_pdf, unique_resume_text


def parse_sse(body: str) -> list[dict]:
    """Parse an SSE body into ``[{id, event, data}]``, skipping comment (keep-alive) lines."""
    events = []
    for block in body.strip().split("\n\n"):
        fields = {}
        for line in block.split("\n"):
            if line.startswith(":") or not line:
                continue
            name, _, value = line.partition(": ")
            fields[name] = value
        if fields:
            events.append({"id": fields["id"], "event": fields["event"], "data": json.loads(fields["data"])})
    return events


async def test_snapshot_of_a_finished_job(pipeline: Pipeline) -> None:
    response = await pipeline.upload(make_pdf())
    job = await pipeline.finish(response)
    assert set(job) == {"id", "kind", "status", "steps", "result", "error", "created_at", "updated_at", "finished_at"}
    assert job["id"] == response.json()["job_id"] and job["kind"] == "resume_upload"
    assert job["finished_at"] is not None and job["error"] is None
    assert {"name", "label", "status", "started_at", "finished_at"} == set(job["steps"][0])


async def test_sse_stream_shows_the_real_steps_then_the_result(pipeline: Pipeline) -> None:
    response = await pipeline.upload(make_pdf())
    stream = await pipeline.client.get(f"/v1/jobs/{response.json()['job_id']}/events", headers=pipeline.headers())

    assert stream.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")
    assert stream.headers["cache-control"].startswith("no-cache")
    assert stream.headers["x-accel-buffering"] == "no"

    events = parse_sse(stream.text)
    assert [e["id"] for e in events] == [str(i) for i in range(1, len(events) + 1)]
    summary = [(e["event"], e["data"].get("name"), e["data"].get("status")) for e in events]
    assert summary == [
        ("step", "parsing", "running"),
        ("step", "parsing", "done"),
        ("step", "validating", "running"),
        ("step", "validating", "done"),
        ("step", "saving", "running"),
        ("step", "saving", "done"),
        ("succeeded", None, None),
    ]
    assert all(e["data"]["job_id"] == response.json()["job_id"] for e in events)
    assert events[0]["data"]["label"] == "Reading your file"
    assert events[-1]["data"]["result"]["resume"]["file_name"] == "resume.pdf"


async def test_sse_for_scanned_pdf_includes_the_ocr_step(pipeline: Pipeline) -> None:
    pipeline.llm.ocr_text = unique_resume_text(1)
    response = await pipeline.upload(make_scanned_pdf())
    await pipeline.runner.wait_idle()
    events = parse_sse((await pipeline.client.get(f"/v1/jobs/{response.json()['job_id']}/events", headers=pipeline.headers())).text)
    assert "ocr" in [e["data"].get("name") for e in events]


async def test_sse_ends_with_a_failed_event_carrying_the_api_error_shape(pipeline: Pipeline) -> None:
    pipeline.llm.resume_probability, pipeline.llm.resume_type = 0.0, "article_or_blog"
    response = await pipeline.upload(make_pdf())
    await pipeline.runner.wait_idle()
    events = parse_sse((await pipeline.client.get(f"/v1/jobs/{response.json()['job_id']}/events", headers=pipeline.headers())).text)
    last = events[-1]
    assert last["event"] == "failed"
    assert set(last["data"]["error"]) == {"code", "message", "details"}
    assert last["data"]["error"]["code"] == "INVALID_RESUME"
    assert [e["event"] for e in events].count("failed") == 1


async def test_sse_after_the_channel_expired_is_rebuilt_from_the_database(pipeline: Pipeline) -> None:
    response = await pipeline.upload(make_pdf())
    await pipeline.runner.wait_idle()
    live = parse_sse((await pipeline.client.get(f"/v1/jobs/{response.json()['job_id']}/events", headers=pipeline.headers())).text)
    pipeline.runner._channels.clear()
    rebuilt = parse_sse((await pipeline.client.get(f"/v1/jobs/{response.json()['job_id']}/events", headers=pipeline.headers())).text)
    assert rebuilt[-1] == {**live[-1], "id": str(len(rebuilt))}
    assert [e["data"]["name"] for e in rebuilt if e["event"] == "step"] == ["parsing", "validating", "saving"]


async def test_jd_job_events(pipeline: Pipeline) -> None:
    response = await pipeline.submit_jd(url="https://jobs.example.com/1")
    await pipeline.runner.wait_idle()
    events = parse_sse((await pipeline.client.get(f"/v1/jobs/{response.json()['job_id']}/events", headers=pipeline.headers())).text)
    steps = [e["data"]["name"] for e in events if e["event"] == "step" and e["data"]["status"] == "done"]
    assert steps == ["scraping", "validating", "analyzing", "saving"]
    assert events[-1]["event"] == "succeeded" and events[-1]["data"]["result"]["job_description"]["jd_url"]


async def test_jobs_are_private_to_their_owner(pipeline: Pipeline) -> None:
    response = await pipeline.upload(make_pdf(), sub="alice")
    await pipeline.runner.wait_idle()
    job_id = response.json()["job_id"]
    for path in (f"/v1/jobs/{job_id}", f"/v1/jobs/{job_id}/events"):
        denied = await pipeline.client.get(path, headers=pipeline.headers("bob"))
        assert denied.status_code == 404 and denied.json()["code"] == "NOT_FOUND"
        assert (await pipeline.client.get(path, headers=pipeline.headers("alice"))).status_code == 200


async def test_unknown_job_and_auth(pipeline: Pipeline) -> None:
    missing = await pipeline.client.get(f"/v1/jobs/{uuid.uuid4()}", headers=pipeline.headers())
    assert missing.status_code == 404
    assert (await pipeline.client.get(f"/v1/jobs/{uuid.uuid4()}")).status_code == 401
    assert (await pipeline.client.get(f"/v1/jobs/{uuid.uuid4()}/events")).status_code == 401
    assert (await pipeline.client.get("/v1/jobs/nope", headers=pipeline.headers())).status_code == 422

