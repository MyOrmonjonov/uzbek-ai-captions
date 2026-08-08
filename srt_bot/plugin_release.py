"""Serves the CEP plugin's version + download ZIP for the panel's auto-update check
(main.js: checkForUpdate()/stageUpdate()). Not license-gated — this is the install package
itself, the same thing a new user would be given anyway, and gating it would just break
auto-update for anyone whose token has lapsed.
"""

from pathlib import Path

from aiohttp import web

RELEASE_DIR = Path(__file__).parent / "plugin-release"
VERSION_FILE = RELEASE_DIR / "VERSION"
ZIP_FILE = RELEASE_DIR / "uzbek-ai-captions.zip"


async def handle_version(request: web.Request) -> web.Response:
    if not VERSION_FILE.exists():
        return web.json_response({"latestVersion": None})
    version = VERSION_FILE.read_text(encoding="utf-8").strip()
    return web.json_response({"latestVersion": version, "downloadUrl": "/plugin/download"})


async def handle_download(request: web.Request) -> web.Response:
    if not ZIP_FILE.exists():
        return web.json_response({"error": "no_release"}, status=404)
    return web.FileResponse(ZIP_FILE)


def register(app: web.Application) -> None:
    app.router.add_get("/plugin/version", handle_version)
    app.router.add_get("/plugin/download", handle_download)
