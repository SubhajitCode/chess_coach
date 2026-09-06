from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from services import chesscom, lichess

router = APIRouter()


@router.get("/games")
async def get_games(
    source: str = Query(..., description="chesscom or lichess"),
    username: str = Query(...),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    max_games: int = Query(20, ge=1, le=100),
):
    source = source.lower().strip()
    username = username.strip()

    try:
        if source == "chesscom":
            games = await chesscom.fetch_games(username, year, month, max_games)
        elif source == "lichess":
            games = await lichess.fetch_games(username, max_games)
        else:
            raise HTTPException(status_code=400, detail="source must be 'chesscom' or 'lichess'")
    except Exception as e:
        error_msg = str(e)
        if "404" in error_msg or "Not Found" in error_msg:
            raise HTTPException(status_code=404, detail=f"User '{username}' not found on {source}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch games: {error_msg}")

    return {"games": games, "count": len(games)}


@router.get("/games/chesscom")
async def get_chesscom_games(
    username: str = Query(...),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    max_games: int = Query(20, ge=1, le=100),
):
    return await get_games(
        source="chesscom",
        username=username,
        year=year,
        month=month,
        max_games=max_games,
    )


@router.get("/games/lichess")
async def get_lichess_games(
    username: str = Query(...),
    max_games: int = Query(20, ge=1, le=100),
):
    return await get_games(
        source="lichess",
        username=username,
        max_games=max_games,
    )
