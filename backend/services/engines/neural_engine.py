"""
neural_engine.py - Human-Aligned Chess Neural Network Engine Adapter Strategy.
Uses trained Dual-Head ResNet to provide human-calibrated move distributions and win scores.
"""

import io
import json
import os
import logging
from typing import Any, Dict, Generator, List, Optional, Tuple

import chess
import chess.pgn
import numpy as np
import torch

from services.engines.base import BaseChessEngine
from services.engines.common import (
    build_move_piece_metadata,
    build_summary,
    build_threat_summary,
    classify_move,
    extract_tactical_motifs,
    pv_preview,
)
from services.opening_book import is_book_move, get_book_move_details
from services.neural_model.chess_encoder import (
    NUM_ACTIONS,
    decode_move_index,
    encode_move,
)
from services.neural_model.model import ChessDualResNet

logger = logging.getLogger(__name__)

# Search paths for trained model checkpoint
SEARCH_PATHS = [
    os.getenv("CHESS_MODEL_PATH", ""),
    os.path.join(os.path.dirname(__file__), "..", "..", "models", "best_chess_policy_model.pt"),
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "training", "models", "best_chess_policy_model.pt"),
]


def value_to_cp(val: float, turn: chess.Color) -> float:
    """Converts active-perspective tanh score v in [-1, 1] to centipawns from White's POV."""
    clipped = np.clip(val, -0.999, 0.999)
    cp_active = 400.0 * float(np.arctanh(clipped))
    return round(cp_active if turn == chess.WHITE else -cp_active, 1)


class HumanNeuralEngine(BaseChessEngine):
    def __init__(self, model_path: Optional[str] = None):
        self.device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
        self.model_path = None
        self.model = None
        self._load_model(model_path)

    def _load_model(self, custom_path: Optional[str] = None):
        candidate_paths = [custom_path] if custom_path else SEARCH_PATHS
        found_path = None
        for p in candidate_paths:
            if p and os.path.exists(p):
                found_path = p
                break

        if found_path:
            try:
                checkpoint = torch.load(found_path, map_location=self.device, weights_only=False)
                config = checkpoint.get("model_config", {
                    "in_channels": 18, "channels": 128, "num_blocks": 6, "num_actions": NUM_ACTIONS
                })
                self.model = ChessDualResNet(
                    in_channels=config.get("in_channels", 18),
                    channels=config.get("channels", 128),
                    num_blocks=config.get("num_blocks", 6),
                    num_actions=config.get("num_actions", NUM_ACTIONS)
                ).to(self.device)
                self.model.load_state_dict(checkpoint["model_state_dict"])
                self.model.eval()
                self.model_path = found_path
                logger.info(f"Loaded Human Neural Model from {found_path} onto {self.device}")
                return
            except Exception as e:
                logger.warning(f"Failed to load checkpoint at {found_path}: {e}")

        # Fallback placeholder model if checkpoint not yet trained
        logger.info("Initializing baseline Human Neural Model architecture (placeholder mode)")
        self.model = ChessDualResNet(num_blocks=6, channels=128).to(self.device)
        self.model.eval()
        self.model_path = "placeholder (untrained/in-memory)"

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "id": "human_model",
            "name": "Human AI Model (1400–1800 Elo)",
            "type": "neural_policy_value",
            "description": "Predicts intuitive human move choices and calibrated win probabilities.",
            "available": True,
            "device": str(self.device),
            "model_path": self.model_path,
            "parameters": sum(p.numel() for p in self.model.parameters()),
        }

    def _get_top_candidates(self, board: chess.Board, probs: np.ndarray, top_k: int = 4) -> List[Dict[str, Any]]:
        scored = []
        for idx in np.where(probs > 0)[0]:
            move = decode_move_index(idx, board.turn)
            if move in board.legal_moves:
                p = float(probs[idx])
                scored.append((move, p))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [
            {
                "move_san": board.san(m),
                "move_uci": m.uci(),
                "probability": round(p * 100.0, 1),
            }
            for m, p in scored[:top_k]
        ]

    def _greedy_pv(self, board: chess.Board, limit: int = 4) -> Tuple[List[chess.Move], List[str], List[str]]:
        sim_board = board.copy(stack=False)
        pv_moves: List[chess.Move] = []
        pv_san: List[str] = []
        pv_uci: List[str] = []

        for _ in range(limit):
            if sim_board.is_game_over():
                break
            
            # If search_best_move is available, use shallow minimax search to avoid blunders
            if hasattr(self.model, "search_best_move"):
                best_m, _, _ = self.model.search_best_move(sim_board, self.device, depth=2, top_candidates=4)
            else:
                probs, _ = self.model.evaluate_board(sim_board, self.device)
                legal_indices = np.where(probs > 0)[0]
                if len(legal_indices) == 0:
                    break
                best_idx = legal_indices[np.argmax(probs[legal_indices])]
                best_m = decode_move_index(best_idx, sim_board.turn)

            if best_m is None or best_m not in sim_board.legal_moves:
                break

            pv_moves.append(best_m)
            pv_san.append(sim_board.san(best_m))
            pv_uci.append(best_m.uci())
            sim_board.push(best_m)

        return pv_moves, pv_san, pv_uci

    def analyze_pgn_stream(
        self,
        pgn_text: str,
        depth: int = 18,
        player_color: str = "white"
    ) -> Generator[str, None, None]:
        pgn_io = io.StringIO(pgn_text)
        game = chess.pgn.read_game(pgn_io)
        if game is None:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Invalid PGN'})}\n\n"
            return

        headers = game.headers
        meta = {
            "type": "meta",
            "engine": "human_model",
            "white": headers.get("White", "?"),
            "black": headers.get("Black", "?"),
            "result": headers.get("Result", "*"),
            "opening": headers.get("Opening") or headers.get("ECOUrl"),
            "time_control": headers.get("TimeControl"),
            "player_color": player_color,
            "total_moves": sum(1 for _ in game.mainline()),
        }
        yield f"data: {json.dumps(meta)}\n\n"

        moves_data = []
        board = game.board()
        half_move = 0

        try:
            for node in game.mainline():
                move = node.move
                color = "white" if board.turn == chess.WHITE else "black"
                half_move += 1
                move_number = (half_move + 1) // 2

                board_before = board.copy(stack=False)
                probs_before, val_before = self.model.evaluate_board(board_before, self.device)
                eval_before_white = value_to_cp(val_before, board_before.turn)

                # Best predicted human move
                top_candidates = self._get_top_candidates(board_before, probs_before, top_k=4)
                best_candidate = top_candidates[0] if top_candidates else None
                best_move_obj = chess.Move.from_uci(best_candidate["move_uci"]) if best_candidate else None

                _, best_line_san, best_line_uci = self._greedy_pv(board_before, limit=4)

                # Move probability of what the human actually played
                try:
                    played_idx = encode_move(move, board.turn)
                    played_prob = round(float(probs_before[played_idx]) * 100.0, 1)
                except Exception:
                    played_prob = 0.0

                board.push(move)

                probs_after, val_after = self.model.evaluate_board(board, self.device)
                eval_after_white = value_to_cp(val_after, board.turn)

                reply_candidates = self._get_top_candidates(board, probs_after, top_k=1)
                reply_move_obj = chess.Move.from_uci(reply_candidates[0]["move_uci"]) if reply_candidates else None
                _, reply_line_san, reply_line_uci = self._greedy_pv(board, limit=4)

                # Determine whether played move was the model's top choice
                is_best_move = (best_move_obj is not None and move == best_move_obj)

                if is_best_move:
                    cp_loss = 0.0
                    classification = "best"
                else:
                    # Intra-ply comparison: compare position after played move vs position after best move
                    if best_move_obj and best_move_obj in board_before.legal_moves:
                        board_best = board_before.copy(stack=False)
                        board_best.push(best_move_obj)
                        probs_best, val_best = self.model.evaluate_board(board_best, self.device)
                        eval_best_after_white = value_to_cp(val_best, board_best.turn)
                        if color == "white":
                            cp_loss = max(0.0, eval_best_after_white - eval_after_white)
                        else:
                            cp_loss = max(0.0, eval_after_white - eval_best_after_white)
                    else:
                        if color == "white":
                            cp_loss = max(0.0, (eval_before_white or 0) - (eval_after_white or 0))
                        else:
                            cp_loss = max(0.0, (eval_after_white or 0) - (eval_before_white or 0))
                    book_details = get_book_move_details(board_before, move, cp_loss)
                    if book_details["is_book"]:
                        classification = "book"
                    else:
                        classification = classify_move(cp_loss)

                motifs = extract_tactical_motifs(board_before, move, board)
                threat_summary, threat_eval = build_threat_summary(board, reply_move_obj, cp_loss)

                findability_score = best_candidate["probability"] if best_candidate else 0.0
                if findability_score >= 50.0:
                    findability_tier = "intuitive"
                elif findability_score >= 15.0:
                    findability_tier = "calculated"
                else:
                    findability_tier = "computer_only"

                # Practical best move: highest human confidence move
                practical_cand = top_candidates[0] if top_candidates else best_candidate
                practical_move_obj = chess.Move.from_uci(practical_cand["move_uci"]) if practical_cand else None

                trap_danger = None
                if cp_loss >= 100.0 and reply_candidates and reply_candidates[0]["probability"] >= 40.0:
                    trap_danger = "high_blunder_danger"

                is_blindspot = (not is_best_move) and (played_prob >= 25.0) and (cp_loss >= 100.0)

                move_record = {
                    "type": "move",
                    "move_number": move_number,
                    "color": color,
                    "move_san": board_before.san(move),
                    "move_uci": move.uci(),
                    "eval_before": eval_before_white,
                    "eval_after": eval_after_white,
                    "best_move_uci": str(best_move_obj) if best_move_obj else None,
                    "best_move_san": best_candidate["move_san"] if best_candidate else None,
                    "fen_before": board_before.fen(),
                    "fen_after": board.fen(),
                    "best_line_san": best_line_san,
                    "best_line_uci": best_line_uci,
                    "reply_move_uci": str(reply_move_obj) if reply_move_obj else None,
                    "reply_move_san": board.san(reply_move_obj) if reply_move_obj and reply_move_obj in board.legal_moves else None,
                    "reply_line_san": reply_line_san,
                    "reply_line_uci": reply_line_uci,
                    "cp_loss": round(cp_loss, 1),
                    "classification": classification,
                    "motifs": motifs,
                    "threat_summary": threat_summary,
                    "threat_eval": threat_eval,
                    "is_book": book_details.get("is_book", False),
                    "book_weight": book_details.get("book_weight"),
                    "book_candidates": book_details.get("book_candidates", []),
                    "human_move_prob": played_prob,
                    "human_candidates": top_candidates,
                    "is_human_blindspot": is_blindspot,
                    "findability_score": findability_score,
                    "findability_tier": findability_tier,
                    "practical_best_move_uci": str(practical_move_obj) if practical_move_obj else None,
                    "practical_best_move_san": practical_cand["move_san"] if practical_cand else None,
                    "trap_danger": trap_danger,
                    **build_move_piece_metadata(board_before, move, "move"),
                    **build_move_piece_metadata(board_before, best_move_obj, "best_move"),
                    **build_move_piece_metadata(board_before, practical_move_obj, "practical_best_move"),
                    **build_move_piece_metadata(board, reply_move_obj, "reply_move"),
                }
                moves_data.append(move_record)
                yield f"data: {json.dumps(move_record)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            return

        summary = build_summary(moves_data, player_color)
        yield f"data: {json.dumps(summary)}\n\n"
        yield "data: [DONE]\n\n"

    def analyze_position(
        self,
        fen: str,
        move_uci: Optional[str] = None,
        depth: int = 12,
        pv_length: int = 5
    ) -> Dict[str, Any]:
        try:
            board = chess.Board(fen)
        except ValueError:
            return {"error": "Invalid FEN string"}

        probs, val = self.model.evaluate_board(board, self.device)
        eval_before = value_to_cp(val, board.turn)
        top_candidates = self._get_top_candidates(board, probs, top_k=4)
        best_cand = top_candidates[0] if top_candidates else None
        _, best_line_san, best_line_uci = self._greedy_pv(board, limit=pv_length)

        findability_score = best_cand["probability"] if best_cand else 0.0
        if findability_score >= 50.0:
            findability_tier = "intuitive"
        elif findability_score >= 15.0:
            findability_tier = "calculated"
        else:
            findability_tier = "computer_only"

        result = {
            "fen": fen,
            "eval": eval_before,
            "best_move_uci": best_cand["move_uci"] if best_cand else None,
            "best_move_san": best_cand["move_san"] if best_cand else None,
            "best_line_san": best_line_san,
            "best_line_uci": best_line_uci,
            "human_candidates": top_candidates,
            "findability_score": findability_score,
            "findability_tier": findability_tier,
            "practical_best_move_uci": best_cand["move_uci"] if best_cand else None,
            "practical_best_move_san": best_cand["move_san"] if best_cand else None,
        }

        if move_uci:
            try:
                move = chess.Move.from_uci(move_uci)
            except ValueError:
                result["error"] = "Invalid UCI move format"
                return result

            if move not in board.legal_moves:
                result["error"] = "Illegal move in this position"
                return result

            color = "white" if board.turn == chess.WHITE else "black"
            move_san = board.san(move)
            board_before = board.copy(stack=False)
            board.push(move)
            fen_after = board.fen()
            probs_after, val_after = self.model.evaluate_board(board, self.device)
            eval_after = value_to_cp(val_after, board.turn)

            is_best_move = (best_cand is not None and move_uci == best_cand.get("move_uci"))
            if is_best_move:
                cp_loss = 0.0
                classification = "best"
            else:
                if best_cand and best_cand.get("move_uci"):
                    best_move_obj = chess.Move.from_uci(best_cand["move_uci"])
                    if best_move_obj in board_before.legal_moves:
                        board_best = board_before.copy(stack=False)
                        board_best.push(best_move_obj)
                        probs_best, val_best = self.model.evaluate_board(board_best, self.device)
                        eval_best_after = value_to_cp(val_best, board_best.turn)
                        if color == "white":
                            cp_loss = max(0.0, eval_best_after - eval_after)
                        else:
                            cp_loss = max(0.0, eval_after - eval_best_after)
                    else:
                        if color == "white":
                            cp_loss = max(0.0, (eval_before or 0) - (eval_after or 0))
                        else:
                            cp_loss = max(0.0, (eval_after or 0) - (eval_before or 0))
                else:
                    if color == "white":
                        cp_loss = max(0.0, (eval_before or 0) - (eval_after or 0))
                    else:
                        cp_loss = max(0.0, (eval_after or 0) - (eval_before or 0))
                book_details = get_book_move_details(board_before, move, cp_loss)
                if book_details["is_book"]:
                    classification = "book"
                else:
                    classification = classify_move(cp_loss)

            dev_candidates = self._get_top_candidates(board, probs_after, top_k=1)
            dev_best_move = chess.Move.from_uci(dev_candidates[0]["move_uci"]) if dev_candidates else None
            _, dev_best_line_san, dev_best_line_uci = self._greedy_pv(board, limit=pv_length)
            motifs = extract_tactical_motifs(board_before, move, board)
            threat_summary, threat_eval = build_threat_summary(board, dev_best_move, cp_loss)

            try:
                played_idx = encode_move(move, board_before.turn)
                played_prob = round(float(probs[played_idx]) * 100.0, 1)
            except Exception:
                played_prob = 0.0

            result.update({
                "move_san": move_san,
                "move_uci": move_uci,
                "color": color,
                "fen_after": fen_after,
                "eval_after": eval_after,
                "cp_loss": round(cp_loss, 1),
                "classification": classification,
                "motifs": motifs,
                "threat_summary": threat_summary,
                "threat_eval": threat_eval,
                "is_book": book_details.get("is_book", False),
                "book_weight": book_details.get("book_weight"),
                "book_candidates": book_details.get("book_candidates", []),
                "human_move_prob": played_prob,
                "is_human_blindspot": (not is_best_move) and (played_prob >= 25.0) and (cp_loss >= 100.0),
                "deviation_best_move_uci": str(dev_best_move) if dev_best_move else None,
                "deviation_best_move_san": board.san(dev_best_move) if dev_best_move and dev_best_move in board.legal_moves else None,
                "deviation_best_line_san": dev_best_line_san,
                "deviation_best_line_uci": dev_best_line_uci,
            })

        return result

    def suggest_sparring_move(
        self,
        board: chess.Board,
        temperature: float = 0.2,
        top_k: int = 3
    ) -> Dict[str, Any]:
        if board.is_game_over():
            return {
                "selected_move_uci": None,
                "selected_move_san": None,
                "eval": 0.0,
                "win_probability_pct": 50.0,
                "candidates": [],
                "is_game_over": True,
                "game_result": board.result(),
            }

        probs, val = self.model.evaluate_board(board, self.device)
        eval_cp = value_to_cp(val, board.turn)
        win_pct = round((val + 1.0) / 2.0 * 100.0, 1)

        top_candidates = self._get_top_candidates(board, probs, top_k=max(top_k, 5))

        # Perform shallow minimax search to identify the best tactical move and evaluate candidates
        tactical_best, tactical_score, _ = self.model.search_best_move(
            board, self.device, depth=2, top_candidates=max(top_k, 5)
        )

        top_candidates = self._get_top_candidates(board, probs, top_k=max(top_k, 5))

        if temperature <= 0.05 or tactical_best is None:
            chosen_move = tactical_best or (chess.Move.from_uci(top_candidates[0]["move_uci"]) if top_candidates else next(iter(board.legal_moves)))
        else:
            # Filter top candidates to eliminate tactical blunders (moves dropping material)
            valid_moves = []
            valid_probs = []
            for cand in top_candidates:
                m = chess.Move.from_uci(cand["move_uci"])
                if m not in board.legal_moves:
                    continue
                board.push(m)
                _, opp_val = self.model.evaluate_board(board, self.device)
                board.pop()
                cand_score = -opp_val
                # Only keep moves that don't throw away significant tactical evaluation
                if cand_score >= (tactical_score - 0.28):
                    valid_moves.append(m)
                    valid_probs.append(cand["probability"])

            if len(valid_moves) > 0:
                probs_arr = np.array(valid_probs, dtype=np.float32)
                p_values = probs_arr ** (1.0 / max(0.01, temperature))
                p_sum = np.sum(p_values)
                if p_sum > 0:
                    p_values = p_values / p_sum
                    chosen_idx = np.random.choice(len(valid_moves), p=p_values)
                    chosen_move = valid_moves[chosen_idx]
                else:
                    chosen_move = valid_moves[0]
            else:
                chosen_move = tactical_best or (chess.Move.from_uci(top_candidates[0]["move_uci"]) if top_candidates else next(iter(board.legal_moves)))

        if chosen_move not in board.legal_moves:
            chosen_move = next(iter(board.legal_moves))

        return {
            "selected_move_uci": chosen_move.uci(),
            "selected_move_san": board.san(chosen_move),
            "eval": eval_cp,
            "win_probability_pct": win_pct,
            "candidates": top_candidates[:top_k],
            "is_game_over": False,
            "game_result": None,
        }
