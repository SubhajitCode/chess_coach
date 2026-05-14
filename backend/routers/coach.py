from fastapi import APIRouter, HTTPException
from models import CoachRequest
from services.llm_service import get_coaching

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
