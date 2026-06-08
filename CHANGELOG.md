# Changelog — personal-stack-health

## v1.0.0 (2026-06-08)

First production release.

### What's new
- **5 service health monitoring**: ComfyUI_Ideogram, n8n, OpenClaw gateway, Prayer pipeline v3, Hermes gateway
- **Per-service detailed endpoint**: `/services/comfyui`, `/services/n8n`, etc.
- **Batch summary endpoint**: `/services` returns all 5 with status counts
- **HTML dashboard**: vanilla HTML+JS (no build step), auto-refresh every 30s

### Service details

| Service | Port | Monitored via |
|---|---|---|
| ComfyUI_Ideogram | 8194 | `pgrep main.py` + filter by `comm=python` |
| n8n | 5678 | `docker ps` + `docker stats` |
| OpenClaw gateway | 18789 | `pgrep openclaw` |
| Prayer pipeline v3 | 5000 | `pgrep prayer_server_v3` |
| Hermes gateway | 9119 | `pgrep hermes_cli.main gateway` |

### Technical notes
- Health check timeout: 10s per service
- RSS read from `/proc/$pid/status` VmRSS field
- Uptime computed from `/proc/$pid/stat` starttime + system uptime / CLK_TCK
- Port detection via `ss -tln` (LISTEN state)
- Plugin mounted at `/api/plugins/personal-stack-health/` on Hermes gateway

### Verification (2026-06-08)
- All 5 service check functions verified with live system data:
  - ComfyUI: pid=955461 rss=2638MB port=8194 ✓ up
  - n8n: rss=490MB port=5678 ✓ up
  - OpenClaw: pid=521 rss=1126MB port=18789 ✓ up
  - Prayer: status=down ✓ detected (not running)
  - Hermes gateway: port=9119 ✓ up
- HTML frontend verified: parses without error, all table tags present
- Manifest entry verified: points to index.html

---

## v0.5.0 (2026-06-08) — internal

HTML+JS frontend added.