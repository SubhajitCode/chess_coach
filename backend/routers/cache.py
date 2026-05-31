from fastapi import APIRouter, HTTPException
from services.db import get_analysis, list_cached, delete_analysis, pgn_hash

router = APIRouter()


@router.get("/analysis/cached")
def get_all_cached():
    return {"cached": list_cached()}


@router.post("/analysis/check-cache")
def check_pgn_cache(body: dict):
    """Check which PGNs have cached analysis. Expects {'pgns': [pgn1, pgn2, ...]}"""
    pgns = body.get("pgns", [])
    if not isinstance(pgns, list):
        raise HTTPException(status_code=400, detail="pgns must be a list")
    
    cached_hashes = set()
    for cached_item in list_cached():
        cached_hashes.add(cached_item["pgn_hash"])
    
    result = {}
    for pgn in pgns:
        h = pgn_hash(pgn)
        result[h] = h in cached_hashes
    
    return {"cache_status": result}


@router.get("/analysis/cached/{pgn_hash}")
def get_cached(pgn_hash: str):
    result = get_analysis(pgn_hash)
    return {"cached": result, "found": result is not None}


@router.delete("/analysis/cached/{pgn_hash}")
def delete_cached(pgn_hash: str):
    deleted = delete_analysis(pgn_hash)
    if not deleted:
        raise HTTPException(status_code=404, detail="No cached analysis found")
    return {"deleted": True}
