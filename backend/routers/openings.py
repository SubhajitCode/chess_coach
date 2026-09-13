import datetime
import logging
import urllib.parse
from dataclasses import asdict
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from services.openings_db import get_openings_db
from services.db import (
    get_opening_progress, save_opening_progress, get_all_opening_progress,
    get_opening_explanation, save_opening_explanation, get_all_opening_explanations
)
from services.opening_trainer import OpeningTrainerSession, calculate_srs_update
from services.opening_scenarios import get_scenarios_for_opening, get_scenario_by_id
from services.opening_explainer import generate_opening_explanation, explain_wrong_opening_move
from services.lichess_explorer import get_explorer_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/openings", tags=["openings"])

_sessions: dict[str, OpeningTrainerSession] = {}


class TrainStartRequest(BaseModel):
    eco: str
    opening_name: str
    train_as: str
    scenario_id: Optional[str] = None
    adaptive: Optional[bool] = False


class SwitchScenarioRequest(BaseModel):
    session_id: str
    scenario_id: str


class TrainMoveRequest(BaseModel):
    session_id: str
    uci: str


class SessionRequest(BaseModel):
    session_id: str


class ExplainRequest(BaseModel):
    eco: str
    opening_name: str


@router.get("/catalog")
def get_catalog():
    """Return the curated opening catalog with progress and scenario data."""
    db = get_openings_db()
    catalog = db.get_catalog()
    # Enrich each opening with progress and scenario data
    for cat in catalog:
        for op in cat["openings"]:
            prog_white = get_opening_progress(op["eco"], op["name"], "white")
            prog_black = get_opening_progress(op["eco"], op["name"], "black")
            op["progress"] = {
                "white": prog_white,
                "black": prog_black,
            }
            scenarios = get_scenarios_for_opening(op["eco"], op["name"], op.get("family", ""))
            op["scenarios_count"] = len(scenarios)
            if scenarios:
                op["deep_move_count"] = scenarios[0].move_count
                op["scenarios"] = [
                    {
                        "id": s.id,
                        "name": s.name,
                        "move_count": s.move_count,
                        "difficulty": s.difficulty,
                    }
                    for s in scenarios[:4]
                ]
    return {"categories": catalog}


@router.get("/list")
def list_openings_endpoint(
    q: str = "",
    category: str = "",
    side: str = "",
    scope: str = "all",
    sort_by: str = "relevance",
    sort_order: str = "asc",
    page: int = 1,
    page_size: int = 20,
):
    """Paginated list of openings with search, filter, ordering, and scenario counts."""
    db = get_openings_db()
    items, total = db.list_openings(
        query=q,
        category=category,
        side=side,
        scope=scope,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )

    all_progs = get_all_opening_progress()
    prog_map = {(p["eco"], p["opening_name"], p["train_as"]): p for p in all_progs}

    enriched_items = []
    for item in items:
        item_dict = asdict(item)
        item_dict["progress"] = {
            "white": prog_map.get((item.eco, item.name, "white")),
            "black": prog_map.get((item.eco, item.name, "black")),
        }
        scenarios = get_scenarios_for_opening(item.eco, item.name, item.family)
        item_dict["scenarios_count"] = len(scenarios)
        if scenarios and item.move_count < scenarios[0].move_count:
            item_dict["deep_move_count"] = scenarios[0].move_count
        enriched_items.append(item_dict)

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return {
        "items": enriched_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/search")
def search_openings(q: str):
    """Search openings by name or ECO code."""
    db = get_openings_db()
    results = db.search_openings(q)
    all_progs = get_all_opening_progress()
    prog_map = {(p["eco"], p["opening_name"], p["train_as"]): p for p in all_progs}
    enriched = []
    for r in results:
        d = asdict(r)
        d["progress"] = {
            "white": prog_map.get((r.eco, r.name, "white")),
            "black": prog_map.get((r.eco, r.name, "black")),
        }
        enriched.append(d)
    return {"results": enriched}


@router.get("/progress")
def get_progress():
    """Get all opening training progress."""
    return {"progress": get_all_opening_progress()}


@router.get("/due-reviews")
def get_due_reviews():
    """Get openings due for SRS review."""
    all_prog = get_all_opening_progress()
    now = datetime.datetime.now().isoformat()
    due = [p for p in all_prog if p.get("next_review_at") and p["next_review_at"] <= now]
    return {"due": due}


@router.get("/scenarios")
def get_scenarios_endpoint(eco: str = "", name: str = "", family: str = ""):
    """Get all scenarios (curated + deep lines) for an opening."""
    scenarios = get_scenarios_for_opening(eco=eco, opening_name=name, family=family)
    return {
        "eco": eco,
        "opening_name": name,
        "scenarios": [asdict(s) for s in scenarios],
    }


@router.get("/{eco_code}")
def get_by_eco(eco_code: str):
    """Get all openings for an ECO code."""
    db = get_openings_db()
    entries = db.get_opening_by_eco(eco_code)
    return {"eco": eco_code, "openings": [asdict(e) for e in entries]}


@router.get("/line/{eco_code}/{opening_name}")
def get_opening_line(eco_code: str, opening_name: str):
    """Get full move-by-move line with cached explanations."""
    name = urllib.parse.unquote(opening_name)
    db = get_openings_db()
    opening = db.find_opening(eco_code, name)
    if not opening:
        raise HTTPException(status_code=404, detail="Opening not found")

    moves = db.get_line_moves(opening)
    explanations = get_all_opening_explanations(eco_code, opening.name)
    exp_dict = {e["move_index"]: e.get("explanation") for e in explanations}

    for m in moves:
        m["explanation"] = exp_dict.get(m["move_index"])

    progress = get_opening_progress(eco_code, opening.name, opening.side)

    return {
        "opening": asdict(opening),
        "moves": moves,
        "progress": progress,
    }


@router.post("/explain")
async def generate_explanations_endpoint(req: ExplainRequest, background_tasks: BackgroundTasks):
    """Generate and cache LLM explanations for all moves in an opening."""
    db = get_openings_db()
    opening = db.find_opening(req.eco, req.opening_name)
    if not opening:
        raise HTTPException(status_code=404, detail="Opening not found")

    moves = db.get_line_moves(opening)

    async def process_explanations():
        explorer = get_explorer_client()
        for m in moves:
            existing = get_opening_explanation(req.eco, opening.name, m["move_index"])
            if not existing:
                try:
                    stats = await explorer.get_explorer_stats(fen=m["fen_before"])
                    explanation = await generate_opening_explanation(
                        opening.name, req.eco, opening.pgn,
                        m["move_index"], m["san"], m["fen_before"], stats
                    )
                    save_opening_explanation(
                        req.eco, opening.name, m["move_index"], m["san"], explanation
                    )
                except Exception as e:
                    logger.error(f"Failed to generate explanation for move {m['san']}: {e}")

    background_tasks.add_task(process_explanations)
    return {"status": "started", "message": "Explanations generation started in background"}


@router.post("/train/start")
def start_training(req: TrainStartRequest):
    """Start a new opening training session with scenario and adaptive support."""
    db = get_openings_db()
    opening = db.find_opening(req.eco, req.opening_name)
    if not opening:
        raise HTTPException(status_code=404, detail="Opening not found")

    session = OpeningTrainerSession(
        opening=opening,
        train_as=req.train_as,
        scenario_id=req.scenario_id,
        adaptive=bool(req.adaptive),
    )
    _sessions[session.session_id] = session
    return {
        "session_id": session.session_id,
        "state": session.get_current_state(),
    }


@router.post("/train/switch-scenario")
def switch_scenario_endpoint(req: SwitchScenarioRequest):
    """Switch to a different scenario in the active session."""
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.switch_scenario(req.scenario_id)
    return {
        "session_id": session.session_id,
        "state": session.get_current_state(),
    }


@router.post("/train/move")
async def train_move(req: TrainMoveRequest):
    """Submit a move during training — returns feedback."""
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Handle auto-advance for opponent turns
    if req.uci in ("auto", "skip"):
        if req.uci == "skip" and session._is_user_turn():
            # Skip the current move — auto-play it
            expected = session.line_moves[session.current_move_index]
            session.board.push_san(expected["san"])
            session.current_move_index += 1
            fen_after_user = session.board.fen()

            opponent_move_data = None
            if not session.completed and session.current_move_index < session.total_moves:
                if not session._is_user_turn():
                    expected_opp = session.line_moves[session.current_move_index]
                    session.board.push_san(expected_opp["san"])
                    session.current_move_index += 1
                    fen_after_opp = session.board.fen()
                    if session.current_move_index >= session.total_moves:
                        session.completed = True
                    opponent_move_data = {
                        "san": expected_opp["san"],
                        "uci": expected_opp["uci"],
                        "fen_after": fen_after_opp,
                    }

            return {
                "result": {
                    "correct": True,
                    "expected_san": expected["san"],
                    "expected_uci": expected["uci"],
                    "played_san": expected["san"],
                    "played_uci": expected["uci"],
                    "fen_after": fen_after_user,
                    "opponent_move": opponent_move_data,
                    "explanation": None,
                    "hint": None,
                    "stats": None,
                    "alternatives": None,
                    "branch_note": session.last_branch_note,
                },
                "state": session.get_current_state(),
                "move_explanation": None,
            }
        # Auto-advance opponent move
        if not session._is_user_turn() and session.current_move_index < session.total_moves:
            expected = session.line_moves[session.current_move_index]
            session.board.push_san(expected["san"])
            session.current_move_index += 1
            session._auto_advance_opponent()
            return {
                "result": {
                    "correct": True,
                    "expected_san": expected["san"],
                    "expected_uci": expected["uci"],
                    "played_san": expected["san"],
                    "played_uci": expected["uci"],
                    "fen_after": session.board.fen(),
                    "opponent_move": None,
                    "explanation": None,
                    "hint": None,
                    "stats": None,
                    "alternatives": None,
                    "branch_note": session.last_branch_note,
                },
                "state": session.get_current_state(),
                "move_explanation": None,
            }

    try:
        fen_before = session.board.fen()
        res = session.submit_move(req.uci)

        move_explanation = None
        if res.correct:
            # Get cached explanation for this move
            move_idx = session.current_move_index - 1
            if move_idx >= 0:
                move_explanation = get_opening_explanation(
                    session.opening.eco, session.opening.name, move_idx
                )

        if not res.correct:
            # Generate LLM explanation for wrong moves
            try:
                explorer = get_explorer_client()
                stats = await explorer.get_explorer_stats(fen=fen_before)
                wrong_explanation = await explain_wrong_opening_move(
                    session.opening.name, res.expected_san, res.played_san, fen_before, stats
                )
                res.explanation = wrong_explanation
            except Exception as e:
                logger.error(f"Failed to explain wrong move: {e}")
                res.explanation = {
                    "why_wrong": f"The move {res.played_san} deviates from the {session.opening.name}.",
                    "what_opponent_can_do": "The opponent can take advantage.",
                    "why_correct": f"The correct move is {res.expected_san}.",
                    "tip": f"Remember: play {res.expected_san} in this position.",
                }

        return {
            "result": {
                "correct": res.correct,
                "expected_san": res.expected_san,
                "expected_uci": res.expected_uci,
                "played_san": res.played_san,
                "played_uci": res.played_uci,
                "fen_after": res.fen_after,
                "opponent_move": res.opponent_move,
                "explanation": res.explanation,
                "hint": res.hint,
                "stats": res.stats,
                "alternatives": res.alternatives,
                "branch_note": res.branch_note,
            },
            "state": session.get_current_state(),
            "move_explanation": move_explanation,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/train/hint")
def train_hint(req: SessionRequest):
    """Get a hint for the current position."""
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    hint = session.get_hint()
    return {
        "piece": hint.get("piece", ""),
        "from_square": hint.get("from_square", ""),
        "target_square": chess.square_name(
            chess.Move.from_uci(
                session.line_moves[session.current_move_index]["uci"]
            ).to_square
        ) if session.current_move_index < session.total_moves else "",
        "hint_text": hint.get("message", ""),
    }


@router.post("/train/complete")
def complete_training(req: SessionRequest):
    """Complete a training session and update SRS progress."""
    session = _sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    summary = session.get_summary()

    current_progress = get_opening_progress(
        session.opening.eco, session.opening.name, session.train_as
    ) or {}
    updated_progress = calculate_srs_update(current_progress, summary["accuracy"])

    # Update totals
    updated_progress["total_attempts"] = (
        current_progress.get("total_attempts", 0) + summary["correct"] + summary["incorrect"]
    )
    updated_progress["times_correct"] = (
        current_progress.get("times_correct", 0) + summary["correct"]
    )

    save_opening_progress(
        session.opening.eco, session.opening.name, session.train_as, updated_progress
    )

    # Clean up session
    del _sessions[req.session_id]

    return {
        "summary": summary,
        "progress": updated_progress,
        "accuracy": summary["accuracy"],
    }


# Need chess import for hint square calculation
import chess
