"""
test_engines.py - Unit tests for Chess Analysis Engine Strategies & Factory.
"""

import pytest
from services.engines.factory import EngineFactory
from services.engines.stockfish_engine import StockfishEngine
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
