"""
hybrid_engine.py - Hybrid Chess Analysis Engine Strategy.
Combines Stockfish tactical calculation with Neural Network human move probabilities.
"""

import io
import json
from typing import Any, Dict, Generator, Optional

import chess
import chess.engine
import chess.pgn

from services.engines.base import BaseChessEngine
from services.engines.common import (
    build_move_piece_metadata,
    build_summary,
    build_threat_summary,
    classify_move,
    extract_tactical_motifs,
    pv_preview,
)
from services.engines.neural_engine import HumanNeuralEngine
from services.engines.stockfish_engine import StockfishEngine, score_to_cp
from services.neural_model.chess_encoder import encode_move
from services.opening_book import is_book_move, get_book_move_details


class HybridEngine(BaseChessEngine):
    def __init__(
        self,
        stockfish: Optional[StockfishEngine] = None,
        neural_net: Optional[HumanNeuralEngine] = None
    ):
        self.stockfish = stockfish or StockfishEngine()
        self.neural_net = neural_net or HumanNeuralEngine()

    def get_metadata(self) -> Dict[str, Any]:
        sf_meta = self.stockfish.get_metadata()
        nn_meta = self.neural_net.get_metadata()
        return {
            "id": "hybrid",
            "name": "Hybrid Coach (Stockfish + Human AI)",
            "type": "hybrid",
            "description": "Combines Stockfish deep tactical accuracy with Human Model behavioral probabilities.",
            "available": sf_meta["available"] and nn_meta["available"],
            "sub_engines": [sf_meta, nn_meta],
        }

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
            "engine": "hybrid",
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
            with chess.engine.SimpleEngine.popen_uci(self.stockfish.stockfish_path) as engine:
                for node in game.mainline():
                    move = node.move
                    color = "white" if board.turn == chess.WHITE else "black"
                    half_move += 1
                    move_number = (half_move + 1) // 2

                    board_before = board.copy(stack=False)
                    info_before = engine.analyse(board, chess.engine.Limit(depth=depth))
                    eval_before_white = score_to_cp(info_before["score"], chess.WHITE)

                    best_move = info_before.get("pv", [None])[0]
                    best_line_san, best_line_uci = pv_preview(board_before, info_before.get("pv"))

                    # Human Neural Net predictions
                    nn_probs, _ = self.neural_net.model.evaluate_board(board_before, self.neural_net.device)
                    human_candidates = self.neural_net._get_top_candidates(board_before, nn_probs, top_k=4)
                    try:
                        played_idx = encode_move(move, board.turn)
                        played_prob = round(float(nn_probs[played_idx]) * 100.0, 1)
                    except Exception:
                        played_prob = 0.0

                    board.push(move)

                    info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
                    eval_after_white = score_to_cp(info_after["score"], chess.WHITE)
                    reply_move = info_after.get("pv", [None])[0]
                    reply_line_san, reply_line_uci = pv_preview(
                        board.copy(stack=False), info_after.get("pv")
                    )

                    if color == "white":
                        cp_loss = (eval_before_white or 0) - (eval_after_white or 0)
                    else:
                        cp_loss = (eval_after_white or 0) - (eval_before_white or 0)
                    cp_loss = max(0.0, cp_loss)

                    book_details = get_book_move_details(board_before, move, cp_loss)
                    if book_details["is_book"]:
                        classification = "book"
                    else:
                        classification = classify_move(cp_loss)
                    motifs = extract_tactical_motifs(board_before, move, board)
                    threat_summary, threat_eval = build_threat_summary(board, reply_move, cp_loss)

                    # Findability of Stockfish's best move in the neural model
                    best_move_prob = 0.0
                    if best_move:
                        try:
                            bm_idx = encode_move(best_move, board_before.turn)
                            best_move_prob = round(float(nn_probs[bm_idx]) * 100.0, 1)
                        except Exception:
                            best_move_prob = 0.0

                    findability_score = best_move_prob
                    if findability_score >= 50.0:
                        findability_tier = "intuitive"
                    elif findability_score >= 15.0:
                        findability_tier = "calculated"
                    else:
                        findability_tier = "computer_only"

                    practical_cand = human_candidates[0] if human_candidates else None
                    practical_move_obj = chess.Move.from_uci(practical_cand["move_uci"]) if practical_cand else None

                    move_record = {
                        "type": "move",
                        "move_number": move_number,
                        "color": color,
                        "move_san": board_before.san(move),
                        "move_uci": move.uci(),
                        "eval_before": eval_before_white,
                        "eval_after": eval_after_white,
                        "best_move_uci": str(best_move) if best_move else None,
                        "best_move_san": board_before.san(best_move) if best_move else None,
                        "fen_before": board_before.fen(),
                        "fen_after": board.fen(),
                        "best_line_san": best_line_san,
                        "best_line_uci": best_line_uci,
                        "reply_move_uci": str(reply_move) if reply_move else None,
                        "reply_move_san": board.san(reply_move) if reply_move and reply_move in board.legal_moves else None,
                        "reply_line_san": reply_line_san,
                        "reply_line_uci": reply_line_uci,
                        "cp_loss": cp_loss,
                        "classification": classification,
                        "motifs": motifs,
                        "threat_summary": threat_summary,
                        "threat_eval": threat_eval,
                        "is_book": book_details.get("is_book", False),
                        "book_weight": book_details.get("book_weight"),
                        "book_candidates": book_details.get("book_candidates", []),
                        "human_move_prob": played_prob,
                        "human_candidates": human_candidates,
                        "is_human_blindspot": (played_prob >= 25.0 and cp_loss >= 100.0),
                        "findability_score": findability_score,
                        "findability_tier": findability_tier,
                        "practical_best_move_uci": str(practical_move_obj) if practical_move_obj else None,
                        "practical_best_move_san": practical_cand["move_san"] if practical_cand else None,
                        **build_move_piece_metadata(board_before, move, "move"),
                        **build_move_piece_metadata(board_before, best_move, "best_move"),
                        **build_move_piece_metadata(board_before, practical_move_obj, "practical_best_move"),
                        **build_move_piece_metadata(board, reply_move, "reply_move"),
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
        sf_res = self.stockfish.analyze_position(fen, move_uci, depth, pv_length)
        if sf_res.get("error"):
            return sf_res

        nn_res = self.neural_net.analyze_position(fen, move_uci, depth, pv_length)
        sf_res["human_candidates"] = nn_res.get("human_candidates", [])
        if "human_move_prob" in nn_res:
            sf_res["human_move_prob"] = nn_res["human_move_prob"]
            sf_res["is_human_blindspot"] = (nn_res["human_move_prob"] >= 25.0 and sf_res.get("cp_loss", 0) >= 100.0)

        return sf_res

    def suggest_sparring_move(
        self,
        board: chess.Board,
        temperature: float = 0.2,
        top_k: int = 3
    ) -> Dict[str, Any]:
        # Uses Human Neural Model for candidate selection and Stockfish for eval
        nn_res = self.neural_net.suggest_sparring_move(board, temperature, top_k)
        if nn_res.get("is_game_over"):
            return nn_res

        sf_res = self.stockfish.suggest_sparring_move(board, temperature, 1)
        nn_res["eval"] = sf_res.get("eval", nn_res["eval"])
        nn_res["win_probability_pct"] = sf_res.get("win_probability_pct", nn_res["win_probability_pct"])
        return nn_res
