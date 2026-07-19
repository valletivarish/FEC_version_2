"""Flood dashboard on aiohttp: async wrappers over the shared view functions plus on-disk static assets."""
import asyncio
import os
from pathlib import Path

from aiohttp import web

import views

STATIC_DIR = Path(__file__).parent / "static"
CONTENT_TYPES = {".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json"}


def _handler_for(view):
    async def handler(request):
        status, body = await asyncio.to_thread(view, dict(request.query))
        return web.json_response(body, status=status, headers={"Cache-Control": "no-store"})
    return handler


async def _index(request):
    return web.FileResponse(STATIC_DIR / "index.html")


async def _static(request):
    relative = request.match_info["path"]
    if not relative or ".." in Path(relative).parts:
        return web.json_response({"error": "bad path"}, status=400)
    target = STATIC_DIR / relative
    if not target.is_file():
        return web.json_response({"error": "not found"}, status=404)
    return web.FileResponse(target, headers={"Content-Type": CONTENT_TYPES.get(target.suffix, "application/octet-stream")})


def build_app():
    app = web.Application()
    app.router.add_get("/", _index)
    app.router.add_get("/static/{path:.*}", _static)
    for path, view in views.ROUTES.items():
        app.router.add_get(path, _handler_for(view))
    return app


def main():
    port = int(os.getenv("PORT", "8000"))
    print(f"dashboard listening on :{port}", flush=True)
    web.run_app(build_app(), host="0.0.0.0", port=port, print=None)


if __name__ == "__main__":
    main()
