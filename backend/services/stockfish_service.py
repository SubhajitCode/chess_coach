import os
import json
import chess
import chess.pgn
import chess.engine
import io
from typing import Generator
from models import MoveAnalysis, GameSummary, AnalysisResult

STOCKFISH_PATH = os.getenv("STOCKFISH_PATH", "/opt/homebrew/bin/stockfish")
DEFAULT_DEPTH = 18

# Centipawn loss thresholds for classification
THRESHOLDS = {
    "best": 10,
    "excellent": 25,
    "good": 50,
    "inaccuracy": 100,
    "mistake": 200,
}


def classify_move(cp_loss: float) -> str:
    if cp_loss <= THRESHOLDS["best"]:
        return "best"
    elif cp_loss <= THRESHOLDS["excellent"]:
        return "excellent"
    elif cp_loss <= THRESHOLDS["good"]:
        return "good"
    elif cp_loss <= THRESHOLDS["inaccuracy"]:
        return "inaccuracy"
    elif cp_loss <= THRESHOLDS["mistake"]:
        return "mistake"
    else:
        return "blunder"


def score_to_cp(score: chess.engine.Score, pov: chess.Color) -> float | None:
    """Convert engine score to centipawns from White's perspective."""
    relative = score.pov(pov)
    if relative.is_mate():
        # Represent mate as ±10000 cp
        mate_in = relative.mate()
        return 10000 if mate_in > 0 else -10000
    cp = relative.score()
    return float(cp) if cp is not None else None


def analyze_pgn(pgn_text: str, depth: int = DEFAULT_DEPTH, player_color: str = None) -> AnalysisResult:
    pgn_io = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn_io)
    if game is None:
        raise ValueError("Invalid PGN")

    headers = game.headers
    white = headers.get("White", "?")
    black = headers.get("Black", "?")
    result = headers.get("Result", "*")
    opening = headers.get("Opening") or headers.get("ECOUrl", None)
    time_control = headers.get("TimeControl", None)

    # Auto-detect player color if not provided
    if player_color is None:
        player_color = "white"  # default; caller should set this

    player_chess_color = chess.WHITE if player_color == "white" else chess.BLACK

    board = game.board()
    node = game
    moves_data: list[MoveAnalysis] = []

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        move_number = 0
        half_move = 0

        for node in game.mainline():
            move = node.move
            color = "white" if board.turn == chess.WHITE else "black"
            half_move += 1
            move_number = (half_move + 1) // 2

            # Eval BEFORE the move
            info_before = engine.analyse(board, chess.engine.Limit(depth=depth))
            eval_before_white = score_to_cp(info_before["score"], chess.WHITE)

            best_move_uci = info_before.get("pv", [None])[0]
            best_move_san = None
            if best_move_uci:
                try:
                    best_move_san = board.san(best_move_uci)
                except Exception:
                    best_move_san = str(best_move_uci)

            move_san = board.san(move)
            move_uci = move.uci()

            board.push(move)

            # Eval AFTER the move
            info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
            eval_after_white = score_to_cp(info_after["score"], chess.WHITE)

            # Centipawn loss is always from the perspective of the player who just moved
            if color == "white":
                cp_loss = (eval_before_white or 0) - (eval_after_white or 0)
            else:
                cp_loss = (eval_after_white or 0) - (eval_before_white or 0)

            cp_loss = max(0.0, cp_loss)  # loss can't be negative

            classification = classify_move(cp_loss)

            moves_data.append(MoveAnalysis(
                move_number=move_number,
                color=color,
                move_san=move_san,
                move_uci=move_uci,
                eval_before=eval_before_white,
                eval_after=eval_after_white,
                best_move_uci=str(best_move_uci) if best_move_uci else None,
                best_move_san=best_move_san,
                cp_loss=cp_loss,
                classification=classification,
            ))

    # Build summary for the player
    player_moves = [m for m in moves_data if m.color == player_color]
    counts = {c: 0 for c in ["best", "excellent", "good", "inaccuracy", "mistake", "blunder"]}
    for m in player_moves:
        counts[m.classification] = counts.get(m.classification, 0) + 1

    total_player = len(player_moves)
    # Accuracy formula (approximation used by Chess.com)
    if total_player > 0:
        weighted_score = sum(
            {"best": 100, "excellent": 90, "good": 75, "inaccuracy": 50, "mistake": 25, "blunder": 0}[m.classification]
            for m in player_moves
        )
        accuracy = round(weighted_score / total_player, 1)
    else:
        accuracy = 0.0

    summary = GameSummary(
        total_moves=len(moves_data),
        player_moves=total_player,
        blunders=counts["blunder"],
        mistakes=counts["mistake"],
        inaccuracies=counts["inaccuracy"],
        good_moves=counts["good"],
        excellent_moves=counts["excellent"],
        best_moves=counts["best"],
        accuracy=accuracy,
    )

    return AnalysisResult(
        pgn=pgn_text,
        white=white,
        black=black,
        result=result,
        opening=opening,
        time_control=time_control,
        player_color=player_color,
        moves=moves_data,
        summary=summary,
    )


def _build_summary(moves_data: list, player_color: str) -> dict:
    player_moves = [m for m in moves_data if m["color"] == player_color]
    counts = {c: 0 for c in ["best", "excellent", "good", "inaccuracy", "mistake", "blunder"]}
    for m in player_moves:
        counts[m["classification"]] = counts.get(m["classification"], 0) + 1

    total_player = len(player_moves)
    if total_player > 0:
        weighted_score = sum(
            {"best": 100, "excellent": 90, "good": 75, "inaccuracy": 50, "mistake": 25, "blunder": 0}[m["classification"]]
            for m in player_moves
        )
        accuracy = round(weighted_score / total_player, 1)
    else:
        accuracy = 0.0

    return {
        "type": "summary",
        "total_moves": len(moves_data),
        "player_moves": total_player,
        "blunders": counts["blunder"],
        "mistakes": counts["mistake"],
        "inaccuracies": counts["inaccuracy"],
        "good_moves": counts["good"],
        "excellent_moves": counts["excellent"],
        "best_moves": counts["best"],
        "accuracy": accuracy,
    }


def analyze_pgn_stream(pgn_text: str, depth: int = DEFAULT_DEPTH, player_color: str = "white") -> Generator[str, None, None]:
    """Generator that yields SSE-formatted strings: one per move, then a summary, then [DONE]."""
    pgn_io = io.StringIO(pgn_text)
    game = chess.pgn.read_game(pgn_io)
    if game is None:
        yield f"data: {json.dumps({'type': 'error', 'message': 'Invalid PGN'})}\n\n"
        return

    headers = game.headers
    # Emit game metadata first
    meta = {
        "type": "meta",
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
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            for node in game.mainline():
                move = node.move
                color = "white" if board.turn == chess.WHITE else "black"
                half_move += 1
                move_number = (half_move + 1) // 2

                info_before = engine.analyse(board, chess.engine.Limit(depth=depth))
                eval_before_white = score_to_cp(info_before["score"], chess.WHITE)

                best_move_uci = info_before.get("pv", [None])[0]
                best_move_san = None
                if best_move_uci:
                    try:
                        best_move_san = board.san(best_move_uci)
                    except Exception:
                        best_move_san = str(best_move_uci)

                move_san = board.san(move)
                move_uci = move.uci()

                board.push(move)

                info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
                eval_after_white = score_to_cp(info_after["score"], chess.WHITE)

                if color == "white":
                    cp_loss = (eval_before_white or 0) - (eval_after_white or 0)
                else:
                    cp_loss = (eval_after_white or 0) - (eval_before_white or 0)
                cp_loss = max(0.0, cp_loss)

                classification = classify_move(cp_loss)

                move_dict = {
                    "type": "move",
                    "move_number": move_number,
                    "color": color,
                    "move_san": move_san,
                    "move_uci": move_uci,
                    "eval_before": eval_before_white,
                    "eval_after": eval_after_white,
                    "best_move_uci": str(best_move_uci) if best_move_uci else None,
                    "best_move_san": best_move_san,
                    "cp_loss": cp_loss,
                    "classification": classification,
                }
                moves_data.append(move_dict)
                yield f"data: {json.dumps(move_dict)}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        return

    summary = _build_summary(moves_data, player_color)
    yield f"data: {json.dumps(summary)}\n\n"
    yield "data: [DONE]\n\n"
