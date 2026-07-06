from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from health import health_router
from routes import ops_router, readings_router

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI()
app.include_router(readings_router)
app.include_router(ops_router)
app.include_router(health_router)


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def no_cache_static(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store"
    return response
