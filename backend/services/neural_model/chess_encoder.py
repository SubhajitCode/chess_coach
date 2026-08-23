"""
chess_encoder.py - Board & Move Encoder for PyTorch Chess Models.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import chess


def _generate_canonical_moves() -> Tuple[List[str], Dict[str, int], Dict[int, str]]:
    moves = set()
    for from_sq in chess.SQUARES:
        f_rank, f_file = chess.square_rank(from_sq), chess.square_file(from_sq)
        for dr, df in [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]:
            for step in range(1, 8):
                tr, tf = f_rank + dr * step, f_file + df * step
                if 0 <= tr < 8 and 0 <= tf < 8:
                    to_sq = chess.square(tf, tr)
                    moves.add(chess.Move(from_sq, to_sq).uci())
                    if f_rank == 6 and tr == 7 and abs(df) <= 1 and step == 1:
                        for promo in [chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN]:
                            moves.add(chess.Move(from_sq, to_sq, promotion=promo).uci())
        for dr, df in [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]:
            tr, tf = f_rank + dr, f_file + df
            if 0 <= tr < 8 and 0 <= tf < 8:
                to_sq = chess.square(tf, tr)
                moves.add(chess.Move(from_sq, to_sq).uci())
    sorted_moves = sorted(list(moves))
    move_to_idx = {m: i for i, m in enumerate(sorted_moves)}
    idx_to_move = {i: m for i, m in enumerate(sorted_moves)}
    return sorted_moves, move_to_idx, idx_to_move


CANONICAL_MOVES, MOVE_TO_INDEX, INDEX_TO_MOVE = _generate_canonical_moves()
NUM_ACTIONS = len(CANONICAL_MOVES)


def flip_move(move: chess.Move) -> chess.Move:
    return chess.Move(
        from_square=chess.square_mirror(move.from_square),
        to_square=chess.square_mirror(move.to_square),
        promotion=move.promotion
    )


def encode_move(move: chess.Move, turn: chess.Color) -> int:
    canonical_move = move if turn == chess.WHITE else flip_move(move)
    return MOVE_TO_INDEX[canonical_move.uci()]


def decode_move_index(idx: int, turn: chess.Color) -> chess.Move:
    canonical_move = chess.Move.from_uci(INDEX_TO_MOVE[idx])
    return canonical_move if turn == chess.WHITE else flip_move(canonical_move)


PIECE_TYPES = [chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN, chess.KING]


def encode_board(board: chess.Board) -> np.ndarray:
    active_board = board if board.turn == chess.WHITE else board.mirror()
    tensor = np.zeros((18, 8, 8), dtype=np.float32)
    for plane_idx, piece_type in enumerate(PIECE_TYPES):
        mask = active_board.pieces_mask(piece_type, chess.WHITE)
        for sq in chess.scan_forward(mask):
            tensor[plane_idx, chess.square_rank(sq), chess.square_file(sq)] = 1.0
    for plane_idx, piece_type in enumerate(PIECE_TYPES):
        mask = active_board.pieces_mask(piece_type, chess.BLACK)
        for sq in chess.scan_forward(mask):
            tensor[6 + plane_idx, chess.square_rank(sq), chess.square_file(sq)] = 1.0
    if active_board.has_kingside_castling_rights(chess.WHITE):
        tensor[12, :, :] = 1.0
    if active_board.has_queenside_castling_rights(chess.WHITE):
        tensor[13, :, :] = 1.0
    if active_board.has_kingside_castling_rights(chess.BLACK):
        tensor[14, :, :] = 1.0
    if active_board.has_queenside_castling_rights(chess.BLACK):
        tensor[15, :, :] = 1.0
    if active_board.ep_square is not None:
        tensor[16, chess.square_rank(active_board.ep_square), chess.square_file(active_board.ep_square)] = 1.0
    tensor[17, :, :] = min(active_board.halfmove_clock, 100) / 100.0
    return tensor


def get_legal_move_mask(board: chess.Board) -> np.ndarray:
    mask = np.zeros(NUM_ACTIONS, dtype=np.float32)
    turn = board.turn
    for move in board.legal_moves:
        canonical_move = move if turn == chess.WHITE else flip_move(move)
        uci_str = canonical_move.uci()
        if uci_str in MOVE_TO_INDEX:
            mask[MOVE_TO_INDEX[uci_str]] = 1.0
    return mask
