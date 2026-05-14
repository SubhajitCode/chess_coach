from fastapi import APIRouter, HTTPException
from services.db import get_analysis, list_cached, delete_analysis

router = APIRouter()


@router.get("/analysis/cached")
def get_all_cached():
    return {"cached": list_cached()}


@router.get("/analysis/cached/{pgn_hash}")
def get_cached(pgn_hash: str):
    result = get_analysis(pgn_hash)
    if result is None:
        raise HTTPException(status_code=404, detail="No cached analysis found")
    return result


@router.delete("/analysis/cached/{pgn_hash}")
def delete_cached(pgn_hash: str):
    deleted = delete_analysis(pgn_hash)
    if not deleted:
        raise HTTPException(status_code=404, detail="No cached analysis found")
    return {"deleted": True}
