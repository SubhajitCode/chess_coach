from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from services.db import (
    get_analysis,
    list_cached,
    delete_analysis,
    pgn_hash,
    get_cache_status_batch,
)

router = APIRouter()


@router.get("/analysis/cached")
def get_all_cached(
    username: Optional[str] = Query(None),
    engine: Optional[str] = Query(None),
):
    return {"cached": list_cached(username=username, engine=engine)}


@router.post("/analysis/check-cache")
@router.post("/analysis/cache/batch")
def check_pgn_cache(body: dict):
    """Check which PGNs have cached analysis. Expects {'pgns': [...]} or {'pgn_hashes': [...]} and optional 'username'."""
    pgns = body.get("pgns", [])
    pgn_hashes = body.get("pgn_hashes", [])
    username = body.get("username")
    if not isinstance(pgns, list) or not isinstance(pgn_hashes, list):
        raise HTTPException(status_code=400, detail="pgns and pgn_hashes must be lists")

    all_hashes = list(pgn_hashes)
    for p in pgns:
        if isinstance(p, str) and p.strip():
            all_hashes.append(pgn_hash(p))

    status_map = get_cache_status_batch(all_hashes, username=username)
    legacy_booleans = {h: status_map[h]["analyzed"] for h in status_map}

    return {"cache_status": status_map, **legacy_booleans}


@router.get("/analysis/cached/{pgn_hash}")
@router.get("/analysis/cache/{pgn_hash}")
def get_cached(
    pgn_hash: str,
    username: Optional[str] = Query(None),
    engine: Optional[str] = Query(None),
):
    result = get_analysis(pgn_hash, username=username, engine=engine)
    response = {"cached": result, "found": result is not None}
    if isinstance(result, dict):
        response.update(result)
    return response


@router.delete("/analysis/cached/{pgn_hash}")
@router.delete("/analysis/cache/{pgn_hash}")
def delete_cached(
    pgn_hash: str,
    engine: Optional[str] = Query(None),
):
    deleted = delete_analysis(pgn_hash, engine=engine)
    if not deleted:
        raise HTTPException(status_code=404, detail="No cached analysis found")
    return {"deleted": True}

