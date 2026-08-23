"""
chess_encoder.py - Canonical Board and Move Encodings for Human Chess Policy & Value Model.

This module converts python-chess Board objects into PyTorch-ready tensor representations
(18 x 8 x 8) and maps UCI chess moves to unique categorical indices (0..1879) from the
canonical perspective of the active player.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import chess


# ---------------------------------------------------------------------------
# 1. Canonical Move Vocabulary Generation
# ---------------------------------------------------------------------------

def _generate_canonical_moves() -> Tuple[List[str], Dict[str, int], Dict[int, str]]:
    """
    Generates the complete set of all geometrically valid chess moves (1,880 unique moves)
    from the canonical perspective of White to move.
    
    Includes:
    - Ray moves for Queen, Rook, Bishop (1 to 7 steps in 8 directions)
    - Knight moves (8 L-shaped jumps)
    - Pawn promotions (Queen, Knight, Rook, Bishop) from rank 7 (6) to rank 8 (7)
    """
    moves = set()
    for from_sq in chess.SQUARES:
        f_rank, f_file = chess.square_rank(from_sq), chess.square_file(from_sq)
        
        # 1. Ray moves (Queen, Rook, Bishop)
        for dr, df in [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]:
            for step in range(1, 8):
                tr, tf = f_rank + dr * step, f_file + df * step
                if 0 <= tr < 8 and 0 <= tf < 8:
                    to_sq = chess.square(tf, tr)
                    moves.add(chess.Move(from_sq, to_sq).uci())
                    
                    # Pawn promotions from 7th rank to 8th rank
                    if f_rank == 6 and tr == 7 and abs(df) <= 1 and step == 1:
                        for promo in [chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN]:
                            moves.add(chess.Move(from_sq, to_sq, promotion=promo).uci())
                            
        # 2. Knight leaps
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
NUM_ACTIONS = len(CANONICAL_MOVES)  # 1880


# ---------------------------------------------------------------------------
# 2. Board & Move Transformation Helpers
# ---------------------------------------------------------------------------

def flip_move(move: chess.Move) -> chess.Move:
    """
    Vertically mirrors a chess move (e.g., e7e5 <-> e2e4).
    Used when encoding or decoding moves from Black's perspective.
    """
    return chess.Move(
        from_square=chess.square_mirror(move.from_square),
        to_square=chess.square_mirror(move.to_square),
        promotion=move.promotion
    )


def encode_move(move: chess.Move, turn: chess.Color) -> int:
    """
    Encodes a python-chess Move into a categorical integer index [0..1879].
    If it is Black's turn, the move is flipped to canonical White-relative perspective.
    """
    canonical_move = move if turn == chess.WHITE else flip_move(move)
    uci_str = canonical_move.uci()
    return MOVE_TO_INDEX[uci_str]


def decode_move_index(idx: int, turn: chess.Color) -> chess.Move:
    """
    Decodes a categorical integer index [0..1879] back into a python-chess Move
    for the current player's actual turn.
    """
    uci_str = INDEX_TO_MOVE[idx]
    canonical_move = chess.Move.from_uci(uci_str)
    return canonical_move if turn == chess.WHITE else flip_move(canonical_move)


# ---------------------------------------------------------------------------
# 3. Board to Tensor Encoder (18 x 8 x 8)
# ---------------------------------------------------------------------------

# Piece type ordering: Pawn, Knight, Bishop, Rook, Queen, King
PIECE_TYPES = [
    chess.PAWN,
    chess.KNIGHT,
    chess.BISHOP,
    chess.ROOK,
    chess.QUEEN,
    chess.KING,
]


def encode_board(board: chess.Board) -> np.ndarray:
    """
    Converts a python-chess Board into an 18 x 8 x 8 float32 NumPy tensor
    from the canonical perspective of the active player.
    
    Channels:
      Planes 0-5  : Active player's pieces (P, N, B, R, Q, K)
      Planes 6-11 : Opponent's pieces (p, n, b, r, q, k)
      Planes 12-15: Castling rights (Active O-O, Active O-O-O, Opp O-O, Opp O-O-O)
      Plane 16    : En-passant target square
      Plane 17    : Normalized 50-move rule clock (min(halfmove_clock, 100) / 100.0)
    
    Returns:
      np.ndarray of shape (18, 8, 8), dtype=float32
    """
    # Create canonical view (if Black to move, mirror board so White is always active)
    active_board = board if board.turn == chess.WHITE else board.mirror()
    
    tensor = np.zeros((18, 8, 8), dtype=np.float32)
    
    # Planes 0-5: Active player pieces (White on active_board)
    for plane_idx, piece_type in enumerate(PIECE_TYPES):
        mask = active_board.pieces_mask(piece_type, chess.WHITE)
        for sq in chess.scan_forward(mask):
            rank, file = chess.square_rank(sq), chess.square_file(sq)
            tensor[plane_idx, rank, file] = 1.0
            
    # Planes 6-11: Opponent pieces (Black on active_board)
    for plane_idx, piece_type in enumerate(PIECE_TYPES):
        mask = active_board.pieces_mask(piece_type, chess.BLACK)
        for sq in chess.scan_forward(mask):
            rank, file = chess.square_rank(sq), chess.square_file(sq)
            tensor[6 + plane_idx, rank, file] = 1.0
            
    # Planes 12-15: Castling rights
    if active_board.has_kingside_castling_rights(chess.WHITE):
        tensor[12, :, :] = 1.0
    if active_board.has_queenside_castling_rights(chess.WHITE):
        tensor[13, :, :] = 1.0
    if active_board.has_kingside_castling_rights(chess.BLACK):
        tensor[14, :, :] = 1.0
    if active_board.has_queenside_castling_rights(chess.BLACK):
        tensor[15, :, :] = 1.0
        
    # Plane 16: En-passant square
    if active_board.ep_square is not None:
        ep_rank = chess.square_rank(active_board.ep_square)
        ep_file = chess.square_file(active_board.ep_square)
        tensor[16, ep_rank, ep_file] = 1.0
        
    # Plane 17: Normalized halfmove clock (50-move rule counter)
    tensor[17, :, :] = min(active_board.halfmove_clock, 100) / 100.0
    
    return tensor


def get_legal_move_mask(board: chess.Board) -> np.ndarray:
    """
    Returns a binary 1D NumPy array (shape: (1880,)) where 1.0 indicates
    a legal move in the current position, and 0.0 indicates an illegal move.
    """
    mask = np.zeros(NUM_ACTIONS, dtype=np.float32)
    turn = board.turn
    for move in board.legal_moves:
        canonical_move = move if turn == chess.WHITE else flip_move(move)
        uci_str = canonical_move.uci()
        if uci_str in MOVE_TO_INDEX:
            mask[MOVE_TO_INDEX[uci_str]] = 1.0
    return mask
