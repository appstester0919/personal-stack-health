"""Personal Stack Health Dashboard — backend API routes.

v0.3: 5 service health check endpoints.
  - GET /services           (batch summary: all 5 services)
  - GET /services/comfyui   (individual detailed check)
  - GET /services/n8n
  - GET /services/openclaw
  - GET /services/prayer
  - GET /services/hermes-gateway

Health check timeout: 10s per service (Q5 = C).
All process data read from /proc/* and ss output — no destructive ops.
"""
import subprocess, time, re, json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException

router = APIRouter()

# ------------------------------------------------------------------
# Shared helpers
# ------------------------------------------------------------------

def run_cmd(cmd: list[str], timeout_s: int = 10) -> tuple[str, str, int]:
    """Run a shell command, return (stdout, stderr, returncode)."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        return r.stdout, r.stderr, r.returncode
    except subprocess.TimeoutExpired:
        return "", f"timeout after {timeout_s}s", 124


def get_proc_info(pid: int) -> dict:
    """Read RSS (KB) and uptime (s) from /proc/$pid/status and stat."""
    info = {"pid": pid, "rss_kb": None, "uptime_s": None}
    try:
        status = open(f"/proc/{pid}/status").read()
        m = re.search(r'VmRSS:\s+(\d+)\s+kB', status)
        if m:
            info["rss_kb"] = int(m.group(1))
    except (FileNotFoundError, PermissionError):
        pass

    try:
        stat = open(f"/proc/{pid}/stat").read().split()
        starttime = int(stat[22])
        boot = open("/proc/uptime").read().split()[0]
        hz = 100
        try:
            hz = int(subprocess.check_output(["getconf", "CLK_TCK"], text=True).strip())
        except Exception:
            pass
        info["uptime_s"] = int(float(boot) * hz - starttime)
        if info["uptime_s"] < 0:
            info["uptime_s"] = 0
    except (FileNotFoundError, PermissionError, IndexError):
        pass

    return info


def port_listening(port: int) -> bool:
    """Check if a port is in LISTEN state (ss -tln | grep :port)."""
    out, _, rc = run_cmd(["ss", "-tln"])
    return rc == 0 and f":{port}" in out and "LISTEN" in out


# ------------------------------------------------------------------
# Per-service health check functions
# ------------------------------------------------------------------

def check_comfyui() -> dict:
    """ComfyUI_Ideogram: find by main.py process + port 8194.
    PID must be a python process (not bash/tee wrapper)."""
    out, _, rc = run_cmd(["pgrep", "-f", "main.py"])
    if rc != 0 or not out.strip():
        return {"name": "ComfyUI_Ideogram", "status": "down", "port": 8194, "checked_at": now_iso()}

    listening = port_listening(8194)
    pid = None
    for p in out.strip().split("\n"):
        p = p.strip()
        if not p:
            continue
        try:
            pid_int = int(p)
        except ValueError:
            continue
        # Verify it's a python process (not bash/tee wrapper)
        # Check: (a) cmdline contains python + main.py AND (b) /proc/$pid/comm is python
        cmdline_path = f"/proc/{pid_int}/cmdline"
        comm_path = f"/proc/{pid_int}/comm"
        try:
            cmdline = open(cmdline_path, "rb").read().replace(b'\x00', b' ').decode('utf-8', errors='ignore')
            comm = open(comm_path, "rb").read().strip().decode('utf-8', errors='ignore')
        except (FileNotFoundError, PermissionError):
            continue
        is_python = ("python" in cmdline.lower() and "main.py" in cmdline and comm == "python")
        if is_python:
            pid = pid_int
            break

    if pid is None:
        return {"name": "ComfyUI_Ideogram", "status": "down", "port": 8194, "checked_at": now_iso()}

    proc = get_proc_info(pid)
    listening = port_listening(8194)

    return {
        "name": "ComfyUI_Ideogram",
        "status": "up" if listening else "warning",
        "port": 8194,
        "port_listening": listening,
        "pid": pid,
        "rss_mb": round(proc["rss_kb"] / 1024, 1) if proc["rss_kb"] else None,
        "uptime_s": proc["uptime_s"],
        "checked_at": now_iso(),
    }


def check_n8n() -> dict:
    """n8n: Docker container on port 5678."""
    out, _, rc = run_cmd(["docker", "ps", "--filter", "ancestor=n8nio/n8n", "--format", "{{.ID}}"])
    if rc != 0 or not out.strip():
        out, _, rc = run_cmd(["docker", "ps", "--filter", "name=n8n", "--format", "{{.ID}}"])
        if rc != 0 or not out.strip():
            return {"name": "n8n", "status": "down", "port": 5678, "checked_at": now_iso()}

    container_id = out.strip().split()[0]
    listening = port_listening(5678)

    stats_out, _, _ = run_cmd(["docker", "stats", container_id, "--no-stream", "--format", "{{.MemUsage}}"])
    rss_mb = None
    if stats_out:
        m = re.search(r'(\d+\.?\d*)\s*(?:MiB|GiB)', stats_out)
        if m:
            val = float(m.group(1))
            rss_mb = val if "GiB" in stats_out else round(val / 1024, 2)

    inspect_out, _, _ = run_cmd(["docker", "inspect", container_id, "--format", "{{.State.StartedAt}}"])
    uptime_s = None
    if inspect_out.strip():
        try:
            started = datetime.fromisoformat(inspect_out.strip().replace("Z", "+00:00"))
            uptime_s = int((datetime.now(timezone.utc) - started).total_seconds())
        except Exception:
            pass

    return {
        "name": "n8n",
        "status": "up" if listening else "warning",
        "port": 5678,
        "port_listening": listening,
        "container_id": container_id[:12],
        "rss_mb": rss_mb,
        "uptime_s": uptime_s,
        "checked_at": now_iso(),
    }


def check_openclaw() -> dict:
    """OpenClaw gateway: node process + port 18789."""
    out, _, rc = run_cmd(["pgrep", "-f", "openclaw"])
    if rc != 0 or not out.strip():
        return {"name": "OpenClaw gateway", "status": "down", "port": 18789, "checked_at": now_iso()}

    pid = int(out.strip().split()[0])
    proc = get_proc_info(pid)
    listening = port_listening(18789)

    return {
        "name": "OpenClaw gateway",
        "status": "up" if listening else "warning",
        "port": 18789,
        "port_listening": listening,
        "pid": pid,
        "rss_mb": round(proc["rss_kb"] / 1024, 1) if proc["rss_kb"] else None,
        "uptime_s": proc["uptime_s"],
        "checked_at": now_iso(),
    }


def check_prayer() -> dict:
    """Prayer pipeline v3 server: python prayer_server_v3.py + port 5000."""
    out, _, rc = run_cmd(["pgrep", "-f", "prayer_server_v3"])
    if rc != 0 or not out.strip():
        return {"name": "Prayer pipeline v3", "status": "down", "port": 5000, "checked_at": now_iso()}

    pid = int(out.strip().split()[0])
    proc = get_proc_info(pid)
    listening = port_listening(5000)

    return {
        "name": "Prayer pipeline v3",
        "status": "up" if listening else "warning",
        "port": 5000,
        "port_listening": listening,
        "pid": pid,
        "rss_mb": round(proc["rss_kb"] / 1024, 1) if proc["rss_kb"] else None,
        "uptime_s": proc["uptime_s"],
        "checked_at": now_iso(),
    }


def check_hermes_gateway() -> dict:
    """Hermes gateway: find by 'hermes' process label in ss + port 9119."""
    # ss shows "hermes" label for hermes gateway process
    out, _, rc = run_cmd(["pgrep", "-f", "hermes_cli.main gateway"])
    if rc == 0 and out.strip():
        pid = int(out.strip().split()[0])
        # Check if this is bash wrapper — if so, look for the real python process
        try:
            cmdline = open(f"/proc/{pid}/cmdline", "rb").read().replace(b'\x00', b' ').decode('utf-8', errors='ignore')
        except (FileNotFoundError, PermissionError):
            pass
        else:
            # bash wrapper — find child python with hermes_cli
            children_out, _, _ = run_cmd(["pgrep", "-P", str(pid)])
            for child in children_out.strip().split("\n"):
                child = child.strip()
                if not child:
                    continue
                try:
                    child_cmdline = open(f"/proc/{int(child)}/cmdline", "rb").read().replace(b'\x00', b' ').decode('utf-8', errors='ignore')
                    if "hermes_cli.main" in child_cmdline or "hermes" in child_cmdline:
                        pid = int(child)
                        break
                except (FileNotFoundError, PermissionError, ValueError):
                    continue

    proc = get_proc_info(pid) if pid else {"rss_kb": None, "uptime_s": None}

    # Port 9119 is Hermes gateway (ss shows "hermes" label)
    port = 9119
    listening = port_listening(port)

    return {
        "name": "Hermes gateway",
        "status": "up" if listening else "warning",
        "port": port,
        "port_listening": listening,
        "pid": pid,
        "rss_mb": round(proc.get("rss_kb", 0) / 1024, 1) if proc.get("rss_kb") else None,
        "uptime_s": proc.get("uptime_s"),
        "checked_at": now_iso(),
    }


# ------------------------------------------------------------------
# Utilities
# ------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@router.get("/services")
async def all_services():
    """Batch summary: all 5 services."""
    results = [
        check_comfyui(),
        check_n8n(),
        check_openclaw(),
        check_prayer(),
        check_hermes_gateway(),
    ]
    return {
        "services": results,
        "total": len(results),
        "up": sum(1 for r in results if r["status"] == "up"),
        "warning": sum(1 for r in results if r["status"] == "warning"),
        "down": sum(1 for r in results if r["status"] == "down"),
        "checked_at": now_iso(),
    }


@router.get("/services/comfyui")
async def comfyui():
    return check_comfyui()


@router.get("/services/n8n")
async def n8n():
    return check_n8n()


@router.get("/services/openclaw")
async def openclaw():
    return check_openclaw()


@router.get("/services/prayer")
async def prayer():
    return check_prayer()


@router.get("/services/hermes-gateway")
async def hermes_gateway():
    return check_hermes_gateway()