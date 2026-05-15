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
    """Generate per-move coaching with chunked LLM calls and persist missing entries."""
    if not req.analysis:
        raise HTTPException(status_code=400, detail="Analysis data is required")
    if req.player_color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="player_color must be 'white' or 'black'")

    expected_moves = len(req.analysis.get("moves", []))
    expected_indices = list(range(expected_moves))

    cached = get_move_coaching(req.pgn_hash) or []
    cached_map = {item["move_index"]: item["feedback"] for item in cached}
    missing_indices = [idx for idx in expected_indices if idx not in cached_map]

    if not missing_indices:
        coaching = [{"move_index": idx, "feedback": cached_map[idx]} for idx in expected_indices]
        return {"coaching": coaching, "cached": True}

    try:
        coaching = await get_per_move_coaching(
            analysis=req.analysis,
            player_color=req.player_color,
            username=req.username,
            target_move_indices=missing_indices,
        )
        if coaching:
            save_move_coaching(req.pgn_hash, coaching)
            cached_map.update({item["move_index"]: item["feedback"] for item in coaching})

        merged = [{"move_index": idx, "feedback": cached_map[idx]} for idx in expected_indices if idx in cached_map]
        return {"coaching": merged, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Per-move coaching failed: {str(e)}")


@router.get("/coach/per-move/{pgn_hash}")
async def get_cached_per_move_coaching(pgn_hash: str):
    """Retrieve previously generated per-move coaching from DB."""
    coaching = get_move_coaching(pgn_hash)
    if coaching is None:
        raise HTTPException(status_code=404, detail="No per-move coaching found for this game")
    return {"coaching": coaching, "cached": True}
