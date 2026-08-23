"""
factory.py - Engine Factory and Strategy Registry for Chess Analysis.
"""

from typing import Dict, List, Any
import logging
from services.engines.base import BaseChessEngine
from services.engines.stockfish_engine import StockfishEngine
from services.engines.neural_engine import HumanNeuralEngine
from services.engines.hybrid_engine import HybridEngine

logger = logging.getLogger(__name__)


class EngineFactory:
    _engines: Dict[str, BaseChessEngine] = {}

    @classmethod
    def initialize(cls):
        """Initializes and registers available engine strategies."""
        if not cls._engines:
            sf = StockfishEngine()
            nn = HumanNeuralEngine()
            hybrid = HybridEngine(stockfish=sf, neural_net=nn)

            cls._engines = {
                "stockfish": sf,
                "human_model": nn,
                "hybrid": hybrid,
            }
            logger.info(f"Initialized Engine Strategies: {list(cls._engines.keys())}")

    @classmethod
    def get_engine(cls, name: str = "stockfish") -> BaseChessEngine:
        cls.initialize()
        engine_id = (name or "stockfish").lower().strip()
        
        # Alias normalization
        aliases = {
            "sf": "stockfish",
            "stockfish": "stockfish",
            "nn": "human_model",
            "human": "human_model",
            "human_model": "human_model",
            "maia": "human_model",
            "hybrid": "hybrid",
            "coach": "hybrid",
        }
        normalized = aliases.get(engine_id, "stockfish")
        engine = cls._engines.get(normalized)

        if not engine:
            logger.warning(f"Requested engine '{name}' not found, falling back to 'stockfish'")
            engine = cls._engines["stockfish"]

        return engine

    @classmethod
    def list_available_engines(cls) -> List[Dict[str, Any]]:
        cls.initialize()
        return [engine.get_metadata() for engine in cls._engines.values()]
