import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models import AnalyzeRequest, PositionAnalyzeRequest
from services.engines.factory import EngineFactory
from services.db import save_analysis, pgn_hash as compute_pgn_hash

router = APIRouter()


@router.get("/engines")
async def get_available_engines():
    """List all registered chess analysis engines and their hardware capabilities."""
    return {
        "engines": EngineFactory.list_available_engines(),
        "default": "hybrid",
    }


@router.post("/analyze/stream")
async def analyze_game_stream(req: AnalyzeRequest):
    """Stream analysis results as Server-Sent Events from the selected engine strategy."""
    if not req.pgn or not req.pgn.strip():
        raise HTTPException(status_code=400, detail="PGN is required")

    depth = req.depth or 18
    player_color = req.player_color or "white"
    engine_strategy = EngineFactory.get_engine(req.engine or "hybrid")

    async def generate():
        loop = asyncio.get_event_loop()
        gen = engine_strategy.analyze_pgn_stream(req.pgn, depth, player_color)
        collected_moves = []
        collected_summary = {}
        for chunk in gen:
            yield chunk
            # Parse SSE chunks to collect moves and summary for caching
            if chunk.startswith("data: ") and not chunk.strip().endswith("[DONE]"):
                try:
                    data = json.loads(chunk[6:].strip())
                    if data.get("type") == "move":
                        collected_moves.append(data)
                    elif data.get("type") == "summary":
                        collected_summary = data
                except Exception:
                    pass
            await asyncio.sleep(0)
        # Persist to SQLite after stream finishes
        if collected_moves:
            try:
                save_analysis(req.pgn, player_color, collected_moves, collected_summary)
            except Exception:
                pass  # caching is best-effort

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/analyze/position")
async def analyze_position_route(req: PositionAnalyzeRequest):
    """Quick analysis of any FEN position using the selected engine strategy."""
    if not req.fen or not req.fen.strip():
        raise HTTPException(status_code=400, detail="FEN is required")

    engine_strategy = EngineFactory.get_engine(req.engine or "hybrid")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            engine_strategy.analyze_position,
            req.fen,
            req.move_uci,
            req.depth or 12,
            req.pv_length or 5,
        )
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Position analysis failed: {str(e)}")


