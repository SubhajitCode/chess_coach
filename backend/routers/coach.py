from fastapi import APIRouter, HTTPException
from models import CoachRequest, PerMoveCoachRequest
from services.llm_service import get_coaching, get_per_move_coaching
from services.db import save_move_coaching, get_move_coaching

router = APIRouter()


@router.post("/coach")
async def get_coach_feedback(req: CoachRequest):
    if not req.analysis:
        raise HTTPException(status_code=400, detail="Analysis data is required")

    if req.player_color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="player_color must be 'white' or 'black'")

    try:
        feedback = await get_coaching(
            analysis=req.analysis,
            player_color=req.player_color,
            username=req.username,
        )
        return {"coaching": feedback}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM coaching failed: {str(e)}")


@router.post("/coach/per-move")
async def get_per_move_coach_feedback(req: PerMoveCoachRequest):
    """Generate per-move coaching in a single LLM call, parse and persist to DB."""
    if not req.analysis:
        raise HTTPException(status_code=400, detail="Analysis data is required")
    if req.player_color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="player_color must be 'white' or 'black'")

    expected_moves = len(req.analysis.get("moves", []))

    # Return cached result if available and complete for the full game.
    cached = get_move_coaching(req.pgn_hash)
    if cached and len(cached) >= expected_moves:
        return {"coaching": cached, "cached": True}

    try:
        coaching = await get_per_move_coaching(
            analysis=req.analysis,
            player_color=req.player_color,
            username=req.username,
        )
        save_move_coaching(req.pgn_hash, coaching)
        return {"coaching": coaching, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Per-move coaching failed: {str(e)}")


@router.get("/coach/per-move/{pgn_hash}")
async def get_cached_per_move_coaching(pgn_hash: str):
    """Retrieve previously generated per-move coaching from DB."""
    coaching = get_move_coaching(pgn_hash)
    if coaching is None:
        raise HTTPException(status_code=404, detail="No per-move coaching found for this game")
    return {"coaching": coaching, "cached": True}
