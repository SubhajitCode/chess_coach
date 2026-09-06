import type {
  ChessMove,
  GameSummary,
  PlayerColor,
  EngineOption,
} from './chess'
import type { CoachProfile } from './coaching'

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
  clear?(): void | Promise<void>
}

export interface AnalyzeStreamMeta {
  total_moves?: number
  white?: string
  black?: string
  result?: string
  opening?: string
  [key: string]: any
}

export interface AnalyzeGameStreamOptions {
  pgn: string
  depth?: number
  playerColor?: PlayerColor
  engine?: string
  onMeta?: (meta: AnalyzeStreamMeta) => void
  onMove?: (move: ChessMove) => void
  onSummary?: (summary: GameSummary) => void
  onDone?: () => void
  onError?: (errorMessage: string) => void
}

export interface AnalyzePositionResponse {
  data: {
    move_san?: string
    move_summary?: string
    color?: PlayerColor
    eval_before?: number
    eval_after?: number
    cp_loss?: number
    classification?: any
    best_move_uci?: string
    best_move_san?: string
    best_line_san?: string[]
    best_line_uci?: string[]
    deviation_best_line_san?: string[]
    deviation_best_line_uci?: string[]
    fen_after?: string
  }
}

export interface PerMoveCoachingItem {
  move_index: number
  feedback: string
}

export interface PerMoveCoachingResponse {
  coaching: PerMoveCoachingItem[]
  profile_used?: CoachProfile | null
}

export interface CachedAnalysisResponse {
  moves: ChessMove[]
  summary: GameSummary
}

export interface FetchEnginesResponse {
  engines: EngineOption[]
}
