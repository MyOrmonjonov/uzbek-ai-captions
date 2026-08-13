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

# Built by .github/workflows/build-backend.yml (windows-latest / macos-latest runners — jpackage
# can only target the OS it runs on, so a Mac package can't be produced from this Windows dev
# machine) and scp'd here on every run. Bundle each includes its own JRE (jpackage --type
# app-image / dmg), so a customer never needs to install Java separately. Same
# not-license-gated reasoning as the CEP zip above: this is the base install, not a licensed
# feature.
BACKEND_DIR = RELEASE_DIR / "backend"
BACKEND_WINDOWS_FILE = BACKEND_DIR / "UzbekAiCaptionsBackend-windows.zip"
BACKEND_MAC_FILE = BACKEND_DIR / "UzbekAiCaptionsBackend-mac.zip"
BACKEND_VERSION_FILE = BACKEND_DIR / "VERSION"

# Single combined package (plugin + backend + one install script) per platform — what the
# website's download button actually links to, so a customer runs exactly one installer instead
# of the plugin ZIP and the backend package separately.
INSTALLER_DIR = RELEASE_DIR / "installer"
INSTALLER_WINDOWS_FILE = INSTALLER_DIR / "RavonCaptions-windows.zip"
INSTALLER_MAC_FILE = INSTALLER_DIR / "RavonCaptions-mac.zip"


async def handle_version(request: web.Request) -> web.Response:
    if not VERSION_FILE.exists():
        return web.json_response({"latestVersion": None})
    version = VERSION_FILE.read_text(encoding="utf-8").strip()
    return web.json_response({"latestVersion": version, "downloadUrl": "/plugin/download"})


async def handle_download(request: web.Request) -> web.Response:
    if not ZIP_FILE.exists():
        return web.json_response({"error": "no_release"}, status=404)
    return web.FileResponse(ZIP_FILE)


async def handle_backend_version(request: web.Request) -> web.Response:
    if not BACKEND_VERSION_FILE.exists():
        return web.json_response({"latestVersion": None})
    version = BACKEND_VERSION_FILE.read_text(encoding="utf-8").strip()
    return web.json_response({
        "latestVersion": version,
        "downloadUrl": {"windows": "/backend/windows", "mac": "/backend/mac"},
    })


async def handle_backend_windows(request: web.Request) -> web.Response:
    if not BACKEND_WINDOWS_FILE.exists():
        return web.json_response({"error": "no_release"}, status=404)
    return web.FileResponse(BACKEND_WINDOWS_FILE)


async def handle_backend_mac(request: web.Request) -> web.Response:
    if not BACKEND_MAC_FILE.exists():
        return web.json_response({"error": "no_release"}, status=404)
    return web.FileResponse(BACKEND_MAC_FILE)


async def handle_installer_windows(request: web.Request) -> web.Response:
    if not INSTALLER_WINDOWS_FILE.exists():
        return web.json_response({"error": "no_release"}, status=404)
    return web.FileResponse(INSTALLER_WINDOWS_FILE)


async def handle_installer_mac(request: web.Request) -> web.Response:
    if not INSTALLER_MAC_FILE.exists():
        return web.json_response({"error": "no_release"}, status=404)
    return web.FileResponse(INSTALLER_MAC_FILE)


def register(app: web.Application) -> None:
    app.router.add_get("/plugin/version", handle_version)
    app.router.add_get("/plugin/download", handle_download)
    app.router.add_get("/backend/version", handle_backend_version)
    app.router.add_get("/backend/windows", handle_backend_windows)
    app.router.add_get("/backend/mac", handle_backend_mac)
    app.router.add_get("/download/windows", handle_installer_windows)
    app.router.add_get("/download/mac", handle_installer_mac)
