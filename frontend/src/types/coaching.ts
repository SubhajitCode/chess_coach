import type { ChessMove, MoveClassification, PlayerColor } from './chess'

export type PlatformId = 'chesscom' | 'lichess'

export interface CoachProfile {
  username: string
  platform: PlatformId
  main_time_control: string
  improvement_goal: string
  focus_area: string
  updated_at?: number | string | null
}

export interface CoachPlan {
  id: string
  title: string
  summary: string
  checklist: string[]
  bandLabel?: string
  theme?: string
  description?: string
  drills?: string[]
}

export interface MotifBadge {
  label: string
  icon: string
  color: string
}

export interface WhyBadSummary {
  headline: string | null
  detail: string | null
  alternative: string | null
  replyLine: string | null
  recommendedLine?: string | null
}

export interface DeviationPayload {
  fen_before: string
  move_uci: string
  move_san: string
  move_summary?: string | null
  player_color: PlayerColor
  eval_before?: number | null
  eval_after?: number | null
  cp_loss?: number | null
  classification?: MoveClassification
  best_move_san?: string | null
  best_line_san?: string[]
  deviation_best_line_san?: string[]
  game_move_number?: number
  username?: string | null
}

export interface AskCoachPayload {
  fen: string
  question: string
  candidate_san?: string
  player_color?: PlayerColor
  move_number?: number
}

export interface AskCoachResponse {
  answer: string
}

export interface GameOverviewResponse {
  overview?: string
  key_moments?: string[]
}

export interface FullAnalysisPayload {
  white: string
  black: string
  result?: string
  opening?: string | null
  time_control?: string | null
  moves: ChessMove[]
  summary?: any
}
