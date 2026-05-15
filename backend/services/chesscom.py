import httpx
from datetime import datetime


CHESSCOM_BASE = "https://api.chess.com/pub"
HEADERS = {"User-Agent": "ChessAnalyzer/1.0"}


async def fetch_games(username: str, year: int = None, month: int = None, max_games: int = 20) -> list[dict]:
    now = datetime.utcnow()
    y = year or now.year
    m = month or now.month
    normalized_username = username.strip().lower()

    url = f"{CHESSCOM_BASE}/player/{normalized_username}/games/{y}/{m:02d}"
    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    games = data.get("games", [])
    result = []
    for g in games[-max_games:]:
        pgn = g.get("pgn", "")
        opening = _extract_pgn_header(pgn, "Opening") or _extract_pgn_header(pgn, "ECOUrl") or ""
        result.append({
            "source": "chesscom",
            "white": g.get("white", {}).get("username", ""),
            "black": g.get("black", {}).get("username", ""),
            "white_rating": g.get("white", {}).get("rating"),
            "black_rating": g.get("black", {}).get("rating"),
            "result": _parse_result(g.get("white", {}).get("result", ""), g.get("black", {}).get("result", "")),
            "time_control": g.get("time_control", ""),
            "end_time": g.get("end_time"),
            "url": g.get("url", ""),
            "pgn": pgn,
            "opening": opening,
        })
    return result


def _extract_pgn_header(pgn: str, key: str) -> str:
    """Extract a PGN header value by key."""
    import re
    m = re.search(rf'\[{key}\s+"([^"]+)"\]', pgn)
    return m.group(1) if m else ""


def _parse_result(white_result: str, black_result: str) -> str:
    if white_result == "win":
        return "1-0"
    elif black_result == "win":
        return "0-1"
    else:
        return "1/2-1/2"
