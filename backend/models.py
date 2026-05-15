from pydantic import BaseModel
from typing import Optional


class GameRequest(BaseModel):
    source: str  # "chesscom" or "lichess"
    username: str
    year: Optional[int] = None
    month: Optional[int] = None
    max_games: Optional[int] = 20


class AnalyzeRequest(BaseModel):
    pgn: str
    depth: Optional[int] = 18
    player_color: Optional[str] = None  # "white" or "black" — auto-detected if None


class CoachRequest(BaseModel):
    analysis: dict
    player_color: str
    username: Optional[str] = None


class PerMoveCoachRequest(BaseModel):
    pgn_hash: str
    analysis: dict
    player_color: str
    username: Optional[str] = None


class MoveAnalysis(BaseModel):
    move_number: int
    color: str
    move_san: str
    move_uci: str
    eval_before: Optional[float]
    eval_after: Optional[float]
    best_move_uci: Optional[str]
    best_move_san: Optional[str]
    cp_loss: Optional[float]
    classification: str


class GameSummary(BaseModel):
    total_moves: int
    player_moves: int
    blunders: int
    mistakes: int
    inaccuracies: int
    good_moves: int
    excellent_moves: int
    best_moves: int
    accuracy: float
    avg_cp_loss: Optional[float] = None
    estimated_elo: Optional[int] = None


class AnalysisResult(BaseModel):
    pgn: str
    white: str
    black: str
    result: str
    opening: Optional[str]
    time_control: Optional[str]
    player_color: str
    moves: list[MoveAnalysis]
    summary: GameSummary
