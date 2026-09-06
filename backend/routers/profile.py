from fastapi import APIRouter, HTTPException

from models import PlayerProfileRequest
from services.db import clear_move_coaching, get_player_profile, save_player_profile

router = APIRouter()

VALID_PLATFORMS = {"chesscom", "lichess"}


@router.get("/profile")
def read_profile():
    return {"profile": get_player_profile()}


@router.put("/profile")
@router.post("/profile")
def update_profile(req: PlayerProfileRequest):
    if req.platform not in VALID_PLATFORMS:
        raise HTTPException(status_code=400, detail="platform must be 'chesscom' or 'lichess'")

    profile = save_player_profile(req.model_dump())
    clear_move_coaching()
    return {"profile": profile}
