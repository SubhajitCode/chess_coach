export type PlayerColor = 'white' | 'black'

export type MoveClassification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'forced'
  | 'book'

export type FindabilityTier = 'intuitive' | 'calculated' | 'computer'

export interface BookCandidate {
  san: string
  uci: string
  weight: number
  percentage?: number
}

export interface ChessMove {
  move_number: number
  color: PlayerColor
  move_san: string
  move_uci: string
  fen_before?: string
  fen_after?: string
  eval_before?: number | null
  eval_after?: number | null
  cp_loss?: number
  classification?: MoveClassification
  best_move_uci?: string
  best_move_san?: string
  best_move_summary?: string
  best_line_uci?: string[]
  best_line_san?: string[]
  deviation_best_line_uci?: string[]
  deviation_best_line_san?: string[]
  reply_line_uci?: string[]
  reply_line_san?: string[]
  practical_best_move_san?: string
  practical_best_move_uci?: string
  threat_summary?: string
  findability_tier?: FindabilityTier
  findability_score?: number
  move_summary?: string
  motifs?: string[]
  san?: string
  is_book?: boolean
  book_weight?: number
  book_candidates?: BookCandidate[]
}

export interface ParsedMove {
  move_number: number
  color: PlayerColor
  move_san: string
  move_uci: string
  san?: string
}

export interface GameHeaders {
  Event?: string
  Site?: string
  Date?: string
  Round?: string
  White?: string
  Black?: string
  Result?: string
  ECO?: string
  Opening?: string
  ECOUrl?: string
  TimeControl?: string
  WhiteElo?: string
  BlackElo?: string
  [key: string]: string | undefined
}

export interface GameItem {
  white: string
  black: string
  white_rating?: number | string
  black_rating?: number | string
  result?: string
  time_control?: string
  opening?: string
  end_time?: number | string
  source?: string
  pgn: string
  pgn_hash?: string
}

export interface SideStats {
  total: number
  accuracy: number | null
  avgCpLoss: number | null
  estimated_elo: number | null
  blunders: number
  mistakes: number
  inaccuracies: number
  good_moves: number
  excellent_moves: number
  best_moves: number
  book_moves?: number
}

export interface GameSummary extends Partial<SideStats> {
  player_color?: PlayerColor
  white_accuracy?: number
  black_accuracy?: number
  white_estimated_elo?: number
  black_estimated_elo?: number
}

export interface CandidateMove {
  move_san: string
  move_uci?: string
  probability: number
}

export interface AiMoveResponse {
  selected_move_uci: string
  selected_move_san?: string
  candidates: CandidateMove[]
  eval: number
  win_probability_pct: number
}

export interface EngineOption {
  id: string
  name: string
  type?: string
  description?: string
}

export interface LineStep {
  uci: string
  san: string
  from: string
  to: string
  color: PlayerColor
  pieceIcon: string
  pieceName: string
  isCapture: boolean
  isCheck: boolean
  isCheckmate: boolean
  isCastle: boolean
  castleSide?: 'kingside' | 'queenside'
  captureTargetName?: string
  captureTargetIcon?: string
  description: string
  fenBefore?: string
  fenAfter: string
  evalBefore?: number | null
  evalAfter?: number | null
}

export interface ArrowItem {
  startSquare: string
  endSquare: string
  color: string
}
