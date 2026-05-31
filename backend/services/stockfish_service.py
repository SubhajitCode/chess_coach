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
PV_PREVIEW_LENGTH = 4
PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}

# Centipawn loss thresholds for classification
THRESHOLDS = {
    "best": 10,
    "excellent": 25,
    "good": 50,
    "inaccuracy": 100,
    "mistake": 200,
}

ELO_CALIBRATION_POINTS = [
    (8.0, 2900),
    (15.0, 2400),
    (25.0, 2000),
    (40.0, 1600),
    (60.0, 1200),
    (80.0, 800),
    (110.0, 500),
    (150.0, 300),
    (250.0, 100),
]

MAX_CP_LOSS_FOR_STATS = 350.0


def _estimate_elo(avg_cp_loss: float) -> int:
    """Rough ELO estimate from average centipawn loss per move.

    Uses a piecewise linear interpolation across calibration anchors.
    """
    avg_cp_loss = max(10.0, min(MAX_CP_LOSS_FOR_STATS, avg_cp_loss))

    if avg_cp_loss <= ELO_CALIBRATION_POINTS[0][0]:
        return ELO_CALIBRATION_POINTS[0][1]

    for index, (left_cp, left_elo) in enumerate(ELO_CALIBRATION_POINTS[:-1]):
        right_cp, right_elo = ELO_CALIBRATION_POINTS[index + 1]
        if avg_cp_loss <= right_cp:
            span = right_cp - left_cp
            progress = (avg_cp_loss - left_cp) / span
            elo = left_elo + (right_elo - left_elo) * progress
            return round(elo)

    return ELO_CALIBRATION_POINTS[-1][1]


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


def _piece_name(piece: chess.Piece | None) -> str | None:
    if piece is None:
        return None
    return PIECE_NAMES.get(piece.piece_type)


def _captured_piece_name(board: chess.Board, move: chess.Move) -> str | None:
    if not board.is_capture(move):
        return None
    if board.is_en_passant(move):
        return "pawn"
    return _piece_name(board.piece_at(move.to_square))


def _move_summary(board: chess.Board, move: chess.Move) -> str:
    piece = board.piece_at(move.from_square)
    piece_name = _piece_name(piece) or "piece"
    from_square = chess.square_name(move.from_square)
    to_square = chess.square_name(move.to_square)
    captured_piece = _captured_piece_name(board, move)
    promotion_piece = PIECE_NAMES.get(move.promotion) if move.promotion else None

    if board.is_castling(move):
        summary = "king castles kingside" if chess.square_file(move.to_square) == 6 else "king castles queenside"
    elif captured_piece:
        summary = f"{piece_name} from {from_square} captures the {captured_piece} on {to_square}"
    else:
        summary = f"{piece_name} from {from_square} moves to {to_square}"

    if promotion_piece:
        summary += f" and promotes to a {promotion_piece}"

    board_after = board.copy(stack=False)
    board_after.push(move)
    if board_after.is_checkmate():
        summary += ", delivering checkmate"
    elif board_after.is_check():
        summary += ", giving check"

    return summary


def _move_fact_fields(board: chess.Board, move: chess.Move | None, prefix: str) -> dict:
    if move is None:
        return {
            f"{prefix}_piece": None,
            f"{prefix}_from": None,
            f"{prefix}_to": None,
            f"{prefix}_captured_piece": None,
            f"{prefix}_is_capture": False,
            f"{prefix}_is_check": False,
            f"{prefix}_is_checkmate": False,
            f"{prefix}_summary": None,
        }

    piece = board.piece_at(move.from_square)
    board_after = board.copy(stack=False)
    board_after.push(move)

    return {
        f"{prefix}_piece": _piece_name(piece),
        f"{prefix}_from": chess.square_name(move.from_square),
        f"{prefix}_to": chess.square_name(move.to_square),
        f"{prefix}_captured_piece": _captured_piece_name(board, move),
        f"{prefix}_is_capture": board.is_capture(move),
        f"{prefix}_is_check": board_after.is_check(),
        f"{prefix}_is_checkmate": board_after.is_checkmate(),
        f"{prefix}_summary": _move_summary(board, move),
    }


def _pv_preview(board: chess.Board, pv: list[chess.Move] | None, limit: int = PV_PREVIEW_LENGTH) -> tuple[list[str], list[str]]:
    if not pv:
        return [], []

    pv_board = board.copy(stack=False)
    pv_san: list[str] = []
    pv_uci: list[str] = []
    for pv_move in pv[:limit]:
        try:
            pv_san.append(pv_board.san(pv_move))
        except Exception:
            pv_san.append(pv_move.uci())
        pv_uci.append(pv_move.uci())
        pv_board.push(pv_move)
    return pv_san, pv_uci


def _build_move_record(
    board_before: chess.Board,
    move: chess.Move,
    best_move: chess.Move | None,
    best_line_san: list[str],
    best_line_uci: list[str],
    reply_move: chess.Move | None,
    reply_line_san: list[str],
    reply_line_uci: list[str],
    move_number: int,
    color: str,
    eval_before_white: float | None,
    eval_after_white: float | None,
    cp_loss: float,
    classification: str,
    record_type: str | None = None,
) -> dict:
    board_after = board_before.copy(stack=False)
    board_after.push(move)

    record = {
        "move_number": move_number,
        "color": color,
        "move_san": board_before.san(move),
        "move_uci": move.uci(),
        "eval_before": eval_before_white,
        "eval_after": eval_after_white,
        "best_move_uci": str(best_move) if best_move else None,
        "best_move_san": board_before.san(best_move) if best_move else None,
        "fen_before": board_before.fen(),
        "fen_after": board_after.fen(),
        "best_line_san": best_line_san,
        "best_line_uci": best_line_uci,
        "reply_move_uci": str(reply_move) if reply_move else None,
        "reply_move_san": board_after.san(reply_move) if reply_move else None,
        "reply_line_san": reply_line_san,
        "reply_line_uci": reply_line_uci,
        "cp_loss": cp_loss,
        "classification": classification,
        **_move_fact_fields(board_before, move, "move"),
        **_move_fact_fields(board_before, best_move, "best_move"),
        **_move_fact_fields(board_after, reply_move, "reply_move"),
    }
    if record_type is not None:
        record["type"] = record_type
    return record


def analyze_position(
    fen: str,
    move_uci: str = None,
    depth: int = 12,
    pv_length: int = 5,
) -> dict:
    """Quick analysis of an arbitrary FEN position.

    If *move_uci* is provided, also evaluates the position after that move and
    returns classification / cp_loss / best-line from the resulting position.
    """
    board = chess.Board(fen)

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        info_before = engine.analyse(board, chess.engine.Limit(depth=depth))
        eval_before = score_to_cp(info_before["score"], chess.WHITE)

        best_move_obj = info_before.get("pv", [None])[0]
        best_line_san, best_line_uci = _pv_preview(
            board.copy(stack=False), info_before.get("pv"), pv_length
        )

        result: dict = {
            "eval_before": eval_before,
            "best_move_uci": str(best_move_obj) if best_move_obj else None,
            "best_move_san": board.san(best_move_obj) if best_move_obj else None,
            "best_line_san": best_line_san,
            "best_line_uci": best_line_uci,
            "fen_before": fen,
        }

        if not (move_uci and len(move_uci) >= 4):
            return result

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
        move_summary_text = _move_summary(board, move)
        board.push(move)
        fen_after = board.fen()

        info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
        eval_after = score_to_cp(info_after["score"], chess.WHITE)

        if color == "white":
            cp_loss = (eval_before or 0) - (eval_after or 0)
        else:
            cp_loss = (eval_after or 0) - (eval_before or 0)
        cp_loss = max(0.0, cp_loss)

        dev_best_move_obj = info_after.get("pv", [None])[0]
        dev_best_move_san = board.san(dev_best_move_obj) if dev_best_move_obj else None
        dev_best_line_san, dev_best_line_uci = _pv_preview(
            board.copy(stack=False), info_after.get("pv"), pv_length
        )

        result.update({
            "move_uci": move_uci,
            "move_san": move_san,
            "move_summary": move_summary_text,
            "color": color,
            "eval_after": eval_after,
            "fen_after": fen_after,
            "cp_loss": round(cp_loss, 1),
            "classification": classify_move(cp_loss),
            "deviation_best_move_uci": str(dev_best_move_obj) if dev_best_move_obj else None,
            "deviation_best_move_san": dev_best_move_san,
            "deviation_best_line_san": dev_best_line_san,
            "deviation_best_line_uci": dev_best_line_uci,
        })

        return result



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

    board = game.board()
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
            board_before = board.copy(stack=False)
            info_before = engine.analyse(board, chess.engine.Limit(depth=depth))
            eval_before_white = score_to_cp(info_before["score"], chess.WHITE)

            best_move = info_before.get("pv", [None])[0]
            best_line_san, best_line_uci = _pv_preview(board_before, info_before.get("pv"))

            board.push(move)

            # Eval AFTER the move
            info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
            eval_after_white = score_to_cp(info_after["score"], chess.WHITE)
            reply_move = info_after.get("pv", [None])[0]
            reply_line_san, reply_line_uci = _pv_preview(
                board.copy(stack=False), info_after.get("pv")
            )

            # Centipawn loss is always from the perspective of the player who just moved
            if color == "white":
                cp_loss = (eval_before_white or 0) - (eval_after_white or 0)
            else:
                cp_loss = (eval_after_white or 0) - (eval_before_white or 0)

            cp_loss = max(0.0, cp_loss)  # loss can't be negative

            classification = classify_move(cp_loss)

            moves_data.append(MoveAnalysis(**_build_move_record(
                board_before=board_before,
                move=move,
                best_move=best_move,
                best_line_san=best_line_san,
                best_line_uci=best_line_uci,
                reply_move=reply_move,
                reply_line_san=reply_line_san,
                reply_line_uci=reply_line_uci,
                move_number=move_number,
                color=color,
                eval_before_white=eval_before_white,
                eval_after_white=eval_after_white,
                cp_loss=cp_loss,
                classification=classification,
            )))

    # Build summary for the player
    player_moves = [m for m in moves_data if m.color == player_color]
    counts = {c: 0 for c in ["best", "excellent", "good", "inaccuracy", "mistake", "blunder"]}
    for m in player_moves:
        counts[m.classification] = counts.get(m.classification, 0) + 1

    total_player = len(player_moves)
    avg_capped_loss = 0.0
    # Accuracy formula (approximation used by Chess.com)
    if total_player > 0:
        weighted_score = sum(
            {"best": 100, "excellent": 90, "good": 75, "inaccuracy": 50, "mistake": 25, "blunder": 0}[m.classification]
            for m in player_moves
        )
        accuracy = round(weighted_score / total_player, 1)
        avg_capped_loss = sum(min(m.cp_loss, MAX_CP_LOSS_FOR_STATS) for m in player_moves) / total_player
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
        avg_cp_loss=round(avg_capped_loss, 1) if total_player > 0 else None,
        estimated_elo=_estimate_elo(avg_capped_loss) if total_player > 0 else None,
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
    avg_capped_loss = 0.0
    if total_player > 0:
        weighted_score = sum(
            {"best": 100, "excellent": 90, "good": 75, "inaccuracy": 50, "mistake": 25, "blunder": 0}[m["classification"]]
            for m in player_moves
        )
        accuracy = round(weighted_score / total_player, 1)
        avg_capped_loss = sum(min(m["cp_loss"], MAX_CP_LOSS_FOR_STATS) for m in player_moves) / total_player
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
        "avg_cp_loss": round(avg_capped_loss, 1) if total_player > 0 else None,
        "estimated_elo": _estimate_elo(avg_capped_loss) if total_player > 0 else None,
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

                board_before = board.copy(stack=False)
                info_before = engine.analyse(board, chess.engine.Limit(depth=depth))
                eval_before_white = score_to_cp(info_before["score"], chess.WHITE)

                best_move = info_before.get("pv", [None])[0]
                best_line_san, best_line_uci = _pv_preview(board_before, info_before.get("pv"))

                board.push(move)

                info_after = engine.analyse(board, chess.engine.Limit(depth=depth))
                eval_after_white = score_to_cp(info_after["score"], chess.WHITE)
                reply_move = info_after.get("pv", [None])[0]
                reply_line_san, reply_line_uci = _pv_preview(
                    board.copy(stack=False), info_after.get("pv")
                )

                if color == "white":
                    cp_loss = (eval_before_white or 0) - (eval_after_white or 0)
                else:
                    cp_loss = (eval_after_white or 0) - (eval_before_white or 0)
                cp_loss = max(0.0, cp_loss)

                classification = classify_move(cp_loss)

                move_dict = _build_move_record(
                    board_before=board_before,
                    move=move,
                    best_move=best_move,
                    best_line_san=best_line_san,
                    best_line_uci=best_line_uci,
                    reply_move=reply_move,
                    reply_line_san=reply_line_san,
                    reply_line_uci=reply_line_uci,
                    move_number=move_number,
                    color=color,
                    eval_before_white=eval_before_white,
                    eval_after_white=eval_after_white,
                    cp_loss=cp_loss,
                    classification=classification,
                    record_type="move",
                )
                moves_data.append(move_dict)
                yield f"data: {json.dumps(move_dict)}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        return

    summary = _build_summary(moves_data, player_color)
    yield f"data: {json.dumps(summary)}\n\n"
    yield "data: [DONE]\n\n"
