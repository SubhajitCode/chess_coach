import logging
import uuid
import datetime
import random
from dataclasses import dataclass, asdict
from typing import Any, Optional
import chess

from services.openings_db import OpeningEntry, get_openings_db
from services.db import get_opening_progress, save_opening_progress
from services.opening_scenarios import (
    OpeningScenario,
    get_scenarios_for_opening,
    get_scenario_by_id,
    parse_scenario_moves,
)

logger = logging.getLogger(__name__)


@dataclass
class TrainingMoveResult:
    correct: bool
    expected_san: str
    expected_uci: str
    played_san: str
    played_uci: str
    fen_after: str
    explanation: dict | None = None
    hint: dict | None = None
    stats: dict | None = None
    alternatives: list[dict] | None = None
    branch_note: str | None = None
    opponent_move: dict | None = None


def calculate_srs_update(current_progress: dict, session_accuracy: float) -> dict:
    interval_days = current_progress.get("interval_days", 1.0)
    ease_factor = current_progress.get("ease_factor", 2.5)
    streak = current_progress.get("streak", 0)
    times_practiced = current_progress.get("times_practiced", 0)

    if session_accuracy >= 0.8:
        quality = 5
        streak += 1
        if times_practiced == 0:
            interval_days = 1.0
        elif times_practiced == 1:
            interval_days = 6.0
        else:
            interval_days = interval_days * ease_factor
    elif session_accuracy >= 0.6:
        quality = 3
        streak += 1
        # interval stays the same
    else:
        quality = 1
        streak = 0
        interval_days = 1.0

    ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease_factor = max(1.3, ease_factor)

    times_practiced += 1

    if times_practiced == 0:
        comfort_level = "new"
    elif times_practiced < 3:
        comfort_level = "learning"
    elif interval_days >= 14:
        comfort_level = "mastered"
    elif times_practiced >= 3 and interval_days >= 7:
        comfort_level = "familiar"
    else:
        comfort_level = "learning"

    next_review = datetime.datetime.now() + datetime.timedelta(days=interval_days)

    return {
        "interval_days": interval_days,
        "ease_factor": ease_factor,
        "streak": streak,
        "times_practiced": times_practiced,
        "comfort_level": comfort_level,
        "next_review_at": next_review.isoformat(),
        "last_practiced_at": datetime.datetime.now().isoformat(),
    }


class OpeningTrainerSession:
    def __init__(
        self,
        opening: OpeningEntry,
        train_as: str,
        scenario_id: Optional[str] = None,
        adaptive: bool = False,
    ):
        self.session_id = str(uuid.uuid4())
        self.opening = opening
        self.train_as = train_as  # 'white' or 'black'
        self.board = chess.Board()

        # Discover all available scenarios for this opening (curated + deep siblings)
        self.available_scenarios = get_scenarios_for_opening(
            eco=opening.eco,
            opening_name=opening.name,
            family=opening.family,
        )

        self.adaptive = adaptive
        self.last_branch_note: Optional[str] = None
        self._setup_scenario(scenario_id)

        self.current_move_index = 0
        self.correct_moves = 0
        self.incorrect_moves = 0
        self.completed = False

        if self.train_as == "black":
            self._auto_advance_opponent()

    def _setup_scenario(self, scenario_id: Optional[str]):
        """Initialize active scenario and candidate scenarios."""
        self.active_scenario: Optional[OpeningScenario] = None
        if scenario_id:
            for s in self.available_scenarios:
                if s.id == scenario_id:
                    self.active_scenario = s
                    break
            if not self.active_scenario:
                self.active_scenario = get_scenario_by_id(scenario_id)

        # Fallback to the first scenario or default
        if not self.active_scenario and self.available_scenarios:
            self.active_scenario = self.available_scenarios[0]

        if self.active_scenario:
            self.line_moves = parse_scenario_moves(self.active_scenario)
        else:
            db = get_openings_db()
            self.line_moves = db.get_line_moves(self.opening)

        self.total_moves = len(self.line_moves)
        self.candidate_scenarios = list(self.available_scenarios)

    def switch_scenario(self, scenario_id: str):
        """Switch to another scenario in the active session and reset board."""
        self._setup_scenario(scenario_id)
        self.board = chess.Board()
        self.current_move_index = 0
        self.correct_moves = 0
        self.incorrect_moves = 0
        self.completed = False
        self.last_branch_note = None

        if self.train_as == "black":
            self._auto_advance_opponent()

    def _is_user_turn(self) -> bool:
        color = "white" if self.board.turn == chess.WHITE else "black"
        return color == self.train_as

    def _get_candidate_moves_at_index(self, idx: int) -> dict[str, list[OpeningScenario]]:
        """Group candidate scenarios by their UCI move at a given move index."""
        groups: dict[str, list[OpeningScenario]] = {}
        for s in self.candidate_scenarios:
            s_moves = parse_scenario_moves(s)
            if idx < len(s_moves):
                uci = s_moves[idx]["uci"]
                groups.setdefault(uci, []).append(s)
        return groups

    def _auto_advance_opponent(self):
        if self.completed or self.current_move_index >= self.total_moves:
            self.completed = True
            return

        if not self._is_user_turn():
            # In adaptive mode, check if there's a branch choice among candidates
            if self.adaptive and len(self.candidate_scenarios) > 1:
                groups = self._get_candidate_moves_at_index(self.current_move_index)
                if len(groups) > 1:
                    # Opponent branches! Pick one move group randomly
                    chosen_uci = random.choice(list(groups.keys()))
                    self.candidate_scenarios = groups[chosen_uci]
                    self.active_scenario = self.candidate_scenarios[0]
                    self.line_moves = parse_scenario_moves(self.active_scenario)
                    self.total_moves = len(self.line_moves)
                    self.last_branch_note = f"Opponent branched into {self.active_scenario.name}!"
                    logger.info(f"Adaptive branch: opponent played {chosen_uci}, new scenario {self.active_scenario.name}")

            expected_move = self.line_moves[self.current_move_index]
            self.board.push_san(expected_move["san"])
            self.current_move_index += 1
            if self.current_move_index >= self.total_moves:
                self.completed = True

    def get_current_state(self) -> dict:
        progress_pct = (
            (self.current_move_index / self.total_moves * 100)
            if self.total_moves > 0
            else 0
        )
        history_moves = []
        if self.current_move_index > 0:
            for i in range(min(self.current_move_index, len(self.line_moves))):
                history_moves.append({
                    "san": self.line_moves[i]["san"],
                    "uci": self.line_moves[i]["uci"],
                })

        scenario_pgn = (
            self.active_scenario.pgn
            if self.active_scenario and self.active_scenario.pgn
            else self.opening.pgn
        )
        target_moves = [
            {
                "index": i,
                "san": m["san"],
                "uci": m["uci"],
                "side": m.get("side", "white" if i % 2 == 0 else "black"),
            }
            for i, m in enumerate(self.line_moves)
        ]

        return {
            "session_id": self.session_id,
            "opening_name": self.opening.name,
            "eco": self.opening.eco,
            "train_as": self.train_as,
            "fen": self.board.fen(),
            "move_index": self.current_move_index,
            "total_moves": self.total_moves,
            "is_user_turn": self._is_user_turn(),
            "completed": self.completed or self.current_move_index >= self.total_moves,
            "correct_moves": self.correct_moves,
            "incorrect_moves": self.incorrect_moves,
            "progress_pct": round(progress_pct, 1),
            "scenario_id": self.active_scenario.id if self.active_scenario else None,
            "scenario_name": self.active_scenario.name if self.active_scenario else self.opening.name,
            "scenario_description": self.active_scenario.description if self.active_scenario else "",
            "scenario_difficulty": self.active_scenario.difficulty if self.active_scenario else "Intermediate",
            "scenario_pgn": scenario_pgn,
            "target_moves": target_moves,
            "is_adaptive": self.adaptive,
            "branch_note": self.last_branch_note,
            "available_scenarios": [asdict(s) for s in self.available_scenarios],
            "history_moves": history_moves,
        }

    def submit_move(self, uci: str) -> TrainingMoveResult:
        if self.completed or self.current_move_index >= self.total_moves:
            raise ValueError("Session completed")

        try:
            move = chess.Move.from_uci(uci)
            played_san = self.board.san(move)
        except Exception:
            raise ValueError(f"Invalid move: {uci}")

        correct = False
        expected_move = self.line_moves[self.current_move_index]
        expected_uci = expected_move["uci"]
        expected_san = expected_move["san"]

        # In adaptive mode: if user plays a move valid in ANY candidate scenario, accept it
        if self.adaptive and len(self.candidate_scenarios) > 0:
            groups = self._get_candidate_moves_at_index(self.current_move_index)
            if uci in groups:
                correct = True
                self.candidate_scenarios = groups[uci]
                self.active_scenario = self.candidate_scenarios[0]
                self.line_moves = parse_scenario_moves(self.active_scenario)
                self.total_moves = len(self.line_moves)
                expected_uci = uci
                expected_san = played_san
        else:
            correct = (uci == expected_uci)

        if correct:
            self.correct_moves += 1
            self.board.push(move)
            self.current_move_index += 1
            fen_after_user = self.board.fen()

            # Automatically compute opponent response if session not complete
            opponent_move_data = None
            if not self.completed and self.current_move_index < self.total_moves:
                if not self._is_user_turn():
                    # Handle adaptive branching
                    if self.adaptive and len(self.candidate_scenarios) > 1:
                        groups = self._get_candidate_moves_at_index(self.current_move_index)
                        if len(groups) > 1:
                            chosen_uci = random.choice(list(groups.keys()))
                            self.candidate_scenarios = groups[chosen_uci]
                            self.active_scenario = self.candidate_scenarios[0]
                            self.line_moves = parse_scenario_moves(self.active_scenario)
                            self.total_moves = len(self.line_moves)
                            self.last_branch_note = f"Opponent branched into {self.active_scenario.name}!"

                    expected_opp = self.line_moves[self.current_move_index]
                    opp_san = expected_opp["san"]
                    opp_uci = expected_opp["uci"]
                    self.board.push_san(opp_san)
                    self.current_move_index += 1
                    fen_after_opp = self.board.fen()
                    if self.current_move_index >= self.total_moves:
                        self.completed = True

                    opponent_move_data = {
                        "san": opp_san,
                        "uci": opp_uci,
                        "fen_after": fen_after_opp,
                    }

            return TrainingMoveResult(
                correct=True,
                expected_san=expected_san,
                expected_uci=expected_uci,
                played_san=played_san,
                played_uci=uci,
                fen_after=fen_after_user,
                opponent_move=opponent_move_data,
                branch_note=self.last_branch_note,
            )
        else:
            self.incorrect_moves += 1
            return TrainingMoveResult(
                correct=False,
                expected_san=expected_san,
                expected_uci=expected_uci,
                played_san=played_san,
                played_uci=uci,
                fen_after=self.board.fen(),
                branch_note=self.last_branch_note,
            )

    def get_hint(self) -> dict:
        if self.completed or self.current_move_index >= self.total_moves:
            return {}
        expected_move = self.line_moves[self.current_move_index]
        move = chess.Move.from_uci(expected_move["uci"])
        square_name = chess.square_name(move.from_square)
        target_square = chess.square_name(move.to_square)
        piece = self.board.piece_at(move.from_square)
        piece_name = piece.symbol() if piece else ""
        return {
            "piece": piece_name,
            "from_square": square_name,
            "target_square": target_square,
            "message": f"Try moving the piece on {square_name} to {target_square}.",
        }

    def get_summary(self) -> dict:
        total = self.correct_moves + self.incorrect_moves
        accuracy = self.correct_moves / total if total > 0 else 0
        return {
            "correct": self.correct_moves,
            "incorrect": self.incorrect_moves,
            "accuracy": accuracy,
            "completed": self.completed,
            "scenario_name": self.active_scenario.name if self.active_scenario else self.opening.name,
            "total_moves": self.total_moves,
        }
