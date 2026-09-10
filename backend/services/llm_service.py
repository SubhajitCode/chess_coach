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
COACHING_CACHE_VERSION = 5
GAME_OVERVIEW_CACHE_VERSION = 1
PER_MOVE_CHUNK_SIZE = 12
PER_MOVE_RETRY_CHUNK_SIZE = 4
PER_MOVE_CONTEXT_OVERLAP = 2
PER_MOVE_MAX_TOKENS = 2048
PER_MOVE_STRICT_MAX_TOKENS = 1024

logger = logging.getLogger(__name__)

TIME_CONTROL_EMPHASIS = {
    "blitz": "Emphasize fast blunder checks, practical decisions, and simple candidate-move habits that survive time pressure.",
    "rapid": "Emphasize disciplined candidate-move selection, short calculation, and turning extra time into cleaner practical choices.",
    "classical": "Emphasize deeper calculation, long-term plans, and avoiding lazy assumptions in critical positions.",
    "daily": "Emphasize calculation discipline, plan comparison, and using available time to verify forcing lines carefully.",
    "mixed": "Balance practical pattern recognition with calculation habits that transfer across online games.",
}

IMPROVEMENT_GOAL_EMPHASIS = {
    "blunder_reduction": "Prioritize one-move tactical oversights, loose pieces, forcing replies, and moments where a safety check would have saved the position.",
    "tactical_awareness": "Prioritize checks, captures, threats, and the tactical motifs that appeared just before the evaluation swing.",
    "opening_understanding": "Prioritize the first uncomfortable decisions after theory and explain the plans and structures the player should remember next time.",
    "conversion": "Prioritize keeping control when better, choosing practical plans, and avoiding unnecessary complications after gaining an edge.",
    "defense": "Prioritize resilient resources, damage limitation, and practical defensive choices in worse positions.",
    "endgames": "Prioritize simplification decisions, king activity, pawn structure, and recurring endgame technique errors.",
}

FOCUS_AREA_EMPHASIS = {
    "forcing_moves": "Keep reinforcing a forcing-moves checklist: checks, captures, and direct threats before quieter options.",
    "calculation": "Reinforce candidate-move discipline and concrete calculation rather than instinctive play.",
    "time_management": "Point out where a simple pause or faster practical decision would improve time management.",
    "opening_plans": "Anchor the advice in typical plans, piece placement, and pawn-structure ideas rather than memorized theory.",
    "conversion": "Highlight how to simplify, reduce counterplay, and convert advantages with lower risk.",
    "defense": "Highlight how to stay stubborn, reduce tactical damage, and find practical defensive resources.",
}


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


def _clean_profile_value(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _normalise_profile(profile: dict | None) -> dict[str, str | None]:
    profile = profile or {}
    return {
        "main_time_control": _clean_profile_value(profile.get("main_time_control")),
        "improvement_goal": _clean_profile_value(profile.get("improvement_goal")),
        "focus_area": _clean_profile_value(profile.get("focus_area")),
    }


def _pretty_profile_label(value: str | None) -> str | None:
    cleaned = _clean_profile_value(value)
    if not cleaned:
        return None
    return cleaned.replace("_", " ").replace("/", " / ").title()


def _build_profile_context_block(profile: dict | None, game_time_control: str | None) -> str:
    context = _normalise_profile(profile)
    lines: list[str] = []

    main_time_control = context["main_time_control"]
    improvement_goal = context["improvement_goal"]
    focus_area = context["focus_area"]

    if main_time_control:
        time_control_emphasis = TIME_CONTROL_EMPHASIS.get(
            main_time_control,
            "Keep the coaching practical for the player's usual games.",
        )
        lines.append(
            f"- Main training time control: {_pretty_profile_label(main_time_control)}. "
            f"{time_control_emphasis}"
        )
    if improvement_goal:
        goal_emphasis = IMPROVEMENT_GOAL_EMPHASIS.get(
            improvement_goal,
            "Bias the coaching toward the player's stated improvement goal.",
        )
        lines.append(
            f"- Current improvement goal: {_pretty_profile_label(improvement_goal)}. "
            f"{goal_emphasis}"
        )
    if focus_area:
        focus_emphasis = FOCUS_AREA_EMPHASIS.get(
            focus_area,
            "Reinforce this focus when the position genuinely supports it.",
        )
        lines.append(
            f"- Current focus area: {_pretty_profile_label(focus_area)}. "
            f"{focus_emphasis}"
        )
    if main_time_control and game_time_control:
        lines.append(
            f"- Use the actual game time control ({game_time_control}) for position-specific judgment, "
            f"but phrase the advice so it still helps the player's usual {_pretty_profile_label(main_time_control).lower()} games."
        )

    if not lines:
        return "- No saved coaching profile. Give balanced practical advice for an intermediate online improver."

    lines.append(
        "- Use the profile to prioritize what matters, but do not force the same theme into every position when the facts point elsewhere."
    )
    return "\n".join(lines)


def _build_profile_context_brief(profile: dict | None, game_time_control: str | None) -> str:
    context = _normalise_profile(profile)
    parts: list[str] = []

    if context["main_time_control"]:
        parts.append(f"usual_time_control={context['main_time_control']}")
    if context["improvement_goal"]:
        parts.append(f"goal={context['improvement_goal']}")
    if context["focus_area"]:
        parts.append(f"focus={context['focus_area']}")
    if game_time_control:
        parts.append(f"game_time_control={game_time_control}")

    if not parts:
        return "coaching_profile=balanced practical coaching for an intermediate online improver"

    emphasis_parts = []
    if context["main_time_control"]:
        emphasis_parts.append(TIME_CONTROL_EMPHASIS.get(context["main_time_control"], ""))
    if context["improvement_goal"]:
        emphasis_parts.append(IMPROVEMENT_GOAL_EMPHASIS.get(context["improvement_goal"], ""))
    if context["focus_area"]:
        emphasis_parts.append(FOCUS_AREA_EMPHASIS.get(context["focus_area"], ""))

    emphasis = " ".join(part for part in emphasis_parts if part).strip()
    if emphasis:
        return "coaching_profile=" + "; ".join(parts) + f". emphasis={emphasis}"
    return "coaching_profile=" + "; ".join(parts)


def _move_role(move: dict, player_color: str) -> str:
    return "player" if move.get("color") == player_color else "opponent"


def _best_line_preview(move: dict) -> str:
    best_line = [san for san in move.get("best_line_san", []) if san]
    return " ".join(best_line[:4]) if best_line else "n/a"


def _reply_line_preview(move: dict) -> str:
    reply_line = [san for san in move.get("reply_line_san", []) if san]
    return " ".join(reply_line[:4]) if reply_line else "n/a"


def _build_critical_line(move: dict, player_color: str, index: int) -> str:
    cp_loss = move.get("cp_loss", 0) or 0
    detail = (
        f"  {index}. Move {move.get('move_number', '?')} ({player_color}): played {move.get('move_san', '?')} "
        f"[{move.get('classification', 'good')}, -{cp_loss:.0f}cp]."
    )
    if move.get("move_summary"):
        detail += f" Played fact: {move['move_summary']}."
    if move.get("threat_summary"):
        detail += f" Threat: {move['threat_summary']}."
    motifs = move.get("motifs", [])
    if motifs:
        detail += f" Tactical motifs: {', '.join(motifs[:4])}."
    if move.get("best_move_san"):
        detail += f" Best was {move['best_move_san']}"
        if move.get("best_move_summary"):
            detail += f" ({move['best_move_summary']})"
    if move.get("findability_tier"):
        detail += f" Findability: {move['findability_tier']} ({move.get('findability_score', 0):.0f}% confidence)."
    if move.get("practical_best_move_san") and move.get("practical_best_move_san") != move.get("best_move_san"):
        detail += f" Practical human choice was {move['practical_best_move_san']}."
    best_line = _best_line_preview(move)
    if best_line != "n/a":
        detail += f" PV: {best_line}."
    return detail


def _build_prompt(
    analysis: dict,
    player_color: str,
    username: str = None,
    profile: dict | None = None,
) -> str:
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
    profile_context = _build_profile_context_block(profile, time_control)

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

PLAYER COACHING PROFILE:
{profile_context}

Instructions:
- Treat "Played fact", "Best was (...)", and "PV" as authoritative chess facts.
- Do not invent piece identities, captures, or square contents that are not explicitly supported by those facts.
- Prefer concrete, position-specific explanations over generic advice.
- Tailor the patterns, opening feedback, and actionable tips to the saved coaching profile when it is relevant to the game facts.

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
    profile: dict | None = None,
    api_key: str = None,
    model: str = None,
) -> str:
    config = _get_llm_config(api_key=api_key, model=model)
    client = _get_client(config)
    prompt = _build_prompt(analysis, player_color, username, profile)

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


def _build_overview_key_moment_facts(moves: list[dict]) -> list[dict]:
    candidates = []
    for idx, move in enumerate(moves):
        classification = move.get("classification")
        cp_loss = float(move.get("cp_loss") or 0)
        is_critical = classification in ("blunder", "mistake") or cp_loss >= 80
        is_tactical = bool(move.get("move_is_checkmate") or move.get("move_is_capture") or move.get("move_is_check"))
        if is_critical or is_tactical:
            candidates.append({
                "index": idx,
                "score": cp_loss + (80 if classification == "blunder" else 40 if classification == "mistake" else 0),
                "move": move,
            })

    top = sorted(candidates, key=lambda item: item["score"], reverse=True)[:8]
    return sorted(top, key=lambda item: item["index"])


def _build_game_overview_prompt(
    analysis: dict,
    player_color: str,
    username: str | None = None,
    profile: dict | None = None,
) -> str:
    white = analysis.get("white", "White")
    black = analysis.get("black", "Black")
    result = analysis.get("result", "*")
    opening = analysis.get("opening") or "Unknown opening"
    time_control = analysis.get("time_control") or "Unknown"
    summary = analysis.get("summary", {})
    moves = analysis.get("moves", [])
    player_name = username or (white if player_color == "white" else black)
    profile_context = _build_profile_context_brief(profile, time_control)
    key_moments = _build_overview_key_moment_facts(moves)

    moment_lines = []
    for item in key_moments:
        move = item["move"]
        idx = item["index"]
        cp_loss = float(move.get("cp_loss") or 0)
        line = (
            f"- idx={idx} move={move.get('move_number', '?')} {move.get('color', '?')} {move.get('move_san', '?')} "
            f"class={move.get('classification', 'good')} cp_loss={cp_loss:.0f}"
        )
        if move.get("move_summary"):
            line += f" played={move.get('move_summary')}"
        if move.get("best_move_san"):
            line += f" best={move.get('best_move_san')}"
        if move.get("best_move_summary"):
            line += f" best_fact={move.get('best_move_summary')}"
        if move.get("reply_move_san"):
            line += f" punishment={move.get('reply_move_san')}"
        moment_lines.append(line)

    if not moment_lines:
        moment_lines.append("- no major tactical or strategic swings were detected")

    return f"""You are an expert chess coach writing a concise game-level overview.

Return ONLY a valid JSON object with this exact schema:
{{
  "overview": "2-3 sentence summary of how the game unfolded",
  "key_moments": [
    "chronological step 1",
    "chronological step 2"
  ]
}}

Rules:
- No markdown, no extra keys, no prose before/after JSON.
- `overview` must be concise and factual.
- `key_moments` must be chronological, concise, and include both sides' important moves when relevant.
- Keep key moments to 4-8 items.
- Use move facts only; do not invent captures, piece locations, or tactical claims unsupported by facts.
- Tie emphasis to profile context only when supported by game facts.

GAME:
- White: {white}
- Black: {black}
- Player focus: {player_name} as {player_color}
- Result: {result}
- Opening: {opening}
- Time control: {time_control}
- Player stats: accuracy {summary.get('accuracy', 0)}%, blunders {summary.get('blunders', 0)}, mistakes {summary.get('mistakes', 0)}, inaccuracies {summary.get('inaccuracies', 0)}
- Profile context: {profile_context}

KEY MOMENT FACTS:
{chr(10).join(moment_lines)}
"""


def _extract_json_object(raw: str) -> dict:
    text = raw.strip()
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            stripped = part.strip()
            if stripped.startswith("json"):
                stripped = stripped[4:].strip()
            if stripped.startswith("{"):
                text = stripped
                break
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        parsed = json.loads(text[start:end + 1])
        if isinstance(parsed, dict):
            return parsed
    raise ValueError(f"Could not parse JSON object from LLM response. Raw (first 300 chars): {raw[:300]}")


def _normalise_game_overview_payload(payload: dict) -> dict:
    overview = " ".join(str(payload.get("overview", "")).split()).strip()
    raw_key_moments = payload.get("key_moments")
    if isinstance(raw_key_moments, list):
        key_moments = [" ".join(str(item).split()).strip() for item in raw_key_moments]
        key_moments = [item for item in key_moments if item]
    else:
        key_moments = []

    if not overview:
        raise ValueError("LLM did not return overview text")
    if not key_moments:
        raise ValueError("LLM did not return key moments")

    return {
        "overview": overview,
        "key_moments": key_moments[:8],
    }


async def get_game_overview(
    analysis: dict,
    player_color: str,
    username: str | None = None,
    profile: dict | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    config = _get_llm_config(api_key=api_key, model=model)
    client = _get_client(config)
    prompt = _build_game_overview_prompt(analysis, player_color, username, profile)
    logger.info(
        "llm game-overview request provider=%s model=%s player_color=%s prompt_preview=%s",
        config.provider,
        config.model,
        player_color,
        _preview_text(prompt),
    )
    response = await client.chat.completions.create(
        model=config.model,
        messages=[
            {
                "role": "system",
                "content": "You generate strict JSON only. Do not output markdown or explanatory prose.",
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=700,
        temperature=0.3,
    )
    raw = response.choices[0].message.content or ""
    payload = _extract_json_object(raw)
    normalized = _normalise_game_overview_payload(payload)
    logger.info(
        "llm game-overview response provider=%s model=%s key_moments=%s preview=%s",
        config.provider,
        config.model,
        len(normalized["key_moments"]),
        _preview_text(normalized["overview"]),
    )
    return normalized


def _build_game_brief(
    analysis: dict,
    player_color: str,
    username: str = None,
    profile: dict | None = None,
) -> str:
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
        _build_profile_context_brief(profile, time_control),
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
        if move.get("best_move_san") and cls not in ("best", "book", "excellent", "good"):
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
        classification = move.get("classification", "good")
        lines = [
            f"TARGET idx={idx} role={role} color={move.get('color', '?')} move_number={move.get('move_number', '?')}",
            f"played_move={move.get('move_san', '?')}",
            f"played_fact={move.get('move_summary') or 'n/a'}",
            f"classification={classification}",
            f"cp_loss={cp_loss:.0f}",
            f"eval_before={eval_before}",
            f"eval_after={eval_after}",
            f"best_move={move.get('best_move_san') or 'n/a'}",
            f"best_move_fact={move.get('best_move_summary') or 'n/a'}",
            f"best_line={_best_line_preview(move)}",
        ]
        if move.get("findability_tier"):
            lines.append(f"findability_tier={move['findability_tier']} (human_confidence={move.get('findability_score', 0):.0f}%)")
        if move.get("practical_best_move_san") and move.get("practical_best_move_san") != move.get("best_move_san"):
            lines.append(f"practical_human_alternative={move['practical_best_move_san']}")
        if move.get("is_human_blindspot"):
            lines.append("is_common_human_blindspot=true (frequent psychological mistake for 1400-1800 players)")
        if move.get("threat_summary"):
            lines.append(f"opponent_threat={move['threat_summary']}")
        if move.get("motifs"):
            lines.append(f"tactical_motifs={', '.join(move['motifs'][:4])}")
        if classification in ("inaccuracy", "mistake", "blunder") and move.get("reply_move_san"):
            lines.extend([
                f"best_reply_after_played_move={move.get('reply_move_san')}",
                f"best_reply_fact={move.get('reply_move_summary') or 'n/a'}",
                f"best_reply_line={_reply_line_preview(move)}",
            ])
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _deterministic_feedback(move: dict, player_color: str) -> str | None:
    classification = move.get("classification")
    cp_loss = move.get("cp_loss", 0) or 0
    if classification not in ("inaccuracy", "mistake", "blunder") or cp_loss < 80:
        return None

    role = _move_role(move, player_color)
    played_move = move.get("move_san", "this move")
    reply_move = move.get("reply_move_san")
    reply_line = _reply_line_preview(move)
    best_move = move.get("best_move_san")
    best_line = _best_line_preview(move)
    findability_tier = move.get("findability_tier")

    if reply_move:
        if role == "player":
            if move.get("reply_move_is_checkmate"):
                feedback = f"After {played_move}, {reply_move} delivered immediate checkmate."
            elif move.get("reply_move_is_capture") and move.get("reply_move_captured_piece"):
                feedback = f"Playing {played_move} left your {move['reply_move_captured_piece']} vulnerable, allowing {reply_move} to win material."
            elif move.get("reply_move_is_check"):
                feedback = f"After {played_move}, {reply_move} seized the initiative with check."
            else:
                feedback = f"After {played_move}, {reply_move} put your position under severe tactical pressure."
        else:
            feedback = f"This blunder opened the door for {reply_move} to take over the game."

        if best_move:
            if findability_tier == "computer_only":
                feedback += f" The computer defense was {best_move}, though difficult to spot."
            elif move.get("best_move_is_checkmate"):
                feedback += f" Instead, {best_move} would have forced immediate checkmate."
            elif move.get("best_move_is_capture") and move.get("best_move_captured_piece"):
                feedback += f" Instead, {best_move} would have won material cleanly."
            else:
                feedback += f" Instead, {best_move} was the necessary move to maintain control."
        elif reply_line != "n/a":
            feedback += f" The critical line begins with {reply_line}."
        return feedback

    if not best_move:
        return None

    if move.get("best_move_is_checkmate"):
        if role == "player":
            return f"You missed {best_move}, which would have ended the game on the spot."
        return f"This gave you a winning chance: {best_move} would have finished the game."

    if move.get("best_move_is_capture") and move.get("best_move_captured_piece"):
        if role == "player":
            feedback = f"You overlooked {best_move}, which would have won material immediately."
        else:
            feedback = f"This gave you a clear tactical opening: {best_move} wins material."
        if best_line != "n/a":
            feedback += f" Best continuation: {best_line}."
        return feedback

    return None


def _build_per_move_chunk_prompt(
    analysis: dict,
    player_color: str,
    target_indices: list[int],
    username: str = None,
    profile: dict | None = None,
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
    target_list = ", ".join(str(idx) for idx in target_indices)
    strict_block = ""
    if strict_json:
        strict_block = (
            "\nSTRICT OUTPUT CONTRACT:\n"
            "- Output ONLY a valid JSON array starting with [ and ending with ]\n"
            "- No markdown, thinking, or introductory text\n"
        )

    return f"""You are a master chess coach providing deep, instructive per-move coaching for "{player_name}" ({player_color}).

Game: {white} vs {black} ({result}) | Opening: {opening}

COACHING METHODOLOGY (3-Part Pedagogical Formula):
For each target move index, diagnose the root cause with depth and clarity:
1. [Thinking Root Cause / Temptation]: What did the player overlook or get tempted by? (e.g. Premature attack before castling, neglecting a loose piece, falling for a natural impulse).
2. [Exact Tactical Punishment]: What concrete threat or sequence did the move allow?
3. [Master Principle / Rule of Thumb]: A memorable, actionable takeaway rule for future games (e.g. "Develop knights before pushing wing pawns", "Check all opponent captures before quiet moves").

SPECIAL INSTRUCTIONS:
- When `findability_tier=computer_only`: Be empathetic. Reassure the player that the engine defense was obscure, and explain the natural practical plan.
- When `is_common_human_blindspot=true`: Highlight that this is a classic psychological trap for club players.
- For opening book moves (classification=book): Explain the central strategic goals and plans of this recognized opening setup.
- For player's strong/best moves: Explain the concrete strategic achievement (e.g. claiming the outpost, punishing overextension).
- Never output passive coordinates like "Pawn moves from e2 to e4". Speak with authoritative, instructive chess terminology.
- Respond with ONLY a JSON array with one object per target index ({target_list}):
  [{{"move_index": <number>, "feedback": "<Deep 2-3 sentence coaching feedback>"}}]
{strict_block}
TARGET MOVE FACTS:
{target_blocks}

LOCAL CONTEXT:
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
    profile: dict | None,
    strict_json: bool,
) -> tuple[list[dict], str]:
    prompt = _build_per_move_chunk_prompt(
        analysis,
        player_color,
        group,
        username,
        profile,
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
    profile: dict | None = None,
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
                    profile,
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


def _game_phase(move_number: int | None) -> str:
    if move_number is None:
        return "middlegame"
    if move_number <= 12:
        return "opening"
    if move_number >= 30:
        return "endgame"
    return "middlegame"


def _build_deviation_prompt(
    fen_before: str,
    move_uci: str,
    move_san: str | None,
    move_summary: str | None,
    player_color: str,
    eval_before: float | None,
    eval_after: float | None,
    cp_loss: float | None,
    classification: str | None,
    best_move_san: str | None,
    best_line_san: list[str],
    deviation_best_line_san: list[str],
    game_move_number: int | None,
    username: str | None,
    profile: dict | None,
) -> str:
    player_name = username or f"the {player_color} player"
    phase = _game_phase(game_move_number)
    sign = -1 if player_color == "black" else 1

    def fmt_eval(cp):
        if cp is None:
            return "unknown"
        if abs(cp) >= 9000:
            return "mate"
        return f"{(cp * sign / 100):+.2f}"

    eval_before_str = fmt_eval(eval_before)
    eval_after_str = fmt_eval(eval_after)
    cp_loss_str = f"{cp_loss:.0f}" if cp_loss is not None else "unknown"
    cls_str = classification or "unknown"
    move_desc = move_summary or move_san or move_uci
    best_line_str = " ".join(best_line_san[:5]) if best_line_san else "n/a"
    dev_best_line_str = " ".join(deviation_best_line_san[:5]) if deviation_best_line_san else "n/a"
    profile_context = _build_profile_context_block(profile, None)

    return f"""You are an expert chess coach analyzing a deviation (alternative move) made by "{player_name}" who plays as {player_color}.

GAME PHASE: {phase} (around move {game_move_number or '?'})

DEVIATION MOVE:
- Player played: {move_desc} ({move_san or move_uci})
- Classification: {cls_str} ({cp_loss_str} centipawn loss)
- Evaluation before: {eval_before_str} pawns (from {player_color}'s perspective)
- Evaluation after:  {eval_after_str} pawns (from {player_color}'s perspective)
- Engine's best move instead: {best_move_san or 'n/a'}
- Best line from this starting position: {best_line_str}
- Best continuation FROM the deviation: {dev_best_line_str}

PLAYER COACHING PROFILE:
{profile_context}

INSTRUCTIONS:
Write a focused 3–5 sentence coaching response that:
1. Explains what the deviation move does and whether it is a positive or negative choice in this {phase} context.
2. If it loses material or evaluation, explain *why* — what does it weaken, open, or miss?
3. Explain what the engine's suggested best line ({best_line_str}) achieves and why it is stronger.
4. For the best continuation from the deviation ({dev_best_line_str}), briefly explain what it means for the position — does it recover, compensate, or remain worse?
5. When relevant, tie the explanation to the player's saved goal and focus area without inventing unsupported details.

Use clear, beginner-friendly language. Be encouraging. Avoid hallucinating specific piece locations or captures unless they are stated in the facts above."""


async def get_deviation_coaching(
    fen_before: str,
    move_uci: str,
    move_san: str | None = None,
    move_summary: str | None = None,
    player_color: str = "white",
    eval_before: float | None = None,
    eval_after: float | None = None,
    cp_loss: float | None = None,
    classification: str | None = None,
    best_move_san: str | None = None,
    best_line_san: list[str] | None = None,
    deviation_best_line_san: list[str] | None = None,
    game_move_number: int | None = None,
    username: str | None = None,
    profile: dict | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    config = _get_llm_config(api_key=api_key, model=model)
    client = _get_client(config)

    prompt = _build_deviation_prompt(
        fen_before=fen_before,
        move_uci=move_uci,
        move_san=move_san,
        move_summary=move_summary,
        player_color=player_color,
        eval_before=eval_before,
        eval_after=eval_after,
        cp_loss=cp_loss,
        classification=classification,
        best_move_san=best_move_san,
        best_line_san=best_line_san or [],
        deviation_best_line_san=deviation_best_line_san or [],
        game_move_number=game_move_number,
        username=username,
        profile=profile,
    )

    logger.info(
        "llm deviation coaching model=%s player=%s move=%s prompt_preview=%s",
        config.model,
        player_color,
        move_uci,
        _preview_text(prompt),
    )

    response = await client.chat.completions.create(
        model=config.model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=512,
        temperature=0.6,
    )

    content = response.choices[0].message.content or "No coaching response received."
    return content


def _build_ask_coach_prompt(
    fen: str,
    question: str,
    candidate_san: str | None = None,
    candidate_summary: str | None = None,
    candidate_eval: float | None = None,
    cp_loss: float | None = None,
    classification: str | None = None,
    best_move_san: str | None = None,
    best_line_san: list[str] | None = None,
    deviation_best_line_san: list[str] | None = None,
    motifs: list[str] | None = None,
    threat_summary: str | None = None,
    player_color: str = "white",
    move_number: int | None = None,
    username: str | None = None,
) -> str:
    lines = [
        "You are an expert, encouraging Grandmaster chess coach.",
        f"A student ({username or player_color.title()}) asks a question about this position:",
        "POSITION CONTEXT:",
        f"- FEN: {fen}",
        f"- Player Side: {player_color.title()}",
        f"- Engine Best Move: {best_move_san or 'n/a'}",
        f"- Best Line: {' '.join(best_line_san[:5]) if best_line_san else 'n/a'}",
    ]
    if threat_summary:
        lines.append(f"- Immediate Threat: {threat_summary}")
    if motifs:
        lines.append(f"- Tactical Motifs in position: {', '.join(motifs[:5])}")

    if candidate_san:
        lines.extend([
            "STUDENT'S CANDIDATE MOVE:",
            f"- Move: {candidate_san}",
            f"- Description: {candidate_summary or 'n/a'}",
            f"- Classification: {classification or 'n/a'} (loss: {cp_loss or 0:.0f} cp)",
            f"- Continuation after candidate move: {' '.join(deviation_best_line_san[:5]) if deviation_best_line_san else 'n/a'}",
        ])

    lines.extend([
        "",
        "STUDENT'S QUESTION:",
        f'"{question}"',
        "",
        "INSTRUCTIONS:",
        "1. Directly and clearly answer the student's question in 2-3 concise paragraphs.",
        "2. Use concrete tactical / positional explanations based strictly on the facts and lines provided above.",
        "3. Explain why the student's idea works or fails, pointing out key tactics (pins, forks, hanging pieces, threats).",
        "4. Keep the tone friendly, constructive, and instructive.",
    ])
    return "\n".join(lines)


async def ask_coach(
    fen: str,
    question: str,
    candidate_uci: str | None = None,
    candidate_san: str | None = None,
    player_color: str = "white",
    username: str | None = None,
    move_number: int | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    from services.stockfish_service import analyze_position

    # Run quick engine evaluation
    pos_data = analyze_position(fen, move_uci=candidate_uci)

    cand_san = candidate_san or pos_data.get("move_san")
    prompt = _build_ask_coach_prompt(
        fen=fen,
        question=question,
        candidate_san=cand_san,
        candidate_summary=pos_data.get("move_summary"),
        candidate_eval=pos_data.get("eval_after"),
        cp_loss=pos_data.get("cp_loss"),
        classification=pos_data.get("classification"),
        best_move_san=pos_data.get("best_move_san"),
        best_line_san=pos_data.get("best_line_san"),
        deviation_best_line_san=pos_data.get("deviation_best_line_san"),
        motifs=pos_data.get("motifs"),
        threat_summary=pos_data.get("threat_summary"),
        player_color=player_color,
        move_number=move_number,
        username=username,
    )

    config = _get_llm_config(api_key=api_key, model=model)
    client = _get_client(config)

    logger.info("ask_coach request question=%s prompt_preview=%s", question, _preview_text(prompt))

    response = await client.chat.completions.create(
        model=config.model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=600,
        temperature=0.6,
    )

    content = response.choices[0].message.content or "No response from coach."
    return {
        "answer": content,
        "candidate_eval": pos_data.get("eval_after"),
        "best_move_san": pos_data.get("best_move_san"),
        "best_move_eval": pos_data.get("eval_before"),
        "motifs": pos_data.get("motifs", []),
    }

