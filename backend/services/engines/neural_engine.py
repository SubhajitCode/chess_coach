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
            probs, _ = self.model.evaluate_board(sim_board, self.device)
            legal_indices = np.where(probs > 0)[0]
            if len(legal_indices) == 0:
                break
            best_idx = legal_indices[np.argmax(probs[legal_indices])]
            best_m = decode_move_index(best_idx, sim_board.turn)
            if best_m not in sim_board.legal_moves:
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

                if color == "white":
                    cp_loss = (eval_before_white or 0) - (eval_after_white or 0)
                else:
                    cp_loss = (eval_after_white or 0) - (eval_before_white or 0)
                cp_loss = max(0.0, cp_loss)

                classification = classify_move(cp_loss)
                motifs = extract_tactical_motifs(board_before, move, board)
                threat_summary, threat_eval = build_threat_summary(board, reply_move_obj, cp_loss)

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
                    "human_move_prob": played_prob,
                    "human_candidates": top_candidates,
                    "is_human_blindspot": (played_prob >= 25.0 and cp_loss >= 100.0),
                    **build_move_piece_metadata(board_before, move, "move"),
                    **build_move_piece_metadata(board_before, best_move_obj, "best_move"),
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

        result = {
            "fen": fen,
            "eval": eval_before,
            "best_move_uci": best_cand["move_uci"] if best_cand else None,
            "best_move_san": best_cand["move_san"] if best_cand else None,
            "best_line_san": best_line_san,
            "best_line_uci": best_line_uci,
            "human_candidates": top_candidates,
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

            if color == "white":
                cp_loss = (eval_before or 0) - (eval_after or 0)
            else:
                cp_loss = (eval_after or 0) - (eval_before or 0)
            cp_loss = max(0.0, cp_loss)

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
                "move_uci": move_uci,
                "move_san": move_san,
                "color": color,
                "eval_after": eval_after,
                "fen_after": fen_after,
                "cp_loss": round(cp_loss, 1),
                "classification": classify_move(cp_loss),
                "deviation_best_move_uci": str(dev_best_move) if dev_best_move else None,
                "deviation_best_move_san": board.san(dev_best_move) if dev_best_move in board.legal_moves else None,
                "deviation_best_line_san": dev_best_line_san,
                "deviation_best_line_uci": dev_best_line_uci,
                "motifs": motifs,
                "threat_summary": threat_summary,
                "threat_eval": threat_eval,
                "human_move_prob": played_prob,
                "is_human_blindspot": (played_prob >= 25.0 and cp_loss >= 100.0),
            })

        return result
