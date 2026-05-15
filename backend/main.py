import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import games, analysis, coach, cache
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(coach.router, prefix="/api")
app.include_router(cache.router, prefix="/api")


@app.get("/api/health")
async def health():
    stockfish_path = os.getenv("STOCKFISH_PATH", "/opt/homebrew/bin/stockfish")
    return {
        "status": "ok",
        "stockfish_path": stockfish_path,
        "stockfish_exists": os.path.exists(stockfish_path),
    }
