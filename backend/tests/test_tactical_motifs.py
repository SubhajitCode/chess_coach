import chess
import pytest
from services.stockfish_service import (
    _detect_hanging_pieces,
    _detect_pins,
    _detect_forks,
    _detect_skewers,
    _detect_back_rank_weakness,
    extract_tactical_motifs,
    _build_threat_summary,
)


def test_detect_hanging_piece_undefended():
    # White bishop on e4 is attacked by Black pawn on d5, undefended
    board = chess.Board("rnbqkbnr/ppp1pppp/8/3p4/4B3/8/PPPPPPPP/RNBQK1NR w KQkq - 0 1")
    hanging_white = _detect_hanging_pieces(board, chess.WHITE)
    assert any("hanging:bishop_e4" in h or "underdefended:bishop_e4" in h for h in hanging_white)


def test_detect_hanging_piece_underdefended():
    # White queen on d4 is defended by pawn on c3, but attacked by black pawn on e5
    board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/3Q4/2P5/PP1PPPPP/RNB1KBNR w KQkq - 0 1")
    hanging_white = _detect_hanging_pieces(board, chess.WHITE)
    assert any("underdefended:queen_d4" in h for h in hanging_white)


def test_detect_absolute_pin():
    # Black knight on e7 is pinned to Black King on e8 by White Rook on e1
    board = chess.Board("rnb1kbnr/ppppnppp/8/8/8/8/PPPP1PPP/RNB1K2R w KQkq - 0 1")
    # White moves Rook to e1
    board.set_piece_at(chess.E1, chess.Piece(chess.ROOK, chess.WHITE))
    board.set_piece_at(chess.E8, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(chess.E7, chess.Piece(chess.KNIGHT, chess.BLACK))
    pins = _detect_pins(board, chess.BLACK)
    assert any("pin:absolute:knight_e7" in p for p in pins)


def test_detect_relative_pin_to_queen():
    # White Bishop on g5 pins Black Knight on f6 to Black Queen on d8
    board = chess.Board("r1bqk2r/pppp1ppp/2n2n2/2b1p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R b KQkq - 0 1")
    pins = _detect_pins(board, chess.BLACK)
    assert any("pin:relative:knight_f6_to_queen" in p for p in pins)


def test_detect_knight_fork():
    # White Knight moves to c7, attacking Black King on e8 and Black Rook on a8
    board_before = chess.Board("r3k2r/pppb1ppp/2n1pn2/8/8/2N2N2/PPP1BPPP/R2QK2R w KQkq - 0 1")
    board_after = board_before.copy()
    move = chess.Move.from_uci("e4c7")  # Let's set knight on e4 and move to c7
    board_after.set_piece_at(chess.C7, chess.Piece(chess.KNIGHT, chess.WHITE))
    forks = _detect_forks(board_after, chess.Move.from_uci("e4c7"))
    assert any("fork:knight_c7" in f for f in forks)


def test_detect_skewer():
    # White Rook on e1 attacks Black King on e7, and behind it on e8 is Black Queen
    board = chess.Board("4q3/4k3/8/8/8/8/8/4R1K1 w - - 0 1")
    move = chess.Move.from_uci("a1e1")  # Rook moves to e1
    skewers = _detect_skewers(board, move)
    assert any("skewer:rook_e1" in s for s in skewers)


def test_detect_back_rank_weakness():
    # Black king on g8 with pawns on f7, g7, h7 (no luft) and White has a rook on d1
    board = chess.Board("3r2k1/ppp2ppp/8/8/8/8/PPP2PPP/3R2K1 b - - 0 1")
    weakness = _detect_back_rank_weakness(board, chess.BLACK)
    assert any("back_rank_weakness:black" in w for w in weakness)

    # If Black has luft (e.g. h6 played), no weakness
    board_luft = chess.Board("3r2k1/ppp2pp1/7p/8/8/8/PPP2PPP/3R2K1 b - - 0 1")
    weakness_luft = _detect_back_rank_weakness(board_luft, chess.BLACK)
    assert weakness_luft == []


def test_extract_tactical_motifs_combined():
    board_before = chess.Board("r1bqk2r/pppp1ppp/2n2n2/2b1p1B1/2B1P3/3P1N2/PPP2PPP/RN1QK2R w KQkq - 0 1")
    move = chess.Move.from_uci("g5f6")
    board_after = board_before.copy()
    board_after.push(move)
    motifs = extract_tactical_motifs(board_before, move, board_after)
    assert isinstance(motifs, list)


def test_build_threat_summary_checkmate():
    # Fool's mate setup: 1. f3 e5 2. g4 (White played g4), Black threatens 2... Qh4#
    board_after_white_g4 = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2")
    threat_mate, eval_mate = _build_threat_summary(board_after_white_g4, chess.Move.from_uci("d8h4"), 1000)
    assert threat_mate is not None
    assert "Immediate checkmate threat" in threat_mate
