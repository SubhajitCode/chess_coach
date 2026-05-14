from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models import AnalyzeRequest
from services.stockfish_service import analyze_pgn, analyze_pgn_stream
import asyncio

router = APIRouter()


@router.post("/analyze")
async def analyze_game(req: AnalyzeRequest):
    if not req.pgn or not req.pgn.strip():
        raise HTTPException(status_code=400, detail="PGN is required")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            analyze_pgn,
            req.pgn,
            req.depth,
            req.player_color,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze/stream")
async def analyze_game_stream(req: AnalyzeRequest):
    """Stream analysis results as Server-Sent Events, one move at a time."""
    if not req.pgn or not req.pgn.strip():
        raise HTTPException(status_code=400, detail="PGN is required")

    depth = req.depth or 18
    player_color = req.player_color or "white"

    async def generate():
        loop = asyncio.get_event_loop()
        # Run the blocking generator in a thread pool, yielding chunks back to the event loop
        gen = analyze_pgn_stream(req.pgn, depth, player_color)
        for chunk in gen:
            yield chunk
            # Yield control back to the event loop so other requests can proceed
            await asyncio.sleep(0)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
