import os
import pytest
import chess
from unittest.mock import patch

from services.opening_book import (
    ensure_opening_book_downloaded,
    is_book_move,
    get_book_move_details,
    DEFAULT_BOOK_PATH,
)


def test_ensure_opening_book_downloaded():
    """Verify that the opening book downloads and exists on disk."""
    path = ensure_opening_book_downloaded()
    assert path is not None
    assert os.path.exists(path)
    assert os.path.getsize(path) > 100000  # gm2001.bin is ~486 KB


def test_is_book_move_startpos():
    """Verify standard first moves are recognized as book moves."""
    board = chess.Board()

    # Common GM opening moves from start position
    assert is_book_move(board, chess.Move.from_uci("e2e4"), cp_loss=0.0) is True
    assert is_book_move(board, chess.Move.from_uci("d2d4"), cp_loss=0.0) is True
    assert is_book_move(board, chess.Move.from_uci("g1f3"), cp_loss=0.0) is True
    assert is_book_move(board, chess.Move.from_uci("c2c4"), cp_loss=0.0) is True

    # Blunder guard: moves with cp_loss > 25.0 should never be classified as book
    assert is_book_move(board, chess.Move.from_uci("e2e4"), cp_loss=30.0) is False

    # Out-of-book or rare moves
    assert is_book_move(board, chess.Move.from_uci("h2h4"), cp_loss=0.0) is False


def test_get_book_move_details_startpos():
    """Verify rich candidate moves and game counts for start position."""
    board = chess.Board()
    e4_move = chess.Move.from_uci("e2e4")

    details = get_book_move_details(board, e4_move, cp_loss=0.0)
    assert details["is_book"] is True
    assert isinstance(details["book_weight"], int)
    assert details["book_weight"] > 1000

    candidates = details["book_candidates"]
    assert len(candidates) >= 3

    sans = [c["san"] for c in candidates]
    assert "e4" in sans
    assert "d4" in sans

    # Verify candidate schema
    for cand in candidates:
        assert "san" in cand
        assert "uci" in cand
        assert "weight" in cand
        assert "percentage" in cand
        assert cand["weight"] > 0
        assert 0.0 <= cand["percentage"] <= 100.0


def test_black_response_in_opening_book():
    """Verify responses to 1. e4."""
    board = chess.Board()
    board.push_san("e4")

    c5_move = chess.Move.from_uci("c7c5")  # Sicilian
    details = get_book_move_details(board, c5_move, cp_loss=0.0)
    assert details["is_book"] is True
    assert details["book_weight"] is not None and details["book_weight"] > 1000

    sans = [c["san"] for c in details["book_candidates"]]
    assert "c5" in sans
    assert "e5" in sans


def test_fallback_book_transitions():
    """Verify fallback to embedded transitions when Polyglot reader is unavailable."""
    board = chess.Board()
    e4_move = chess.Move.from_uci("e2e4")

    with patch("services.opening_book._get_reader", return_value=None):
        assert is_book_move(board, e4_move, cp_loss=0.0) is True

        # Details should still return is_book=True even if reader is None
        details = get_book_move_details(board, e4_move, cp_loss=0.0)
        assert details["is_book"] is True
        assert details["book_weight"] is None
        assert details["book_candidates"] == []
