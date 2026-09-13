export interface OpeningProgressMap {
  white?: OpeningProgress | null
  black?: OpeningProgress | null
}

export interface OpeningScenario {
  id: string
  name: string
  eco: string
  family: string
  variation: string
  side: string
  pgn: string
  description: string
  key_ideas?: string[]
  drawbacks?: string[]
  difficulty?: string
  move_count: number
}

export interface OpeningEntry {
  eco: string
  name: string
  pgn: string
  uci: string
  epd: string
  family: string
  variation: string
  move_count: number
  side: string
  progress?: OpeningProgressMap
  scenarios_count?: number
  deep_move_count?: number
  scenarios?: OpeningScenario[]
}

export interface OpeningsListResponse {
  items: OpeningEntry[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface OpeningListParams {
  q?: string
  category?: string
  side?: string
  scope?: string
  sort_by?: string
  sort_order?: string
  page?: number
  page_size?: number
}

export interface OpeningCategory {
  name: string
  description: string
  openings: OpeningEntry[]
}

export interface OpeningMove {
  index: number
  san: string
  uci: string
  fen_before: string
  fen_after: string
  side: string
}

export interface MoveExplanation {
  strategic_purpose: string
  key_ideas: string[]
  drawbacks: string[]
  opponent_likely_responses: {
    move: string
    name: string
    idea: string
  }[]
  opponent_countermeasures: string[]
  pawn_structure: string
  common_mistakes: string[]
  typical_plans: string[]
}

export interface WrongMoveExplanation {
  why_wrong: string
  what_opponent_can_do: string
  why_correct: string
  tip: string
}

export interface ExplorerMoveStats {
  uci: string
  san: string
  white: number
  draws: number
  black: number
  averageRating: number
}

export interface ExplorerStats {
  moves: ExplorerMoveStats[]
  white: number
  draws: number
  black: number
  opening?: { eco: string; name: string }
}

export interface OpeningProgress {
  eco: string
  opening_name: string
  train_as: string
  times_practiced: number
  times_correct: number
  total_attempts: number
  last_practiced_at: string | null
  next_review_at: string | null
  interval_days: number
  ease_factor: number
  streak: number
  comfort_level: 'new' | 'learning' | 'familiar' | 'mastered'
}

export interface OpponentMoveData {
  san: string
  uci: string
  fen_after: string
}

export interface HistoryMoveItem {
  san: string
  uci: string
}

export interface TargetMoveItem {
  index: number
  san: string
  uci: string
  side: 'white' | 'black'
}

export interface TrainingState {
  session_id?: string
  fen: string
  move_index: number
  total_moves: number
  is_user_turn: boolean
  opening_name: string
  eco: string
  completed: boolean
  progress_pct: number
  scenario_id?: string | null
  scenario_name?: string | null
  scenario_description?: string | null
  scenario_difficulty?: string | null
  scenario_pgn?: string | null
  target_moves?: TargetMoveItem[]
  is_adaptive?: boolean
  branch_note?: string | null
  available_scenarios?: OpeningScenario[]
  history_moves?: HistoryMoveItem[]
}

export interface TrainingMoveResult {
  correct: boolean
  expected_san: string
  expected_uci: string
  played_san: string
  played_uci: string
  fen_after: string
  opponent_move?: OpponentMoveData | null
  explanation: string | null
  hint: string | null
  stats: ExplorerStats | null
  alternatives: ExplorerMoveStats[] | null
  branch_note?: string | null
}

export interface TrainingSession {
  session_id: string
  state: TrainingState
}

export interface TrainingMoveResponse {
  result: TrainingMoveResult
  state: TrainingState
  move_explanation: MoveExplanation | null
}

export interface HintResponse {
  piece: string
  from_square: string
  target_square: string
  hint_text: string
}

export type ComfortLevel = 'new' | 'learning' | 'familiar' | 'mastered'
