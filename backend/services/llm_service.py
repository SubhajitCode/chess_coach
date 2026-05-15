import os
import json
import logging
from dataclasses import dataclass
from openai import AsyncOpenAI

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
GOOGLE_AI_STUDIO_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_PROVIDER = "openrouter"
DEFAULT_MODEL_BY_PROVIDER = {
    "openrouter": "meta-llama/llama-3.3-8b-instruct:free",
    "google_ai_studio": "gemini-3-flash-preview",
}
COACHING_CACHE_VERSION = 2
PER_MOVE_CHUNK_SIZE = 12
PER_MOVE_RETRY_CHUNK_SIZE = 4
PER_MOVE_CONTEXT_OVERLAP = 2
PER_MOVE_MAX_TOKENS = 2048
PER_MOVE_STRICT_MAX_TOKENS = 1024

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    api_key: str
    base_url: str
    model: str
    default_headers: dict[str, str] | None = None


def _normalise_provider(raw_provider: str | None) -> str:
    provider = (raw_provider or DEFAULT_PROVIDER).strip().lower().replace("-", "_")
    aliases = {
        "openrouter": "openrouter",
        "google": "google_ai_studio",
        "gemini": "google_ai_studio",
        "google_ai_studio": "google_ai_studio",
        "googleaistudio": "google_ai_studio",
    }
    normalized = aliases.get(provider)
    if not normalized:
        raise ValueError(
            "Unsupported LLM_PROVIDER. Use 'openrouter' or 'google_ai_studio'."
        )
    return normalized


def _get_llm_config(api_key: str = None, model: str = None) -> LLMConfig:
    provider = _normalise_provider(os.getenv("LLM_PROVIDER"))

    if provider == "openrouter":
        resolved_api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("OPENROUTER_API_KEY")
        resolved_model = (
            model
            or os.getenv("LLM_MODEL")
            or os.getenv("OPENROUTER_MODEL")
            or DEFAULT_MODEL_BY_PROVIDER[provider]
        )
        base_url = os.getenv("LLM_BASE_URL") or os.getenv("OPENROUTER_BASE_URL") or OPENROUTER_BASE
        default_headers = {
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Chess Analyzer",
        }
    else:
        resolved_api_key = (
            api_key
            or os.getenv("LLM_API_KEY")
            or os.getenv("GOOGLE_AI_STUDIO_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )
        resolved_model = (
            model
            or os.getenv("LLM_MODEL")
            or os.getenv("GOOGLE_AI_STUDIO_MODEL")
            or os.getenv("GEMINI_MODEL")
            or DEFAULT_MODEL_BY_PROVIDER[provider]
        )
        base_url = (
            os.getenv("LLM_BASE_URL")
            or os.getenv("GOOGLE_AI_STUDIO_BASE_URL")
            or GOOGLE_AI_STUDIO_BASE
        )
        default_headers = None

    if not resolved_api_key:
        if provider == "openrouter":
            raise ValueError(
                "Missing OpenRouter API key. Set OPENROUTER_API_KEY or LLM_API_KEY."
            )
        raise ValueError(
            "Missing Google AI Studio API key. Set GOOGLE_AI_STUDIO_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, or LLM_API_KEY."
        )

    return LLMConfig(
        provider=provider,
        api_key=resolved_api_key,
        base_url=base_url,
        model=resolved_model,
        default_headers=default_headers,
    )


def _get_client(config: LLMConfig) -> AsyncOpenAI:
    kwargs = {
        "base_url": config.base_url,
        "api_key": config.api_key,
    }
    if config.default_headers:
        kwargs["default_headers"] = config.default_headers
    return AsyncOpenAI(**kwargs)


def _preview_text(text: str, limit: int = 200) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[:limit] + "..."


def _sentence_case(text: str | None) -> str | None:
    if not text:
        return None
    return text[:1].upper() + text[1:]


def _move_role(move: dict, player_color: str) -> str:
    return "player" if move.get("color") == player_color else "opponent"


def _best_line_preview(move: dict) -> str:
    best_line = [san for san in move.get("best_line_san", []) if san]
    return " ".join(best_line[:4]) if best_line else "n/a"


def _build_critical_line(move: dict, player_color: str, index: int) -> str:
    cp_loss = move.get("cp_loss", 0) or 0
    detail = (
        f"  {index}. Move {move.get('move_number', '?')} ({player_color}): played {move.get('move_san', '?')} "
        f"[{move.get('classification', 'good')}, -{cp_loss:.0f}cp]."
    )
    if move.get("move_summary"):
        detail += f" Played fact: {move['move_summary']}."
    if move.get("best_move_san"):
        detail += f" Best was {move['best_move_san']}"
        if move.get("best_move_summary"):
            detail += f" ({move['best_move_summary']})"
        detail += "."
    best_line = _best_line_preview(move)
    if best_line != "n/a":
        detail += f" PV: {best_line}."
    return detail


def _build_prompt(analysis: dict, player_color: str, username: str = None) -> str:
    white = analysis.get("white", "White")
    black = analysis.get("black", "Black")
    result = analysis.get("result", "*")
    opening = analysis.get("opening") or "Unknown opening"
    time_control = analysis.get("time_control") or "Unknown"
    summary = analysis.get("summary", {})
    moves = analysis.get("moves", [])

    player_name = username or (white if player_color == "white" else black)

    player_moves = [m for m in moves if m.get("color") == player_color]
    critical = sorted(
        [m for m in player_moves if m.get("classification") in ("blunder", "mistake")],
        key=lambda m: m.get("cp_loss", 0),
        reverse=True,
    )[:5]

    critical_text = "\n".join(
        _build_critical_line(move, player_color, index)
        for index, move in enumerate(critical, 1)
    )
    if not critical_text:
        critical_text = "  No critical mistakes found — you played very well!"

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

Instructions:
- Treat "Played fact", "Best was (...)", and "PV" as authoritative chess facts.
- Do not invent piece identities, captures, or square contents that are not explicitly supported by those facts.
- Prefer concrete, position-specific explanations over generic advice.

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
    config = _get_llm_config(api_key=api_key, model=model)
    client = _get_client(config)
    prompt = _build_prompt(analysis, player_color, username)

    logger.info(
        "llm coaching request provider=%s model=%s player_color=%s moves=%s prompt_preview=%s",
        config.provider,
        config.model,
        player_color,
        len(analysis.get("moves", [])),
        _preview_text(prompt),
    )

    response = await client.chat.completions.create(
        model=config.model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024,
        temperature=0.7,
    )

    content = response.choices[0].message.content or "No coaching response received."
    logger.info(
        "llm coaching response provider=%s model=%s preview=%s",
        config.provider,
        config.model,
        _preview_text(content),
    )
    return content


def _build_game_brief(analysis: dict, player_color: str, username: str = None) -> str:
    white = analysis.get("white", "White")
    black = analysis.get("black", "Black")
    result = analysis.get("result", "*")
    opening = analysis.get("opening") or "Unknown opening"
    time_control = analysis.get("time_control") or "Unknown"
    summary = analysis.get("summary", {})
    moves = analysis.get("moves", [])

    player_name = username or (white if player_color == "white" else black)
    opponent_color = "black" if player_color == "white" else "white"
    opponent_name = black if player_color == "white" else white

    player_moves = [m for m in moves if m.get("color") == player_color]
    critical = sorted(
        [m for m in player_moves if m.get("classification") in ("blunder", "mistake", "inaccuracy")],
        key=lambda m: m.get("cp_loss", 0) or 0,
        reverse=True,
    )[:3]

    critical_lines = []
    for move in critical:
        cp_loss = move.get("cp_loss", 0) or 0
        detail = (
            f"move {move.get('move_number', '?')} {move.get('color', '?')} {move.get('move_san', '?')} "
            f"[{move.get('classification', 'good')}, loss={cp_loss:.0f}cp"
        )
        if move.get("move_summary"):
            detail += f", played={move['move_summary']}"
        if move.get("best_move_san"):
            detail += f", best={move['best_move_san']}"
        if move.get("best_move_summary"):
            detail += f", best_fact={move['best_move_summary']}"
        detail += "]"
        critical_lines.append(detail)

    if not critical_lines:
        critical_lines.append("no major mistakes in the analyzed game")

    return "\n".join([
        f"player={player_name} ({player_color}) vs {opponent_name} ({opponent_color})",
        f"result={result} opening={opening} time_control={time_control}",
        (
            "player_summary="
            f"accuracy {summary.get('accuracy', 0)}%, "
            f"blunders {summary.get('blunders', 0)}, "
            f"mistakes {summary.get('mistakes', 0)}, "
            f"inaccuracies {summary.get('inaccuracies', 0)}, "
            f"good/excellent/best {summary.get('good_moves', 0)}/{summary.get('excellent_moves', 0)}/{summary.get('best_moves', 0)}, "
            f"avg_cp_loss {summary.get('avg_cp_loss', 'n/a')}"
        ),
        "critical_player_moments=" + " | ".join(critical_lines),
    ])


def _build_move_context_lines(moves: list[dict], player_color: str, target_indices: list[int]) -> str:
    if not target_indices:
        return ""

    start = max(0, min(target_indices) - PER_MOVE_CONTEXT_OVERLAP)
    end = min(len(moves), max(target_indices) + PER_MOVE_CONTEXT_OVERLAP + 1)
    target_set = set(target_indices)
    lines = []

    for idx in range(start, end):
        move = moves[idx]
        prefix = "*" if idx in target_set else "-"
        role = "player" if move.get("color") == player_color else "opponent"
        move_num = move.get("move_number", "?")
        color = move.get("color", "?")
        san = move.get("move_san", "?")
        cls = move.get("classification", "good")
        cp_loss = move.get("cp_loss", 0) or 0
        line = f"{prefix} idx={idx} move={move_num} color={color} role={role} san={san} class={cls}"
        if cp_loss > 0:
            line += f" loss={cp_loss:.0f}cp"
        if move.get("move_summary"):
            line += f" played=\"{move['move_summary']}\""
        if move.get("best_move_san") and cls not in ("best", "excellent", "good"):
            line += f" best={move['best_move_san']}"
        lines.append(line)

    return "\n".join(lines)


def _build_target_move_fact_blocks(moves: list[dict], player_color: str, target_indices: list[int]) -> str:
    blocks = []
    for idx in target_indices:
        move = moves[idx]
        role = _move_role(move, player_color)
        cp_loss = move.get("cp_loss", 0) or 0
        eval_before = move.get("eval_before", "n/a")
        eval_after = move.get("eval_after", "n/a")
        blocks.append(
            "\n".join([
                f"TARGET idx={idx} role={role} color={move.get('color', '?')} move_number={move.get('move_number', '?')}",
                f"played_move={move.get('move_san', '?')}",
                f"played_fact={move.get('move_summary') or 'n/a'}",
                f"classification={move.get('classification', 'good')}",
                f"cp_loss={cp_loss:.0f}",
                f"eval_before={eval_before}",
                f"eval_after={eval_after}",
                f"best_move={move.get('best_move_san') or 'n/a'}",
                f"best_move_fact={move.get('best_move_summary') or 'n/a'}",
                f"best_line={_best_line_preview(move)}",
                f"fen_before={move.get('fen_before') or 'n/a'}",
            ])
        )
    return "\n\n".join(blocks)


def _deterministic_feedback(move: dict, player_color: str) -> str | None:
    classification = move.get("classification")
    cp_loss = move.get("cp_loss", 0) or 0
    if classification not in ("inaccuracy", "mistake", "blunder") or cp_loss < 80:
        return None

    role = _move_role(move, player_color)
    best_move = move.get("best_move_san")
    best_fact = _sentence_case(move.get("best_move_summary"))
    best_line = _best_line_preview(move)
    if not best_move or not best_fact:
        return None

    if move.get("best_move_is_checkmate"):
        if role == "player":
            return f"You missed {best_move}. {best_fact}. That was a forced tactical finish."
        return f"This gave you a winning chance: {best_move}. {best_fact}. That was a forced tactical finish."

    if move.get("best_move_is_capture") and move.get("best_move_captured_piece"):
        if role == "player":
            feedback = f"You missed {best_move}. {best_fact}."
        else:
            feedback = f"This gave you a tactical chance: {best_move}. {best_fact}."
        if best_line != "n/a":
            feedback += f" The best line starts {best_line}."
        return feedback

    return None


def _build_per_move_chunk_prompt(
    analysis: dict,
    player_color: str,
    target_indices: list[int],
    username: str = None,
    strict_json: bool = False,
) -> str:
    white = analysis.get("white", "White")
    black = analysis.get("black", "Black")
    result = analysis.get("result", "*")
    opening = analysis.get("opening") or "Unknown opening"
    moves = analysis.get("moves", [])

    player_name = username or (white if player_color == "white" else black)
    move_window = _build_move_context_lines(moves, player_color, target_indices)
    target_blocks = _build_target_move_fact_blocks(moves, player_color, target_indices)
    game_brief = _build_game_brief(analysis, player_color, username)
    target_list = ", ".join(str(idx) for idx in target_indices)
    strict_block = ""
    if strict_json:
        strict_block = (
            "\nSTRICT OUTPUT CONTRACT:\n"
            "- Start the first character with [\n"
            "- End the final character with ]\n"
            "- Do not include analysis, notes, or thinking before or after the JSON array\n"
            "- If you are about to explain your reasoning, do not; output the JSON array directly\n"
        )

    return f"""You are an expert chess coach writing concise per-move feedback for "{player_name}" who played as {player_color}.

Use the compressed game brief and the local move window below. Give feedback ONLY for target moves (lines starting with "*"). Lines starting with "-" are context only.

Rules:
- Respond with ONLY a JSON array. No markdown or extra text.
- Return exactly one item for every target move index: {target_list}
- Each item must be {{"move_index": <number>, "feedback": "<text>"}}
- Keep each feedback to at most 2 sentences and about 45 words.
- For the player's strong moves, explain the idea or strength briefly.
- For the player's weak moves, explain what went wrong and what the better move achieved.
- For the opponent's strong moves, explain the threat or idea created against the player.
- For the opponent's weak moves, explain the chance it gave the player.
- Use natural coaching language like "You found...", "Your opponent created...", "This gave you a chance...".
- Treat `played_fact`, `best_move_fact`, and `best_line` as authoritative.
- Never invent piece identities, captures, or square contents that are not explicitly supported by those facts.
- If a fact is missing, stay generic instead of guessing.
- Do not omit any target move.
{strict_block}

GAME BRIEF:
{game_brief}

GAME: {white} vs {black} | Result: {result} | Opening: {opening}

TARGET MOVE FACTS:
{target_blocks}

LOCAL MOVE WINDOW:
{move_window}
"""


def _group_target_indices(target_indices: list[int], chunk_size: int, max_gap: int = 3) -> list[list[int]]:
    if not target_indices:
        return []

    groups: list[list[int]] = []
    current_group = [target_indices[0]]

    for idx in target_indices[1:]:
        if len(current_group) >= chunk_size or idx - current_group[-1] > max_gap:
            groups.append(current_group)
            current_group = [idx]
            continue
        current_group.append(idx)

    groups.append(current_group)
    return groups


def _normalise_coaching_items(coaching_list: list, allowed_indices: set[int]) -> list[dict]:
    result = []
    seen = set()
    for item in coaching_list:
        if not isinstance(item, dict) or "move_index" not in item or "feedback" not in item:
            continue
        try:
            move_index = int(item["move_index"])
        except (TypeError, ValueError):
            continue
        if move_index in seen or move_index not in allowed_indices:
            continue
        feedback = " ".join(str(item["feedback"]).split()).strip()
        if not feedback:
            continue
        seen.add(move_index)
        result.append({"move_index": move_index, "feedback": feedback})
    return result


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

    # Recover fully-formed objects from a truncated JSON array.
    if start != -1:
        decoder = json.JSONDecoder()
        idx = start + 1
        items = []
        raw_len = len(raw)

        while idx < raw_len:
            while idx < raw_len and raw[idx] in " \t\r\n,":
                idx += 1

            if idx >= raw_len or raw[idx] == "]":
                break

            try:
                obj, next_idx = decoder.raw_decode(raw, idx)
            except json.JSONDecodeError:
                break

            items.append(obj)
            idx = next_idx

        if items:
            return items

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


def _build_per_move_messages(prompt: str, strict_json: bool = False) -> list[dict[str, str]]:
    system = (
        "You are a JSON generator for chess coaching. "
        "Return only a valid JSON array of objects with keys move_index and feedback. "
        "Do not reveal reasoning. Do not add commentary, markdown, or prose."
    )
    if strict_json:
        system += (
            " The first character of your response must be '[' and the last character must be ']'. "
            "If you were going to think aloud, suppress that and output the JSON array immediately."
        )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]


async def _request_per_move_group(
    client: AsyncOpenAI,
    chosen_model: str,
    analysis: dict,
    player_color: str,
    group: list[int],
    username: str | None,
    strict_json: bool,
) -> tuple[list[dict], str]:
    prompt = _build_per_move_chunk_prompt(
        analysis,
        player_color,
        group,
        username,
        strict_json=strict_json,
    )
    logger.info(
        "llm per-move request model=%s strict=%s group=%s prompt_preview=%s",
        chosen_model,
        strict_json,
        group,
        _preview_text(prompt),
    )
    response = await client.chat.completions.create(
        model=chosen_model,
        messages=_build_per_move_messages(prompt, strict_json=strict_json),
        max_tokens=PER_MOVE_STRICT_MAX_TOKENS if strict_json else PER_MOVE_MAX_TOKENS,
        temperature=0.0 if strict_json else 0.2,
    )

    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        logger.warning(
            "llm per-move empty response model=%s strict=%s group=%s",
            chosen_model,
            strict_json,
            group,
        )
        raise ValueError("LLM returned an empty response")

    logger.info(
        "llm per-move raw response model=%s strict=%s group=%s preview=%s",
        chosen_model,
        strict_json,
        group,
        _preview_text(raw, limit=300),
    )
    coaching_list = _extract_json_array(raw)
    items = _normalise_coaching_items(coaching_list, set(group))
    logger.info(
        "llm per-move parsed model=%s strict=%s group=%s parsed=%s expected=%s",
        chosen_model,
        strict_json,
        group,
        len(items),
        len(group),
    )
    return items, raw


async def get_per_move_coaching(
    analysis: dict,
    player_color: str,
    username: str = None,
    api_key: str = None,
    model: str = None,
    target_move_indices: list[int] | None = None,
) -> list[dict]:
    """Return {move_index, feedback} dicts for the requested moves using chunked prompts."""
    config = _get_llm_config(api_key=api_key, model=model)
    client = _get_client(config)
    moves = analysis.get("moves", [])
    if not moves:
        return []

    total_moves = len(moves)
    if target_move_indices is None:
        requested_indices = list(range(total_moves))
    else:
        requested_indices = sorted({idx for idx in target_move_indices if 0 <= idx < total_moves})

    if not requested_indices:
        return []

    feedback_by_index: dict[int, str] = {}
    for idx in requested_indices:
        deterministic = _deterministic_feedback(moves[idx], player_color)
        if deterministic:
            feedback_by_index[idx] = deterministic

    remaining_indices = [idx for idx in requested_indices if idx not in feedback_by_index]
    if not remaining_indices:
        return [{"move_index": idx, "feedback": feedback_by_index[idx]} for idx in requested_indices]

    chunk_groups = _group_target_indices(remaining_indices, PER_MOVE_CHUNK_SIZE)

    async def process_group(group: list[int]) -> None:
        raw_error = None

        for strict_json in (False, True):
            try:
                items, _ = await _request_per_move_group(
                    client,
                    config.model,
                    analysis,
                    player_color,
                    group,
                    username,
                    strict_json,
                )
            except ValueError as exc:
                raw_error = str(exc)
                logger.warning(
                    "llm per-move parse failure model=%s strict=%s group=%s error=%s",
                    config.model,
                    strict_json,
                    group,
                    raw_error,
                )
                items = []

            if len(items) == len(group):
                for item in items:
                    feedback_by_index[item["move_index"]] = item["feedback"]
                return

            if items:
                for item in items:
                    feedback_by_index[item["move_index"]] = item["feedback"]

        unresolved = [idx for idx in group if idx not in feedback_by_index]
        if not unresolved:
            return

        if len(unresolved) == 1:
            detail = raw_error or f"LLM did not return feedback for move index {unresolved[0]}"
            logger.error(
                "llm per-move unresolved single index model=%s index=%s error=%s",
                config.model,
                unresolved[0],
                detail,
            )
            raise ValueError(detail)

        midpoint = len(unresolved) // 2
        logger.info(
            "llm per-move splitting unresolved group model=%s unresolved=%s left=%s right=%s",
            config.model,
            unresolved,
            unresolved[:midpoint],
            unresolved[midpoint:],
        )
        await process_group(unresolved[:midpoint])
        await process_group(unresolved[midpoint:])

    async def generate_groups(groups: list[list[int]]) -> None:
        for group in groups:
            await process_group(group)

    await generate_groups(chunk_groups)

    missing_indices = [idx for idx in requested_indices if idx not in feedback_by_index]
    if missing_indices:
        retry_groups = _group_target_indices(missing_indices, PER_MOVE_RETRY_CHUNK_SIZE, max_gap=1)
        await generate_groups(retry_groups)

    still_missing = [idx for idx in requested_indices if idx not in feedback_by_index]
    if still_missing:
        preview = ", ".join(str(idx) for idx in still_missing[:10])
        raise ValueError(f"LLM did not return feedback for move indices: {preview}")

    return [{"move_index": idx, "feedback": feedback_by_index[idx]} for idx in requested_indices]
