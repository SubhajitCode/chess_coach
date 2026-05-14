import httpx
from datetime import datetime


CHESSCOM_BASE = "https://api.chess.com/pub"
HEADERS = {"User-Agent": "ChessAnalyzer/1.0"}


async def fetch_games(username: str, year: int = None, month: int = None, max_games: int = 20) -> list[dict]:
    now = datetime.utcnow()
    y = year or now.year
    m = month or now.month

    url = f"{CHESSCOM_BASE}/player/{username}/games/{y}/{m:02d}"
    async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
        resp = client.get(url)
        # Run sync since httpx async needs await — use sync client
        pass

    async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    games = data.get("games", [])
    result = []
    for g in games[-max_games:]:
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
            "pgn": g.get("pgn", ""),
        })
    return result


def _parse_result(white_result: str, black_result: str) -> str:
    if white_result == "win":
        return "1-0"
    elif black_result == "win":
        return "0-1"
    else:
        return "1/2-1/2"
