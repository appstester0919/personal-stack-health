"""Personal Stack Health Dashboard — backend API routes.

v0.1 scaffold: minimal FastAPI router with one hello endpoint.
Future versions (v0.3+) will add 5 service health-check endpoints.

Mounted at /api/plugins/personal-stack-health/ by the dashboard plugin system.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/hello")
async def hello():
    """Scaffold greeting — verifies the plugin is loadable and routed correctly."""
    return {
        "message": "Hello from personal-stack-health!",
        "plugin": "personal-stack-health",
        "version": "0.1.0",
        "status": "scaffold",
    }
