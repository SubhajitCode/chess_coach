from fastapi import APIRouter, HTTPException
from models import CoachRequest, PerMoveCoachRequest, DeviationCoachRequest
from services.llm_service import COACHING_CACHE_VERSION, get_coaching, get_per_move_coaching, get_deviation_coaching
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

    cached = get_move_coaching(req.pgn_hash, version=COACHING_CACHE_VERSION) or []
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
            save_move_coaching(req.pgn_hash, coaching, version=COACHING_CACHE_VERSION)
            cached_map.update({item["move_index"]: item["feedback"] for item in coaching})

        merged = [{"move_index": idx, "feedback": cached_map[idx]} for idx in expected_indices if idx in cached_map]
        return {"coaching": merged, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Per-move coaching failed: {str(e)}")


@router.get("/coach/per-move/{pgn_hash}")
async def get_cached_per_move_coaching(pgn_hash: str):
    """Retrieve previously generated per-move coaching from DB."""
    coaching = get_move_coaching(pgn_hash, version=COACHING_CACHE_VERSION)
    if coaching is None:
        raise HTTPException(status_code=404, detail="No per-move coaching found for this game")
    return {"coaching": coaching, "cached": True}


@router.post("/coach/deviation")
async def get_deviation_coach_feedback(req: DeviationCoachRequest):
    """Generate AI coaching for a single deviation (exploratory alternative move)."""
    if not req.fen_before or not req.move_uci:
        raise HTTPException(status_code=400, detail="fen_before and move_uci are required")
    if req.player_color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="player_color must be 'white' or 'black'")

    try:
        feedback = await get_deviation_coaching(
            fen_before=req.fen_before,
            move_uci=req.move_uci,
            move_san=req.move_san,
            move_summary=req.move_summary,
            player_color=req.player_color,
            eval_before=req.eval_before,
            eval_after=req.eval_after,
            cp_loss=req.cp_loss,
            classification=req.classification,
            best_move_san=req.best_move_san,
            best_line_san=req.best_line_san,
            deviation_best_line_san=req.deviation_best_line_san,
            game_move_number=req.game_move_number,
            username=req.username,
        )
        return {"coaching": feedback}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deviation coaching failed: {str(e)}")

