"""
stockfish_engine.py - Stockfish Engine Adapter Strategy.
"""

import io
import json
import os
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

STOCKFISH_PATH = os.getenv("STOCKFISH_PATH", "/opt/homebrew/bin/stockfish")
DEFAULT_DEPTH = 18


def score_to_cp(score: chess.engine.Score, pov: chess.Color) -> Optional[float]:
    relative = score.pov(pov)
    if relative.is_mate():
        mate_in = relative.mate()
        return 10000.0 if mate_in > 0 else -10000.0
    cp = relative.score()
    return float(cp) if cp is not None else None


class StockfishEngine(BaseChessEngine):
    def __init__(self, stockfish_path: str = STOCKFISH_PATH):
        self.stockfish_path = stockfish_path

    def get_metadata(self) -> Dict[str, Any]:
        exists = os.path.exists(self.stockfish_path)
        return {
            "id": "stockfish",
            "name": "Stockfish 16 Engine",
            "type": "classical_search",
            "description": "Deep tactical calculation engine with centipawn evaluation.",
            "available": exists,
            "path": self.stockfish_path,
        }

    def analyze_pgn_stream(
        self,
        pgn_text: str,
        depth: int = DEFAULT_DEPTH,
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
            "engine": "stockfish",
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
            with chess.engine.SimpleEngine.popen_uci(self.stockfish_path) as engine:
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

                    classification = classify_move(cp_loss)
                    motifs = extract_tactical_motifs(board_before, move, board)
                    threat_summary, threat_eval = build_threat_summary(board, reply_move, cp_loss)

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
                        "reply_move_san": board.san(reply_move) if reply_move in board.legal_moves else None,
                        "reply_line_san": reply_line_san,
                        "reply_line_uci": reply_line_uci,
                        "cp_loss": cp_loss,
                        "classification": classification,
                        "motifs": motifs,
                        "threat_summary": threat_summary,
                        "threat_eval": threat_eval,
                        **build_move_piece_metadata(board_before, move, "move"),
                        **build_move_piece_metadata(board_before, best_move, "best_move"),
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
        try:
            board = chess.Board(fen)
        except ValueError:
            return {"error": "Invalid FEN string"}

        with chess.engine.SimpleEngine.popen_uci(self.stockfish_path) as engine:
            info = engine.analyse(board, chess.engine.Limit(depth=depth))
            eval_before = score_to_cp(info["score"], chess.WHITE)
            best_move = info.get("pv", [None])[0]
            best_move_san = board.san(best_move) if best_move else None
            best_line_san, best_line_uci = pv_preview(board, info.get("pv"), pv_length)

            result = {
                "fen": fen,
                "eval": eval_before,
                "best_move_uci": str(best_move) if best_move else None,
                "best_move_san": best_move_san,
                "best_line_san": best_line_san,
                "best_line_uci": best_line_uci,
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

                info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
                eval_after = score_to_cp(info_after["score"], chess.WHITE)

                if color == "white":
                    cp_loss = (eval_before or 0) - (eval_after or 0)
                else:
                    cp_loss = (eval_after or 0) - (eval_before or 0)
                cp_loss = max(0.0, cp_loss)

                dev_best_move = info_after.get("pv", [None])[0]
                dev_best_line_san, dev_best_line_uci = pv_preview(board, info_after.get("pv"), pv_length)
                motifs = extract_tactical_motifs(board_before, move, board)
                threat_summary, threat_eval = build_threat_summary(board, dev_best_move, cp_loss)

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

        with chess.engine.SimpleEngine.popen_uci(self.stockfish_path) as engine:
            info = engine.analyse(board, chess.engine.Limit(depth=12), multipv=min(top_k, max(1, len(list(board.legal_moves)))))
            
            candidates = []
            if isinstance(info, list):
                for entry in info:
                    pv = entry.get("pv", [])
                    if pv:
                        m = pv[0]
                        sc = score_to_cp(entry.get("score"), board.turn) or 0.0
                        candidates.append({
                            "move_san": board.san(m),
                            "move_uci": m.uci(),
                            "probability": round(max(5.0, 50.0 + sc / 20.0), 1),
                        })
            else:
                pv = info.get("pv", [])
                if pv:
                    m = pv[0]
                    candidates.append({
                        "move_san": board.san(m),
                        "move_uci": m.uci(),
                        "probability": 100.0,
                    })

            best_move = chess.Move.from_uci(candidates[0]["move_uci"]) if candidates else next(iter(board.legal_moves))
            eval_val = 0.0
            if isinstance(info, list) and info:
                eval_val = score_to_cp(info[0].get("score"), chess.WHITE) or 0.0
            elif isinstance(info, dict):
                eval_val = score_to_cp(info.get("score"), chess.WHITE) or 0.0

            win_pct = round(max(0.0, min(100.0, 50.0 + (eval_val if board.turn == chess.WHITE else -eval_val) / 20.0)), 1)

            return {
                "selected_move_uci": best_move.uci(),
                "selected_move_san": board.san(best_move),
                "eval": eval_val,
                "win_probability_pct": win_pct,
                "candidates": candidates[:top_k],
                "is_game_over": False,
                "game_result": None,
            }
