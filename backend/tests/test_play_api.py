"""
test_play_api.py - Unit tests for Play / Sparring move generation endpoint and logic.
"""

import pytest
from fastapi.testclient import TestClient
from main import app
import chess

client = TestClient(app)

START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


def test_play_move_human_model():
    response = client.post("/api/play/move", json={
        "fen": AFTER_E4_FEN,
        "engine": "human_model",
        "temperature": 0.2,
        "top_k": 3,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["selected_move_uci"] is not None
    assert data["selected_move_san"] is not None
    assert len(data["candidates"]) > 0
    assert "win_probability_pct" in data
    assert data["is_game_over"] is False
    assert data["fen_after"] != AFTER_E4_FEN

    # Verify move is strictly legal from the given FEN
    board = chess.Board(AFTER_E4_FEN)
    m = chess.Move.from_uci(data["selected_move_uci"])
    assert m in board.legal_moves


def test_play_move_stockfish():
    response = client.post("/api/play/move", json={
        "fen": AFTER_E4_FEN,
        "engine": "stockfish",
        "temperature": 0.0,
        "top_k": 3,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["selected_move_uci"] is not None
    assert data["selected_move_san"] is not None
    assert data["is_game_over"] is False


def test_play_move_checkmate_position():
    # Scholar's mate final position
    mate_fen = "r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"
    response = client.post("/api/play/move", json={
        "fen": mate_fen,
        "engine": "human_model",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["is_game_over"] is True
    assert data["selected_move_uci"] is None
