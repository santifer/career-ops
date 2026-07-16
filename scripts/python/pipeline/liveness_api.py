#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlparse


SAFE_SEGMENT_RE = re.compile(r"^[A-Za-z0-9._-]+$")
TIMEOUT_SECONDS = 8


@dataclass(frozen=True)
class ApiResolution:
    ats: str
    apiUrl: str
    parts: dict[str, str]
    timeoutSeconds: int = TIMEOUT_SECONDS
    interpret: str | None = None


def classify_ashby_board(payload: Any, job_id: str) -> dict[str, str] | None:
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        return None
    target = str(job_id).lower()
    for job in payload["jobs"]:
        if isinstance(job, dict) and isinstance(job.get("id"), str) and job["id"].lower() == target and job.get("isListed") is not False:
            return {"result": "active", "code": "ashby_api_ok", "reason": "Ashby posting is listed on the board (live)"}
    return {"result": "expired", "code": "ashby_api_unlisted", "reason": "Ashby posting not listed on the board — removed/unlisted"}


def _safe_parts(parts: dict[str, str]) -> bool:
    return all(SAFE_SEGMENT_RE.match(value) and ".." not in value for value in parts.values())


def resolve_ats_api(raw_url: str) -> ApiResolution | None:
    parsed = urlparse(raw_url)
    if parsed.scheme != "https":
        return None
    host = parsed.hostname or ""
    path = parsed.path

    if host.endswith("greenhouse.io"):
        match = re.match(r"^/([^/]+)/jobs/(\d+)/?$", path)
        if match:
            parts = {"board": match.group(1), "id": match.group(2)}
            if _safe_parts(parts):
                return ApiResolution("greenhouse", f"https://boards-api.greenhouse.io/v1/boards/{parts['board']}/jobs/{parts['id']}", parts)

    lever_host = re.match(r"^jobs\.((?:eu\.)?lever\.co)$", host)
    if lever_host:
        match = re.match(r"^/([^/]+)/([^/?#]+)/?$", path)
        if match:
            parts = {"apiHost": f"api.{lever_host.group(1)}", "slug": match.group(1), "id": match.group(2)}
            if _safe_parts(parts):
                return ApiResolution("lever", f"https://{parts['apiHost']}/v0/postings/{parts['slug']}/{parts['id']}", parts)

    if host == "jobs.ashbyhq.com":
        match = re.match(r"^/([^/]+)/([^/]+)(?:/application)?/?$", path)
        if match:
            parts = {"org": match.group(1), "jobId": match.group(2)}
            if _safe_parts(parts):
                return ApiResolution("ashby", f"https://api.ashbyhq.com/posting-api/job-board/{parts['org']}", parts, timeoutSeconds=20, interpret="ashby")
    return None


def is_ats_posting(url: str) -> bool:
    return resolve_ats_api(url) is not None


class HttpResponse:
    def __init__(self, status: int, body: str = "") -> None:
        self.status = status
        self.body = body

    def json(self) -> Any:
        return json.loads(self.body)


def default_fetch(url: str, timeout: int) -> HttpResponse:
    request = urllib.request.Request(url, headers={"user-agent": "career-ops-liveness/1.0", "accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            final_url = response.geturl()
            if final_url != url:
                raise RuntimeError("redirect refused")
            return HttpResponse(response.status, response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        return HttpResponse(exc.code, exc.read().decode("utf-8", errors="replace"))


def check_liveness_via_api(url: str, fetcher: Callable[[str, int], HttpResponse] | None = None) -> dict[str, str] | None:
    resolved = resolve_ats_api(url)
    if not resolved:
        return None
    try:
        response = (fetcher or default_fetch)(resolved.apiUrl, resolved.timeoutSeconds)
    except Exception:
        return None
    if response.status in {404, 410}:
        return {"result": "expired", "code": f"{resolved.ats}_api_gone", "reason": f"ATS API {response.status} — posting removed"}
    if response.status == 200:
        if resolved.interpret == "ashby":
            try:
                return classify_ashby_board(response.json(), resolved.parts["jobId"])
            except Exception:
                return None
        return {"result": "active", "code": f"{resolved.ats}_api_ok", "reason": "ATS API returns the posting (live)"}
    return None
