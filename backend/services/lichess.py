import httpx

LICHESS_BASE = "https://lichess.org/api"
HEADERS = {"Accept": "application/x-ndjson"}


async def fetch_games(username: str, max_games: int = 20) -> list[dict]:
    url = f"{LICHESS_BASE}/games/user/{username}"
    params = {
        "max": max_games,
        "pgnInJson": "true",
        "opening": "true",
        "clocks": "false",
        "evals": "false",
    }

    games = []
    async with httpx.AsyncClient(timeout=20) as client:
        async with client.stream("GET", url, params=params, headers=HEADERS) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                import json
                try:
                    g = json.loads(line)
                except Exception:
                    continue

                players = g.get("players", {})
                white = players.get("white", {}).get("user", {}).get("name", "?")
                black = players.get("black", {}).get("user", {}).get("name", "?")
                white_rating = players.get("white", {}).get("rating")
                black_rating = players.get("black", {}).get("rating")
                winner = g.get("winner")
                if winner == "white":
                    result = "1-0"
                elif winner == "black":
                    result = "0-1"
                else:
                    result = "1/2-1/2"

                opening = g.get("opening", {})
                # lastMoveAt is in milliseconds; convert to Unix seconds
                last_move_ms = g.get("lastMoveAt") or g.get("createdAt")
                end_time = (last_move_ms // 1000) if last_move_ms else None
                games.append({
                    "source": "lichess",
                    "id": g.get("id", ""),
                    "white": white,
                    "black": black,
                    "white_rating": white_rating,
                    "black_rating": black_rating,
                    "result": result,
                    "time_control": _format_tc(g.get("clock", {})),
                    "url": f"https://lichess.org/{g.get('id', '')}",
                    "opening": opening.get("name", "") if opening else "",
                    "pgn": g.get("pgn", ""),
                    "end_time": end_time,
                })
    return games


def _format_tc(clock: dict) -> str:
    if not clock:
        return "?"
    initial = clock.get("initial", 0) // 60
    increment = clock.get("increment", 0)
    return f"{initial}+{increment}"
