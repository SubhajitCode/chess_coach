import type { ChessMove, PlayerColor } from '../../types/chess'
import type { WhyBadSummary } from '../../types/coaching'
import { evalLabel } from '../chess/moveClassifier'

export function buildPositionSwingSummary(
  before?: number | null,
  after?: number | null,
  playerColor?: PlayerColor
): string | null {
  if (before === null || before === undefined || after === null || after === undefined) {
    return null
  }
  const beforeL = evalLabel(before, playerColor)
  const afterL = evalLabel(after, playerColor)
  return `Position changed from ${beforeL.text} to ${afterL.text}.`
}

export function isSuboptimalMove(move?: Partial<ChessMove> | null): boolean {
  if (!move) return false
  const cls = move.classification
  if (cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy') {
    return true
  }
  if (
    cls === 'best' ||
    cls === 'book' ||
    cls === 'excellent' ||
    cls === 'good' ||
    cls === 'forced'
  ) {
    return false
  }
  return (move.cp_loss ?? 0) >= 35
}

export function buildAlternativeSummary(
  bestSan?: string | null,
  bestSummary?: string | null,
  playedSan?: string | null
): string | null {
  if (!bestSan) return null
  const cleanBest = bestSan.trim().toLowerCase()
  const cleanPlayed = playedSan?.trim().toLowerCase()
  if (cleanPlayed && cleanBest === cleanPlayed) return null
  if (bestSummary) {
    return `Better was ${bestSan} (${bestSummary.toLowerCase()}).`
  }
  return `Better was ${bestSan}.`
}

export function buildFallbackHeadline(
  classification?: string | null,
  cpLoss?: number | null
): string | null {
  if (!classification && (cpLoss === null || cpLoss === undefined || cpLoss <= 5)) {
    return null
  }
  if (classification === 'blunder') {
    return 'This gave away a serious tactical or positional advantage.'
  }
  if (classification === 'mistake') {
    return 'This move loosened the position and handed the initiative over.'
  }
  if (classification === 'inaccuracy') {
    return 'A small inaccuracy that let the opponent equalize or apply pressure.'
  }
  if (cpLoss && cpLoss > 100) {
    return 'Major blunder — large advantage lost.'
  }
  if (cpLoss && cpLoss > 50) {
    return 'Significant advantage lost.'
  }
  return 'A slight missed opportunity.'
}

export function buildWhyBadSummary(
  move?: Partial<ChessMove> | null,
  feedback?: string | null,
  playerColor: PlayerColor = 'white'
): WhyBadSummary | null {
  if (!move || !isSuboptimalMove(move)) return null
  const cls = move.classification

  const swing = buildPositionSwingSummary(
    move.eval_before,
    move.eval_after,
    playerColor
  )
  const alt = buildAlternativeSummary(
    move.best_move_san,
    move.best_move_summary,
    move.move_san
  )
  const headline = feedback || buildFallbackHeadline(cls, move.cp_loss)

  // Use opponent's reply / punishment line, not the best alternative line
  const replyLine =
    move.deviation_best_line_san && move.deviation_best_line_san.length > 0
      ? move.deviation_best_line_san.slice(0, 3).join(' ')
      : move.reply_line_san && move.reply_line_san.length > 0
      ? move.reply_line_san.slice(0, 3).join(' ')
      : null

  const recommendedLine =
    move.best_line_san && move.best_line_san.length > 0
      ? move.best_line_san.slice(0, 4).join(' ')
      : null

  return {
    headline: headline || null,
    detail: swing || null,
    alternative: alt || null,
    replyLine: replyLine || null,
    recommendedLine: recommendedLine || null,
  }
}
