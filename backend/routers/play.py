"""
play.py - Interactive Play and Sparring API Router.
Provides real-time move generation and candidate analysis for playing against AI models.
"""

import asyncio
from typing import Optional, List, Dict, Any
import chess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.engines.factory import EngineFactory

router = APIRouter()


class PlayMoveRequest(BaseModel):
    fen: str
    engine: Optional[str] = "human_model"
    temperature: Optional[float] = 0.2
    top_k: Optional[int] = 3


class CandidateMove(BaseModel):
    move_san: str
    move_uci: str
    probability: float


class PlayMoveResponse(BaseModel):
    fen_before: str
    selected_move_uci: Optional[str] = None
    selected_move_san: Optional[str] = None
    eval: float = 0.0
    win_probability_pct: float = 50.0
    candidates: List[CandidateMove] = Field(default_factory=list)
    fen_after: Optional[str] = None
    is_game_over: bool = False
    game_result: Optional[str] = None


@router.post("/play/move", response_model=PlayMoveResponse)
async def generate_play_move(req: PlayMoveRequest):
    """Generates an AI sparring move for the given FEN board position."""
    if not req.fen or not req.fen.strip():
        raise HTTPException(status_code=400, detail="FEN string is required")

    try:
        board = chess.Board(req.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN string format")

    if board.is_game_over():
        return PlayMoveResponse(
            fen_before=req.fen,
            selected_move_uci=None,
            selected_move_san=None,
            eval=0.0,
            win_probability_pct=50.0,
            candidates=[],
            fen_after=req.fen,
            is_game_over=True,
            game_result=board.result(),
        )

    engine_strategy = EngineFactory.get_engine(req.engine or "human_model")

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            engine_strategy.suggest_sparring_move,
            board,
            req.temperature if req.temperature is not None else 0.2,
            req.top_k or 3,
        )

        fen_after = req.fen
        if result.get("selected_move_uci"):
            board_copy = board.copy()
            move = chess.Move.from_uci(result["selected_move_uci"])
            if move in board_copy.legal_moves:
                board_copy.push(move)
                fen_after = board_copy.fen()

        return PlayMoveResponse(
            fen_before=req.fen,
            selected_move_uci=result.get("selected_move_uci"),
            selected_move_san=result.get("selected_move_san"),
            eval=result.get("eval", 0.0),
            win_probability_pct=result.get("win_probability_pct", 50.0),
            candidates=result.get("candidates", []),
            fen_after=fen_after,
            is_game_over=board.is_game_over(),
            game_result=board.result() if board.is_game_over() else None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI move: {str(e)}")
