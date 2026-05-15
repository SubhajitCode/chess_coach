import os
import json
from openai import AsyncOpenAI

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "meta-llama/llama-3.3-8b-instruct:free"


def _get_client(api_key: str = None) -> AsyncOpenAI:
    key = api_key or os.getenv("OPENROUTER_API_KEY", "")
    return AsyncOpenAI(
        base_url=OPENROUTER_BASE,
        api_key=key,
        default_headers={
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Chess Analyzer",
        },
    )


def _build_prompt(analysis: dict, player_color: str, username: str = None) -> str:
    white = analysis.get("white", "White")
    black = analysis.get("black", "Black")
    result = analysis.get("result", "*")
    opening = analysis.get("opening") or "Unknown opening"
    time_control = analysis.get("time_control") or "Unknown"
    summary = analysis.get("summary", {})
    moves = analysis.get("moves", [])

    player_name = username or (white if player_color == "white" else black)

    # Find top mistakes/blunders for the player
    player_moves = [m for m in moves if m.get("color") == player_color]
    critical = sorted(
        [m for m in player_moves if m.get("classification") in ("blunder", "mistake")],
        key=lambda m: m.get("cp_loss", 0),
        reverse=True,
    )[:5]

    critical_text = ""
    for i, m in enumerate(critical, 1):
        move_num = m.get("move_number", "?")
        san = m.get("move_san", "?")
        best = m.get("best_move_san", "?")
        cp = m.get("cp_loss", 0)
        cls = m.get("classification", "mistake")
        critical_text += (
            f"  {i}. Move {move_num} ({player_color}): played {san} [{cls}, -{cp:.0f}cp]. "
            f"Best was {best}.\n"
        )

    if not critical_text:
        critical_text = "  No critical mistakes found — you played very well!\n"

    prompt = f"""You are an expert chess coach analyzing a game for player "{player_name}" who played as {player_color}.

GAME DETAILS:
- White: {white} vs Black: {black}
- Result: {result}
- Opening: {opening}
- Time Control: {time_control}

PLAYER STATISTICS (for {player_color}):
- Accuracy: {summary.get('accuracy', 0)}%
- Blunders: {summary.get('blunders', 0)}
- Mistakes: {summary.get('mistakes', 0)}
- Inaccuracies: {summary.get('inaccuracies', 0)}
- Good/Excellent/Best moves: {summary.get('good_moves', 0)}/{summary.get('excellent_moves', 0)}/{summary.get('best_moves', 0)}

CRITICAL MOMENTS (top errors by centipawn loss):
{critical_text}
Please provide a structured coaching report with the following sections:

1. **Game Overview** (2-3 sentences summarizing how the game went)
2. **Critical Mistakes Explained** (for each critical moment above: why the move was bad, what was happening positionally/tactically, and what the better move would have achieved)
3. **Patterns & Weaknesses** (what patterns do these mistakes reveal about areas to improve?)
4. **Opening Feedback** (brief comment on the opening played)
5. **Actionable Improvement Tips** (3-5 concrete things the player should practice or study)

Be encouraging but honest. Use chess terminology appropriately. Keep the total response under 600 words."""

    return prompt


async def get_coaching(
    analysis: dict,
    player_color: str,
    username: str = None,
    api_key: str = None,
    model: str = None,
) -> str:
    client = _get_client(api_key)
    chosen_model = model or os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    prompt = _build_prompt(analysis, player_color, username)

    response = await client.chat.completions.create(
        model=chosen_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024,
        temperature=0.7,
    )

    return response.choices[0].message.content or "No coaching response received."


def _build_per_move_prompt(analysis: dict, player_color: str, username: str = None) -> str:
    white = analysis.get("white", "White")
    black = analysis.get("black", "Black")
    result = analysis.get("result", "*")
    opening = analysis.get("opening") or "Unknown opening"
    moves = analysis.get("moves", [])

    player_name = username or (white if player_color == "white" else black)
    opponent_color = "black" if player_color == "white" else "white"

    move_lines = []
    for i, m in enumerate(moves):
        move_num = m.get("move_number", "?")
        san = m.get("move_san", "?")
        best = m.get("best_move_san", "?")
        cp = m.get("cp_loss", 0) or 0
        cls = m.get("classification", "good")
        mover_color = m.get("color", "?")
        mover_role = "player" if mover_color == player_color else "opponent"
        line = f'  move_index={i}, move {move_num} {mover_color} ({mover_role}): played {san} [{cls}'
        if cp > 0:
            line += f", -{cp:.0f}cp loss"
        if best and cls not in ("best", "excellent", "good"):
            line += f", best was {best}"
        line += "]"
        move_lines.append(line)

    moves_text = "\n".join(move_lines) if move_lines else "  (no moves found)"

    prompt = f"""You are an expert chess coach giving per-move feedback for "{player_name}" who played as {player_color}.

GAME: {white} vs {black} | Result: {result} | Opening: {opening}

For EACH move listed below, write a brief coaching comment from {player_name}'s perspective. Cover BOTH players' moves.
- For the player's BEST / EXCELLENT / GOOD moves: give a short, genuine compliment about what makes the move strong (1 sentence).
- For the player's INACCURACY / MISTAKE / BLUNDER moves: explain what went wrong and what the better move achieves (2 sentences max). Be specific.
- For the opponent's BEST / EXCELLENT / GOOD moves: explain why the move was strong and what idea or threat it created against the player (1 sentence).
- For the opponent's INACCURACY / MISTAKE / BLUNDER moves: explain what chance it gave the player and what stronger move the opponent had instead (2 sentences max).
- Use natural coaching language like "You found...", "Your opponent created...", "This gave you a chance to...".

Respond with ONLY a JSON array. No markdown, no explanation, no extra text — just raw JSON.
[
  {{"move_index": <number>, "feedback": "<text>"}},
  ...
]

MOVES:
{moves_text}

The player is {player_color}. The opponent is {opponent_color}."""

    return prompt


def _extract_json_array(raw: str) -> list:
    """Robustly extract a JSON array from LLM output that may include surrounding text."""
    # Strip markdown fences
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            stripped = part.strip()
            if stripped.startswith("json"):
                stripped = stripped[4:].strip()
            if stripped.startswith("["):
                raw = stripped
                break

    # Try direct parse first
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass

    # Find first '[' and last ']' and try parsing between them
    start = raw.find("[")
    end = raw.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(raw[start : end + 1])
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    # Last resort: try to parse each line that looks like a JSON object
    items = []
    for line in raw.splitlines():
        line = line.strip().rstrip(",")
        if line.startswith("{") and line.endswith("}"):
            try:
                obj = json.loads(line)
                if "move_index" in obj and "feedback" in obj:
                    items.append(obj)
            except json.JSONDecodeError:
                pass
    if items:
        return items

    raise ValueError(f"Could not parse JSON from LLM response. Raw (first 300 chars): {raw[:300]}")


async def get_per_move_coaching(
    analysis: dict,
    player_color: str,
    username: str = None,
    api_key: str = None,
    model: str = None,
) -> list[dict]:
    """Return a list of {move_index, feedback} dicts — one per move."""
    client = _get_client(api_key)
    chosen_model = model or os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    prompt = _build_per_move_prompt(analysis, player_color, username)

    response = await client.chat.completions.create(
        model=chosen_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4096,
        temperature=0.5,
    )

    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError("LLM returned an empty response")

    coaching_list = _extract_json_array(raw)

    # Normalise: ensure each entry has move_index (int) and feedback (str)
    result = []
    for item in coaching_list:
        if isinstance(item, dict) and "move_index" in item and "feedback" in item:
            result.append({
                "move_index": int(item["move_index"]),
                "feedback": str(item["feedback"]),
            })
    return result
