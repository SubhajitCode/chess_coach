import json
import logging
from services.llm_service import _get_llm_config, _get_client

logger = logging.getLogger(__name__)

async def generate_opening_explanation(opening_name, eco, full_line_pgn, move_index, move_san, fen_before, explorer_stats=None):
    """Generate structured explanation for an opening move via LLM."""
    config = _get_llm_config()
    client = _get_client(config)
    
    stats_context = ""
    if explorer_stats and explorer_stats.get("moves"):
        top_moves = explorer_stats["moves"][:5]
        stats_context = f"\nExplorer statistics at this position:\n{json.dumps(top_moves, indent=2)}"
    
    prompt = f"""You are an expert chess coach explaining opening moves to an intermediate player (1200-1800 Elo).

Opening: {opening_name} (ECO: {eco})
Full line: {full_line_pgn}
Current move #{move_index + 1}: {move_san}
Position before move (FEN): {fen_before}
{stats_context}

Generate a structured JSON explanation for this move. Respond ONLY with valid JSON, no markdown fences:
{{
    "strategic_purpose": "1-2 sentence explanation of WHY this move is played",
    "key_ideas": ["idea1", "idea2"],
    "drawbacks": ["drawback1"],
    "opponent_likely_responses": [
        {{"move": "SAN", "name": "variation name if known", "idea": "brief explanation"}}
    ],
    "opponent_countermeasures": ["countermeasure1"],
    "pawn_structure": "Brief pawn structure description",
    "common_mistakes": ["mistake1"],
    "typical_plans": ["plan1", "plan2"]
}}"""
    
    try:
        response = await client.chat.completions.create(
            model=config.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.3,
        )
        text = response.choices[0].message.content.strip()
        # Try to extract JSON
        return _extract_json_object(text)
    except Exception as e:
        logger.error(f"LLM explanation error: {e}")
        return _fallback_explanation(move_san)


async def explain_wrong_opening_move(opening_name, expected_san, played_san, fen, explorer_stats=None):
    """Explain why user's move is wrong and what the correct move achieves."""
    config = _get_llm_config()
    client = _get_client(config)
    
    prompt = f"""You are a chess coach. A student is learning the {opening_name}.
The correct move is {expected_san}, but the student played {played_san}.
Position (FEN): {fen}

Explain briefly in JSON (no markdown fences):
{{
    "why_wrong": "Why the played move is suboptimal (1-2 sentences)",
    "what_opponent_can_do": "How the opponent can exploit this (1 sentence)",
    "why_correct": "Why the correct move is better (1-2 sentences)",
    "tip": "A memorable tip for this position (1 sentence)"
}}"""
    
    try:
        response = await client.chat.completions.create(
            model=config.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=512,
            temperature=0.3,
        )
        text = response.choices[0].message.content.strip()
        return _extract_json_object(text)
    except Exception as e:
        logger.error(f"LLM wrong move explanation error: {e}")
        return {
            "why_wrong": f"The move {played_san} deviates from the main line of the {opening_name}.",
            "what_opponent_can_do": "The opponent can take advantage of the deviation.",
            "why_correct": f"The correct move {expected_san} follows established theory.",
            "tip": f"Try to remember: in this position, play {expected_san}."
        }


def _extract_json_object(text: str) -> dict:
    """Extract a JSON object from text that may contain extra content."""
    import re
    # Remove markdown code fences if present
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    text = text.strip()
    
    # Find the first { and last }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    
    return _fallback_explanation("")


def _fallback_explanation(move_san: str) -> dict:
    return {
        "strategic_purpose": f"This move ({move_san}) is part of established opening theory.",
        "key_ideas": ["Develops pieces toward the center", "Follows opening principles"],
        "drawbacks": ["Commits to a specific pawn structure"],
        "opponent_likely_responses": [],
        "opponent_countermeasures": ["Standard opening responses apply"],
        "pawn_structure": "Standard opening pawn structure.",
        "common_mistakes": [],
        "typical_plans": ["Continue development", "Control the center"]
    }
