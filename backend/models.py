from pydantic import BaseModel, Field
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
    fen_before: Optional[str] = None
    fen_after: Optional[str] = None
    best_line_san: list[str] = Field(default_factory=list)
    best_line_uci: list[str] = Field(default_factory=list)
    reply_move_uci: Optional[str] = None
    reply_move_san: Optional[str] = None
    reply_line_san: list[str] = Field(default_factory=list)
    reply_line_uci: list[str] = Field(default_factory=list)
    move_piece: Optional[str] = None
    move_from: Optional[str] = None
    move_to: Optional[str] = None
    move_captured_piece: Optional[str] = None
    move_is_capture: bool = False
    move_is_check: bool = False
    move_is_checkmate: bool = False
    move_summary: Optional[str] = None
    best_move_piece: Optional[str] = None
    best_move_from: Optional[str] = None
    best_move_to: Optional[str] = None
    best_move_captured_piece: Optional[str] = None
    best_move_is_capture: bool = False
    best_move_is_check: bool = False
    best_move_is_checkmate: bool = False
    best_move_summary: Optional[str] = None
    reply_move_piece: Optional[str] = None
    reply_move_from: Optional[str] = None
    reply_move_to: Optional[str] = None
    reply_move_captured_piece: Optional[str] = None
    reply_move_is_capture: bool = False
    reply_move_is_check: bool = False
    reply_move_is_checkmate: bool = False
    reply_move_summary: Optional[str] = None
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


class PositionAnalyzeRequest(BaseModel):
    fen: str
    move_uci: Optional[str] = None   # the deviation move to evaluate
    depth: Optional[int] = 12
    pv_length: Optional[int] = 5


class DeviationCoachRequest(BaseModel):
    fen_before: str
    move_uci: str
    move_san: Optional[str] = None
    move_summary: Optional[str] = None
    player_color: str
    eval_before: Optional[float] = None
    eval_after: Optional[float] = None
    cp_loss: Optional[float] = None
    classification: Optional[str] = None
    best_move_san: Optional[str] = None   # engine's best at the starting position
    best_line_san: list[str] = Field(default_factory=list)   # PV from starting position
    deviation_best_line_san: list[str] = Field(default_factory=list)  # PV from deviation pos
    game_move_number: Optional[int] = None
    username: Optional[str] = None


class PlayerProfileRequest(BaseModel):
    username: Optional[str] = None
    platform: str = "chesscom"
    main_time_control: Optional[str] = None
    improvement_goal: Optional[str] = None
    focus_area: Optional[str] = None
