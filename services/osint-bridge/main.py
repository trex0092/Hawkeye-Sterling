"""
Hawkeye Sterling — OSINT Bridge FastAPI microservice.

Wraps six OSINT/analysis tools behind a uniform REST API:
  Sherlock       — username search across 400+ social networks
  Maigret        — username → full profile dossier
  theHarvester   — email/subdomain/employee harvesting
  Social Analyzer — person profile analysis across 1000+ platforms
  PyOD           — anomaly detection on transaction feature vectors
  AMLSim         — synthetic AML transaction pattern generator

Auth: X-API-Key header, validated against OSINT_BRIDGE_API_KEY env var.
      If the env var is unset, auth is skipped.

Timeout: every subprocess call is killed after OSINT_BRIDGE_TIMEOUT_S
         seconds (default 30).  Callers can pass ?timeout=<seconds> to
         override per request (capped at 300 s).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import traceback
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# App bootstrap
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Hawkeye Sterling OSINT Bridge",
    version="1.0.0",
    description="Unified OSINT/analysis microservice for AML/CFT screening.",
)

_API_KEY: str | None = os.environ.get("OSINT_BRIDGE_API_KEY")
_DEFAULT_TIMEOUT: int = int(os.environ.get("OSINT_BRIDGE_TIMEOUT_S", "30"))
_MAX_TIMEOUT: int = 300


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

async def verify_api_key(request: Request) -> None:
    """Validate X-API-Key header when OSINT_BRIDGE_API_KEY is configured."""
    if not _API_KEY:
        return  # Auth disabled
    provided = request.headers.get("X-API-Key", "")
    if provided != _API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def resolve_timeout(timeout: int | None = Query(default=None, ge=1, le=_MAX_TIMEOUT)) -> int:
    """Return effective per-request timeout in seconds."""
    return min(timeout or _DEFAULT_TIMEOUT, _MAX_TIMEOUT)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _error(tool: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": message, "tool": tool}


async def _run_subprocess(
    args: list[str],
    timeout_s: int,
    *,
    stdin: str | None = None,
    cwd: str | None = None,
) -> tuple[int, str, str]:
    """Run a subprocess with asyncio, returning (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    try:
        stdin_bytes = stdin.encode() if stdin is not None else None
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(input=stdin_bytes),
            timeout=timeout_s,
        )
        return proc.returncode or 0, stdout_bytes.decode(errors="replace"), stderr_bytes.decode(errors="replace")
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        raise


# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": str(exc), "traceback": tb, "tool": "unknown"},
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, Any]:
    """Check availability of each tool."""

    async def check(cmd: list[str]) -> bool:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.communicate(), timeout=5)
            return True
        except Exception:
            return False

    # Check tools in parallel
    results = await asyncio.gather(
        check(["sherlock", "--version"]),
        check(["maigret", "--version"]),
        check(["theHarvester", "--version"]),
        check([sys.executable, "-c", "import social_analyzer"]),
        check([sys.executable, "-c", "import pyod"]),
        check([sys.executable, "-c", "import amlsim"]),
        return_exceptions=True,
    )

    def _bool(v: object) -> bool:
        return bool(v) if not isinstance(v, Exception) else False

    return {
        "ok": True,
        "tools": {
            "sherlock": _bool(results[0]),
            "maigret": _bool(results[1]),
            "harvester": _bool(results[2]),
            "socialAnalyzer": _bool(results[3]),
            "pyod": _bool(results[4]),
            "amlsim": _bool(results[5]),
        },
    }


# ---------------------------------------------------------------------------
# POST /sherlock
# ---------------------------------------------------------------------------

class SherlockRequest(BaseModel):
    username: str


@app.post("/sherlock", dependencies=[Depends(verify_api_key)])
async def sherlock_search(
    body: SherlockRequest,
    timeout_s: int = Depends(resolve_timeout),
) -> dict[str, Any]:
    """Search for a username across 400+ social networks via Sherlock."""
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="username must be non-empty")

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            rc, stdout, stderr = await _run_subprocess(
                [
                    "sherlock",
                    "--print-found",
                    "--output", os.path.join(tmpdir, "results.txt"),
                    "--csv",
                    username,
                ],
                timeout_s,
                cwd=tmpdir,
            )
        except asyncio.TimeoutError:
            return _error("sherlock", f"Sherlock timed out after {timeout_s}s")
        except FileNotFoundError:
            return _error("sherlock", "sherlock CLI not found — install via pip install sherlock-project")

        profiles: list[dict[str, Any]] = []

        # Parse CSV output if available
        csv_path = Path(tmpdir) / f"{username}.csv"
        if csv_path.exists():
            import csv
            with open(csv_path, newline="") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    status = (row.get("status") or "").strip().upper()
                    profiles.append({
                        "site": row.get("name") or row.get("site_name") or "",
                        "url": row.get("url") or row.get("url_user") or "",
                        "exists": status in ("CLAIMED", "FOUND", ""),
                    })
        else:
            # Fall back to parsing stdout lines
            for line in stdout.splitlines():
                line = line.strip()
                if line.startswith("[+]") and "http" in line:
                    # Format: [+] SiteName: https://...
                    parts = line[3:].strip().split(":", 1)
                    site = parts[0].strip() if parts else ""
                    url_part = (":" + parts[1]).strip() if len(parts) > 1 else ""
                    # url_part starts with ": https://..." — strip leading ": "
                    url = url_part.lstrip(": ").strip()
                    if site and url:
                        profiles.append({"site": site, "url": url, "exists": True})

    return {
        "ok": True,
        "username": username,
        "profiles": profiles,
        "totalFound": len(profiles),
    }


# ---------------------------------------------------------------------------
# POST /maigret
# ---------------------------------------------------------------------------

class MaigretRequest(BaseModel):
    username: str
    sites: int | None = None


@app.post("/maigret", dependencies=[Depends(verify_api_key)])
async def maigret_profile(
    body: MaigretRequest,
    timeout_s: int = Depends(resolve_timeout),
) -> dict[str, Any]:
    """Build a full profile dossier for a username via Maigret."""
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="username must be non-empty")

    with tempfile.TemporaryDirectory() as tmpdir:
        args = [
            "maigret",
            username,
            "--json", "ndjson",
            "--folderoutput", tmpdir,
            "--no-color",
            "--timeout", str(timeout_s),
        ]
        if body.sites is not None:
            args += ["--top-sites", str(body.sites)]

        try:
            rc, stdout, stderr = await _run_subprocess(args, timeout_s + 5, cwd=tmpdir)
        except asyncio.TimeoutError:
            return _error("maigret", f"Maigret timed out after {timeout_s}s")
        except FileNotFoundError:
            return _error("maigret", "maigret CLI not found — install via pip install maigret")

        profiles: list[dict[str, Any]] = []

        # Parse NDJSON output files
        output_dir = Path(tmpdir)
        for json_file in output_dir.glob("*.json"):
            try:
                data = json.loads(json_file.read_text())
                sites_data = data if isinstance(data, dict) else {}
                for site_name, site_info in sites_data.items():
                    if not isinstance(site_info, dict):
                        continue
                    status = str(site_info.get("status", {}).get("status", "")).upper()
                    if status not in ("CLAIMED", "FOUND"):
                        continue
                    profiles.append({
                        "site": site_name,
                        "url": site_info.get("url_user") or site_info.get("url") or "",
                        "tags": list(site_info.get("tags") or []),
                        "ids": {
                            k: str(v)
                            for k, v in (site_info.get("ids") or {}).items()
                        },
                    })
            except (json.JSONDecodeError, OSError):
                continue

        # Fallback: parse stdout NDJSON lines
        if not profiles:
            for line in stdout.splitlines():
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    obj = json.loads(line)
                    status = str(obj.get("status", "")).upper()
                    if status not in ("CLAIMED", "FOUND"):
                        continue
                    profiles.append({
                        "site": obj.get("siteName") or obj.get("name") or "",
                        "url": obj.get("url") or "",
                        "tags": list(obj.get("tags") or []),
                        "ids": {k: str(v) for k, v in (obj.get("ids") or {}).items()},
                    })
                except json.JSONDecodeError:
                    continue

    return {
        "ok": True,
        "username": username,
        "profiles": profiles,
        "totalFound": len(profiles),
    }


# ---------------------------------------------------------------------------
# POST /harvester
# ---------------------------------------------------------------------------

class HarvesterRequest(BaseModel):
    domain: str
    sources: list[str] | None = None


@app.post("/harvester", dependencies=[Depends(verify_api_key)])
async def harvester_scan(
    body: HarvesterRequest,
    timeout_s: int = Depends(resolve_timeout),
) -> dict[str, Any]:
    """Harvest emails, subdomains, and IPs from public sources via theHarvester."""
    domain = body.domain.strip().lower()
    if not domain:
        raise HTTPException(status_code=422, detail="domain must be non-empty")

    sources = ",".join(body.sources) if body.sources else "all"

    with tempfile.TemporaryDirectory() as tmpdir:
        json_output = os.path.join(tmpdir, "results.json")
        try:
            rc, stdout, stderr = await _run_subprocess(
                [
                    "theHarvester",
                    "-d", domain,
                    "-b", sources,
                    "-f", json_output,
                ],
                timeout_s,
                cwd=tmpdir,
            )
        except asyncio.TimeoutError:
            return _error("harvester", f"theHarvester timed out after {timeout_s}s")
        except FileNotFoundError:
            return _error("harvester", "theHarvester CLI not found — install via pip install theHarvester")

        emails: list[str] = []
        hosts: list[str] = []
        ips: list[str] = []

        json_path = Path(json_output)
        if json_path.exists():
            try:
                data = json.loads(json_path.read_text())
                emails = list(data.get("emails") or [])
                hosts = list(data.get("hosts") or data.get("subdomains") or [])
                ips = list(data.get("ips") or data.get("ip_address") or [])
            except (json.JSONDecodeError, OSError):
                pass

        # Fallback: parse stdout
        if not emails and not hosts and not ips:
            section: str | None = None
            for line in stdout.splitlines():
                line = line.strip()
                lower = line.lower()
                if "emails" in lower:
                    section = "emails"
                elif "hosts" in lower or "subdomain" in lower:
                    section = "hosts"
                elif "ip address" in lower or "ips" in lower:
                    section = "ips"
                elif line.startswith("[-]") or line.startswith("[*]"):
                    section = None
                elif section and line and not line.startswith("["):
                    if section == "emails":
                        emails.append(line)
                    elif section == "hosts":
                        hosts.append(line)
                    elif section == "ips":
                        ips.append(line)

    return {
        "ok": True,
        "domain": domain,
        "emails": list(set(emails)),
        "hosts": list(set(hosts)),
        "ips": list(set(ips)),
    }


# ---------------------------------------------------------------------------
# POST /social-analyzer
# ---------------------------------------------------------------------------

class SocialAnalyzerRequest(BaseModel):
    person: str
    platforms: list[str] | None = None


@app.post("/social-analyzer", dependencies=[Depends(verify_api_key)])
async def social_analyzer_search(
    body: SocialAnalyzerRequest,
    timeout_s: int = Depends(resolve_timeout),
) -> dict[str, Any]:
    """Analyze a person's presence across 1000+ platforms via Social Analyzer."""
    person = body.person.strip()
    if not person:
        raise HTTPException(status_code=422, detail="person must be non-empty")

    platforms_arg = (
        " ".join(body.platforms) if body.platforms else "all"
    )

    try:
        # social-analyzer can be invoked as a Python module
        args = [
            sys.executable, "-m", "social_analyzer",
            "--cli",
            "--mode", "fast",
            "--username", person,
            "--websites", platforms_arg,
            "--output", "json",
            "--options", "found only",
        ]
        rc, stdout, stderr = await _run_subprocess(args, timeout_s)
    except asyncio.TimeoutError:
        return _error("social-analyzer", f"Social Analyzer timed out after {timeout_s}s")
    except FileNotFoundError:
        return _error("social-analyzer", "social_analyzer module not found — install via pip install social-analyzer")

    profiles: list[dict[str, Any]] = []

    # Parse JSON output
    try:
        # social-analyzer may emit one JSON blob or multiple lines
        for line in stdout.splitlines():
            line = line.strip()
            if not line.startswith("{") and not line.startswith("["):
                continue
            data = json.loads(line)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                found_accounts = item.get("found") or item.get("profiles") or []
                if isinstance(found_accounts, list):
                    for acc in found_accounts:
                        if not isinstance(acc, dict):
                            continue
                        profiles.append({
                            "platform": acc.get("title") or acc.get("name") or acc.get("platform") or "",
                            "url": acc.get("url") or acc.get("link") or "",
                            "score": float(acc.get("rate") or acc.get("score") or 0.0),
                        })
    except (json.JSONDecodeError, ValueError):
        pass

    return {
        "ok": True,
        "person": person,
        "profiles": profiles,
    }


# ---------------------------------------------------------------------------
# POST /anomaly
# ---------------------------------------------------------------------------

class AnomalyRequest(BaseModel):
    features: list[list[float]]
    labels: list[str] | None = None
    algorithm: str | None = "IsolationForest"


@app.post("/anomaly", dependencies=[Depends(verify_api_key)])
async def detect_anomaly(
    body: AnomalyRequest,
    timeout_s: int = Depends(resolve_timeout),
) -> dict[str, Any]:
    """
    Detect anomalies in a transaction feature matrix using PyOD.

    Supported algorithms: IsolationForest, COPOD, ECOD
    """
    algorithm = (body.algorithm or "IsolationForest").strip()
    SUPPORTED = {"IsolationForest", "COPOD", "ECOD"}
    if algorithm not in SUPPORTED:
        raise HTTPException(
            status_code=422,
            detail=f"algorithm must be one of {sorted(SUPPORTED)}",
        )

    features = body.features
    if not features:
        raise HTTPException(status_code=422, detail="features must be non-empty")

    # Run PyOD in a thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _run_pyod, algorithm, features),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError:
        return _error("pyod", f"PyOD timed out after {timeout_s}s")
    except ImportError as e:
        return _error("pyod", f"PyOD not installed: {e}")
    except Exception as e:
        return _error("pyod", str(e))

    return {
        "ok": True,
        "algorithm": algorithm,
        "scores": result["scores"],
        "outliers": result["outliers"],
    }


def _run_pyod(algorithm: str, features: list[list[float]]) -> dict[str, Any]:
    """Blocking PyOD invocation — run in executor."""
    import numpy as np

    X = np.array(features, dtype=np.float64)

    if algorithm == "IsolationForest":
        from pyod.models.iforest import IForest
        model = IForest(contamination=0.1, random_state=42)
    elif algorithm == "COPOD":
        from pyod.models.copod import COPOD
        model = COPOD(contamination=0.1)
    elif algorithm == "ECOD":
        from pyod.models.ecod import ECOD
        model = ECOD(contamination=0.1)
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")

    model.fit(X)
    scores: list[float] = model.decision_scores_.tolist()
    outlier_flags: list[int] = model.labels_.tolist()  # 1 = outlier
    outlier_indices = [i for i, flag in enumerate(outlier_flags) if flag == 1]

    return {"scores": scores, "outliers": outlier_indices}


# ---------------------------------------------------------------------------
# POST /amlsim/patterns
# ---------------------------------------------------------------------------

class AmlSimRequest(BaseModel):
    pattern: str
    n_accounts: int | None = 5
    n_transactions: int | None = 20


AMLSIM_PATTERNS = {"fan-in", "fan-out", "cycle", "scatter-gather"}


@app.post("/amlsim/patterns", dependencies=[Depends(verify_api_key)])
async def amlsim_patterns(
    body: AmlSimRequest,
    timeout_s: int = Depends(resolve_timeout),
) -> dict[str, Any]:
    """
    Generate synthetic AML transaction patterns using AMLSim logic.

    Patterns: fan-in, fan-out, cycle, scatter-gather
    """
    pattern = body.pattern.strip().lower()
    if pattern not in AMLSIM_PATTERNS:
        raise HTTPException(
            status_code=422,
            detail=f"pattern must be one of {sorted(AMLSIM_PATTERNS)}",
        )

    n_accounts = max(2, body.n_accounts or 5)
    n_transactions = max(1, body.n_transactions or 20)

    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _generate_amlsim, pattern, n_accounts, n_transactions),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError:
        return _error("amlsim", f"AMLSim timed out after {timeout_s}s")
    except Exception as e:
        return _error("amlsim", str(e))

    return {"ok": True, "pattern": pattern, **result}


def _generate_amlsim(
    pattern: str,
    n_accounts: int,
    n_transactions: int,
) -> dict[str, Any]:
    """
    Generate synthetic AML patterns.

    Tries to import AMLSim; falls back to a built-in pure-Python generator
    when AMLSim is not installed, so the endpoint remains useful for testing.
    """
    import random
    import string
    import datetime

    rng = random.Random(42)

    def _acct_id(i: int) -> str:
        return f"ACCT-{i:04d}"

    def _tx(src: str, dst: str, step: int) -> dict[str, Any]:
        return {
            "txId": "TX-" + "".join(rng.choices(string.hexdigits.upper(), k=8)),
            "src": src,
            "dst": dst,
            "amount": round(rng.uniform(100.0, 50_000.0), 2),
            "step": step,
            "timestamp": (
                datetime.datetime(2024, 1, 1) + datetime.timedelta(hours=step)
            ).isoformat(),
        }

    accounts = [{"id": _acct_id(i), "balance": round(rng.uniform(1_000.0, 1_000_000.0), 2)} for i in range(n_accounts)]
    transactions: list[dict[str, Any]] = []

    ids = [a["id"] for a in accounts]

    if pattern == "fan-in":
        # Many sources → one destination
        dst = ids[-1]
        srcs = ids[:-1]
        for step, src in enumerate(srcs[:n_transactions]):
            transactions.append(_tx(src, dst, step))

    elif pattern == "fan-out":
        # One source → many destinations
        src = ids[0]
        dsts = ids[1:]
        for step, dst in enumerate(dsts[:n_transactions]):
            transactions.append(_tx(src, dst, step))

    elif pattern == "cycle":
        # A → B → C → … → A
        cycle_len = min(n_accounts, n_transactions)
        for step in range(cycle_len):
            src = ids[step % n_accounts]
            dst = ids[(step + 1) % n_accounts]
            transactions.append(_tx(src, dst, step))

    elif pattern == "scatter-gather":
        # Source fans out to intermediaries, then they all pay a single collector
        mid_count = max(1, (n_accounts - 2) // 1)
        src = ids[0]
        collector = ids[-1]
        mids = ids[1:-1] or [ids[0]]
        step = 0
        for mid in mids[:n_transactions // 2]:
            transactions.append(_tx(src, mid, step))
            step += 1
        for mid in mids[:n_transactions - len(transactions)]:
            transactions.append(_tx(mid, collector, step))
            step += 1

    return {"accounts": accounts, "transactions": transactions}
