"""
base.py - Abstract Base Class for Chess Analysis Engines.
"""

from abc import ABC, abstractmethod
from typing import Generator, Optional, Dict, Any


class BaseChessEngine(ABC):
    """
    Abstract strategy interface for all chess engines and models.
    Ensures 100% schema parity across Stockfish, Neural Networks, and Hybrid engines.
    """

    @abstractmethod
    def analyze_pgn_stream(
        self,
        pgn_text: str,
        depth: int = 18,
        player_color: str = "white"
    ) -> Generator[str, None, None]:
        """
        Yields SSE-formatted event chunks:
          - data: {"type": "meta", ...}
          - data: {"type": "move", ...}
          - data: {"type": "summary", ...}
          - data: [DONE]
        """
        pass

    @abstractmethod
    def analyze_position(
        self,
        fen: str,
        move_uci: Optional[str] = None,
        depth: int = 12,
        pv_length: int = 5
    ) -> Dict[str, Any]:
        """
        Analyzes a single FEN position, optionally evaluating a specific deviation move.
        """
        pass

    @abstractmethod
    def suggest_sparring_move(
        self,
        board: Any,
        temperature: float = 0.2,
        top_k: int = 3
    ) -> Dict[str, Any]:
        """
        Suggests an active move for live sparring, supporting temperature-based sampling.
        Returns: {
            "selected_move_uci": str,
            "selected_move_san": str,
            "eval": float,
            "win_probability_pct": float,
            "candidates": list[dict],
        }
        """
        pass

    @abstractmethod
    def get_metadata(self) -> Dict[str, Any]:
        """
        Returns metadata about the engine (id, display name, description, capabilities, active device).
        """
        pass
