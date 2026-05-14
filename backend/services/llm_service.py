import os
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
