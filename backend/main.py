import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from routers import games, analysis, coach, cache, profile, play
from services.db import init_db

load_dotenv()

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Chess Analyzer API", version="1.0.0", lifespan=lifespan)

allowed_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")
allowed_origins = [orig.strip() for orig in allowed_origins_env.split(",") if orig.strip()]
if "*" in allowed_origins:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(coach.router, prefix="/api")
app.include_router(cache.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(play.router, prefix="/api")


@app.get("/api/health")
async def health():
    from services.stockfish_service import resolve_stockfish_path
    stockfish_path = resolve_stockfish_path()
    return {
        "status": "ok",
        "stockfish_path": stockfish_path,
        "stockfish_exists": os.path.exists(stockfish_path),
    }


# Serve static frontend SPA
STATIC_DIR = os.getenv(
    "FRONTEND_DIST",
    os.path.join(os.path.dirname(__file__), "static")
)
if not os.path.isdir(STATIC_DIR):
    dev_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
    if os.path.isdir(dev_dist):
        STATIC_DIR = dev_dist

if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_spa(full_path: str):
        if full_path.startswith(("api", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not Found")

        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)

        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="index.html not found")

