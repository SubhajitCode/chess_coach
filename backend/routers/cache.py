from fastapi import APIRouter, HTTPException
from services.db import get_analysis, list_cached, delete_analysis, pgn_hash

router = APIRouter()


@router.get("/analysis/cached")
def get_all_cached():
    return {"cached": list_cached()}


@router.post("/analysis/check-cache")
@router.post("/analysis/cache/batch")
def check_pgn_cache(body: dict):
    """Check which PGNs have cached analysis. Expects {'pgns': [...]} or {'pgn_hashes': [...]}"""
    pgns = body.get("pgns", [])
    pgn_hashes = body.get("pgn_hashes", [])
    if not isinstance(pgns, list) or not isinstance(pgn_hashes, list):
        raise HTTPException(status_code=400, detail="pgns and pgn_hashes must be lists")

    cached_hashes = {cached_item["pgn_hash"] for cached_item in list_cached()}

    result = {}
    for pgn in pgns:
        h = pgn_hash(pgn)
        result[h] = h in cached_hashes

    for h in pgn_hashes:
        result[h] = h in cached_hashes

    return result


@router.get("/analysis/cached/{pgn_hash}")
@router.get("/analysis/cache/{pgn_hash}")
def get_cached(pgn_hash: str):
    result = get_analysis(pgn_hash)
    return {"cached": result, "found": result is not None}


@router.delete("/analysis/cached/{pgn_hash}")
@router.delete("/analysis/cache/{pgn_hash}")
def delete_cached(pgn_hash: str):
    deleted = delete_analysis(pgn_hash)
    if not deleted:
        raise HTTPException(status_code=404, detail="No cached analysis found")
    return {"deleted": True}

