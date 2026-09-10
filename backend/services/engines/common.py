"""
common.py - Shared Chess Tactical Analysis Helpers & Motif Detectors.
Used by StockfishEngine, HumanNeuralEngine, and HybridEngine for 100% schema parity.
"""

import chess
from typing import Optional, Tuple, List, Dict, Any

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 300,
    chess.BISHOP: 315,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 10000,
}

THRESHOLDS = {
    "best": 10,
    "excellent": 25,
    "good": 50,
    "inaccuracy": 100,
    "mistake": 200,
}

ACCURACY_ELO_MAP = [
    (98.0, 2800),
    (95.0, 2500),
    (90.0, 2150),
    (85.0, 1850),
    (80.0, 1600),
    (75.0, 1450),
    (70.0, 1300),
    (65.0, 1150),
    (60.0, 1000),
    (50.0, 750),
    (40.0, 500),
    (25.0, 300),
]

MAX_CP_LOSS_FOR_STATS = 200.0


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


def estimate_elo(avg_cp_loss: Optional[float] = None, accuracy: Optional[float] = None) -> int:
    """
    Calibrates estimated Elo using Chess.com / Lichess Game Review benchmark standards,
    blending move accuracy (75%) with capped ACPL (25%) to prevent endgame blunder distortion.
    """
    if accuracy is not None:
        acc = max(0.0, min(100.0, float(accuracy)))
        if acc >= ACCURACY_ELO_MAP[0][0]:
            elo_acc = ACCURACY_ELO_MAP[0][1]
        elif acc <= ACCURACY_ELO_MAP[-1][0]:
            elo_acc = ACCURACY_ELO_MAP[-1][1]
        else:
            elo_acc = 1200.0
            for idx, (top_acc, top_elo) in enumerate(ACCURACY_ELO_MAP[:-1]):
                bot_acc, bot_elo = ACCURACY_ELO_MAP[idx + 1]
                if acc <= top_acc and acc >= bot_acc:
                    span = top_acc - bot_acc
                    progress = (acc - bot_acc) / span if span > 0 else 0.0
                    elo_acc = bot_elo + (top_elo - bot_elo) * progress
                    break
    else:
        elo_acc = 1200.0

    if avg_cp_loss is not None:
        capped_cp = min(MAX_CP_LOSS_FOR_STATS, max(0.0, float(avg_cp_loss)))
        elo_cp = max(300.0, min(2800.0, 2600.0 - capped_cp * 16.0))
        if accuracy is not None:
            final_elo = round(elo_acc * 0.75 + elo_cp * 0.25)
        else:
            final_elo = round(elo_cp)
    else:
        final_elo = round(elo_acc)

    return max(300, min(2850, final_elo))


def piece_name(piece: Optional[chess.Piece]) -> Optional[str]:
    if piece is None:
        return None
    return PIECE_NAMES.get(piece.piece_type)


def captured_piece_name(board: chess.Board, move: chess.Move) -> Optional[str]:
    if not board.is_capture(move):
        return None
    if board.is_en_passant(move):
        return "pawn"
    victim = board.piece_at(move.to_square)
    return piece_name(victim)


def move_summary(board: chess.Board, move: chess.Move) -> str:
    piece = board.piece_at(move.from_square)
    piece_str = piece_name(piece) or "piece"
    from_sq = chess.square_name(move.from_square)
    to_sq = chess.square_name(move.to_square)

    if board.is_castling(move):
        side = "kingside" if chess.square_file(move.to_square) == 6 else "queenside"
        return f"Castles {side}"

    captured = captured_piece_name(board, move)
    board_after = board.copy(stack=False)
    board_after.push(move)

    check_str = ""
    if board_after.is_checkmate():
        check_str = " with checkmate"
    elif board_after.is_check():
        check_str = " giving check"

    if captured:
        return f"{piece_str.capitalize()} on {from_sq} captures {captured} on {to_sq}{check_str}"
    return f"{piece_str.capitalize()} moves from {from_sq} to {to_sq}{check_str}"


def build_move_piece_metadata(board: chess.Board, move: Optional[chess.Move], prefix: str) -> Dict[str, Any]:
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
    if move in board.legal_moves:
        board_after.push(move)

    return {
        f"{prefix}_piece": piece_name(piece),
        f"{prefix}_from": chess.square_name(move.from_square),
        f"{prefix}_to": chess.square_name(move.to_square),
        f"{prefix}_captured_piece": captured_piece_name(board, move),
        f"{prefix}_is_capture": board.is_capture(move),
        f"{prefix}_is_check": board_after.is_check(),
        f"{prefix}_is_checkmate": board_after.is_checkmate(),
        f"{prefix}_summary": move_summary(board, move) if move in board.legal_moves else str(move),
    }


def detect_hanging_pieces(board: chess.Board, color: chess.Color) -> List[str]:
    hanging = []
    enemy_color = not color
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None or piece.color != color or piece.piece_type == chess.KING:
            continue

        enemy_attackers = list(board.attackers(enemy_color, sq))
        if not enemy_attackers:
            continue

        friendly_defenders = list(board.attackers(color, sq))
        piece_val = PIECE_VALUES.get(piece.piece_type, 100)

        if not friendly_defenders:
            sq_name = chess.square_name(sq)
            p_name = piece_name(piece)
            hanging.append(f"hanging:{p_name}_{sq_name}")
            continue

        attacker_pieces = [board.piece_at(a_sq) for a_sq in enemy_attackers if board.piece_at(a_sq)]
        if attacker_pieces:
            lowest_enemy_val = min(PIECE_VALUES.get(p.piece_type, 1000) for p in attacker_pieces)
            if lowest_enemy_val < piece_val:
                sq_name = chess.square_name(sq)
                p_name = piece_name(piece)
                hanging.append(f"underdefended:{p_name}_{sq_name}")

    return hanging


def detect_forks(board: chess.Board, move: chess.Move) -> List[str]:
    forks = []
    to_sq = move.to_square
    moving_piece = board.piece_at(to_sq)
    if moving_piece is None:
        return forks

    color = moving_piece.color
    enemy_color = not color
    attacks = board.attacks(to_sq)
    attacked_pieces = []
    for sq in attacks:
        target = board.piece_at(sq)
        if target and target.color == enemy_color and target.piece_type != chess.PAWN:
            attacked_pieces.append((sq, target))

    if len(attacked_pieces) >= 2:
        names = [f"{piece_name(t)}_{chess.square_name(sq)}" for sq, t in attacked_pieces]
        forks.append(f"fork:{'_and_'.join(names)}")
    return forks


def detect_pins(board: chess.Board, color: chess.Color) -> List[str]:
    pins = []
    king_sq = board.king(color)
    if king_sq is None:
        return pins

    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None or piece.color != color or piece.piece_type == chess.KING:
            continue
        if board.is_pinned(color, sq):
            sq_name = chess.square_name(sq)
            p_name = piece_name(piece)
            pins.append(f"pin:absolute:{p_name}_{sq_name}")
    return pins


def extract_tactical_motifs(board_before: chess.Board, move: chess.Move, board_after: chess.Board) -> List[str]:
    motifs = []
    color = board_before.turn
    enemy_color = not color

    motifs.extend(detect_forks(board_after, move))

    for h in detect_hanging_pieces(board_after, color):
        motifs.append(f"self_{h}")

    for h in detect_hanging_pieces(board_after, enemy_color):
        motifs.append(f"enemy_{h}")

    for pin in detect_pins(board_after, color):
        motifs.append(f"self_{pin}")

    for pin in detect_pins(board_after, enemy_color):
        motifs.append(f"enemy_{pin}")

    return motifs


def build_threat_summary(board_after: chess.Board, reply_move: Optional[chess.Move], cp_loss: float) -> Tuple[Optional[str], Optional[float]]:
    if not reply_move:
        return None, None

    try:
        reply_san = board_after.san(reply_move) if reply_move in board_after.legal_moves else reply_move.uci()
    except Exception:
        reply_san = reply_move.uci()

    captured = captured_piece_name(board_after, reply_move)
    to_sq = chess.square_name(reply_move.to_square)

    board_reply = board_after.copy(stack=False)
    if reply_move in board_after.legal_moves:
        board_reply.push(reply_move)

    if board_reply.is_checkmate():
        return f"Immediate checkmate threat via {reply_san}", -10000.0
    elif captured:
        return f"Opponent threatens {reply_san} capturing your {captured} on {to_sq}", -float(cp_loss)
    elif board_reply.is_check():
        return f"Opponent threatens {reply_san} giving check", -float(cp_loss)
    elif cp_loss >= 100:
        return f"Opponent gains strong tactical initiative with {reply_san}", -float(cp_loss)

    return None, None


def pv_preview(board: chess.Board, pv: Optional[List[chess.Move]], limit: int = 4) -> Tuple[List[str], List[str]]:
    if not pv:
        return [], []
    pv_board = board.copy(stack=False)
    pv_san: List[str] = []
    pv_uci: List[str] = []
    for pv_move in pv[:limit]:
        try:
            pv_san.append(pv_board.san(pv_move))
        except Exception:
            pv_san.append(pv_move.uci())
        pv_uci.append(pv_move.uci())
        if pv_move in pv_board.legal_moves:
            pv_board.push(pv_move)
    return pv_san, pv_uci


def build_summary(moves_data: list, player_color: str) -> dict:
    player_moves = [m for m in moves_data if m.get("color") == player_color]
    counts = {c: 0 for c in ["best", "book", "excellent", "good", "inaccuracy", "mistake", "blunder"]}
    for m in player_moves:
        cls_name = m.get("classification", "good")
        counts[cls_name] = counts.get(cls_name, 0) + 1

    total_player = len(player_moves)
    avg_capped_loss = 0.0
    if total_player > 0:
        weighted_score = sum(
            {"best": 100, "book": 100, "excellent": 90, "good": 75, "inaccuracy": 50, "mistake": 25, "blunder": 0}.get(m.get("classification", "good"), 75)
            for m in player_moves
        )
        accuracy = round(weighted_score / total_player, 1)
        avg_capped_loss = sum(min(m.get("cp_loss", 0.0), MAX_CP_LOSS_FOR_STATS) for m in player_moves) / total_player
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
        "book_moves": counts["book"],
        "accuracy": accuracy,
        "avg_cp_loss": round(avg_capped_loss, 1) if total_player > 0 else None,
        "estimated_elo": estimate_elo(avg_capped_loss, accuracy) if total_player > 0 else None,
    }
