"""Internal HTTP API (aiohttp) that other machines' Java backends call: license
verification and (see transcribe_server.py) word-precise transcription. Runs in
the same asyncio loop as the Telegram bot's polling, so no separate process is needed.
"""

import logging

from aiohttp import web

import config
import licensing
import plugin_release
import proxy_server
import transcribe_server

# WAV uploads for /transcribe can be tens of MB for longer videos; aiohttp's 1MB default
# client_max_size would reject those.
MAX_UPLOAD_BYTES = 300 * 1024 * 1024

logger = logging.getLogger(__name__)


async def handle_verify(request: web.Request) -> web.Response:
    try:
        data = await request.json()
    except ValueError:
        return web.json_response({"valid": False, "reason": "bad_json"}, status=400)

    device_code = str(data.get("deviceCode", "")).strip()
    token = str(data.get("token", "")).strip()
    result = licensing.verify(device_code, token)
    return web.json_response(
        {"valid": result.valid, "daysLeft": round(result.days_left, 2), "reason": result.reason}
    )


async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok"})


def build_app() -> web.Application:
    app = web.Application(client_max_size=MAX_UPLOAD_BYTES)
    app.router.add_post("/license/verify", handle_verify)
    app.router.add_get("/license/health", handle_health)
    transcribe_server.register(app)
    proxy_server.register(app)
    plugin_release.register(app)
    return app


async def start() -> None:
    app = build_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, config.LICENSE_SERVER_HOST, config.LICENSE_SERVER_PORT)
    await site.start()
    logger.info(
        "Internal API server (license + transcribe) started on %s:%s",
        config.LICENSE_SERVER_HOST, config.LICENSE_SERVER_PORT,
    )