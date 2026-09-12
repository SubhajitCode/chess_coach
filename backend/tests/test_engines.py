"""
test_engines.py - Unit tests for Chess Analysis Engine Strategies & Factory.
"""

import json
import pytest
import chess
import chess.engine
from services.engines.factory import EngineFactory
from services.engines.stockfish_engine import StockfishEngine, score_to_cp
from services.engines.neural_engine import HumanNeuralEngine
from services.engines.hybrid_engine import HybridEngine

SAMPLE_PGN = """[Event "Test Game"]
[Site "Localhost"]
[Date "2024.01.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 1-0"""

SAMPLE_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


def test_engine_factory_registration():
    engines = EngineFactory.list_available_engines()
    assert len(engines) >= 3
    engine_ids = [e["id"] for e in engines]
    assert "stockfish" in engine_ids
    assert "human_model" in engine_ids
    assert "hybrid" in engine_ids


def test_engine_factory_get():
    sf = EngineFactory.get_engine("stockfish")
    assert isinstance(sf, StockfishEngine)

    nn = EngineFactory.get_engine("human_model")
    assert isinstance(nn, HumanNeuralEngine)

    hy = EngineFactory.get_engine("hybrid")
    assert isinstance(hy, HybridEngine)

    # Fallback for unknown engine
    fallback = EngineFactory.get_engine("non_existent_engine")
    assert isinstance(fallback, StockfishEngine)


def test_neural_engine_position_analysis():
    nn = EngineFactory.get_engine("human_model")
    result = nn.analyze_position(SAMPLE_FEN, move_uci="e7e5", depth=6, pv_length=3)
    assert result.get("fen") == SAMPLE_FEN
    assert "eval" in result
    assert "human_candidates" in result
    assert len(result["human_candidates"]) > 0
    assert "classification" in result
    assert "human_move_prob" in result


def test_hybrid_engine_streaming():
    hy = EngineFactory.get_engine("hybrid")
    chunks = list(hy.analyze_pgn_stream(SAMPLE_PGN, depth=8, player_color="white"))
    assert len(chunks) > 0
    assert any("type\": \"meta\"" in c for c in chunks)
    assert any("type\": \"move\"" in c for c in chunks)
    assert any("type\": \"summary\"" in c for c in chunks)
    assert any("[DONE]" in c for c in chunks)


def test_neural_engine_streaming():
    nn = EngineFactory.get_engine("human_model")
    chunks = list(nn.analyze_pgn_stream(SAMPLE_PGN, depth=8, player_color="white"))
    assert len(chunks) > 0
    assert any("type\": \"meta\"" in c for c in chunks)
    assert any("type\": \"move\"" in c for c in chunks)
    assert any("type\": \"summary\"" in c for c in chunks)
    assert any("[DONE]" in c for c in chunks)


def test_score_to_cp_checkmate():
    """Verify MateGiven (+0) returns +10000.0, and Mate(0) returns -10000.0."""
    s_mate_given = chess.engine.PovScore(chess.engine.MateGiven, chess.WHITE)
    s_mate_0 = chess.engine.PovScore(chess.engine.Mate(0), chess.WHITE)
    s_mate_1 = chess.engine.PovScore(chess.engine.Mate(1), chess.WHITE)
    s_mate_neg1 = chess.engine.PovScore(chess.engine.Mate(-1), chess.WHITE)

    assert score_to_cp(s_mate_given, chess.WHITE) == 10000.0
    assert score_to_cp(s_mate_0, chess.WHITE) == -10000.0
    assert score_to_cp(s_mate_1, chess.WHITE) == 10000.0
    assert score_to_cp(s_mate_neg1, chess.WHITE) == -10000.0


def test_checkmate_move_classification():
    """Verify that delivering checkmate is never flagged as blunder, but as best with 0 cp loss."""
    sf = EngineFactory.get_engine("stockfish")
    # Position where White plays Re8# checkmate:
    fen_before = "rnb2k1r/1p3ppp/p1Bb4/8/q7/P4N2/2PP1PPP/R1BQR1K1 w - - 0 15"
    result = sf.analyze_position(fen_before, move_uci="e1e8", depth=12)
    assert result["classification"] == "best"
    assert result["cp_loss"] == 0.0
    assert result["eval_after"] == 10000.0

    # Stream checkmate game (Scholar's mate)
    pgn = """[Event "Scholar Mate"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0"""
    chunks = list(sf.analyze_pgn_stream(pgn, depth=8, player_color="white"))
    last_move = None
    for c in chunks:
        if c.startswith("data: ") and not c.strip().endswith("[DONE]"):
            d = json.loads(c[6:].strip())
            if d.get("type") == "move":
                last_move = d
    assert last_move is not None
    assert last_move["move_san"] == "Qxf7#"
    assert last_move["classification"] == "best"
    assert last_move["cp_loss"] == 0.0
    assert last_move["eval_after"] == 10000.0

