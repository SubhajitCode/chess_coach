import { describe, it, expect } from 'vitest'
import {
  isSuboptimalMove,
  buildAlternativeSummary,
  buildWhyBadSummary,
  buildPositionSwingSummary,
  buildFallbackHeadline,
} from '../swingSummarizer'
import type { ChessMove } from '../../../types/chess'

describe('swingSummarizer', () => {
  describe('isSuboptimalMove', () => {
    it('returns false for book and best moves', () => {
      expect(isSuboptimalMove({ classification: 'book', cp_loss: 0 })).toBe(false)
      expect(isSuboptimalMove({ classification: 'best', cp_loss: 0 })).toBe(false)
      expect(isSuboptimalMove({ classification: 'excellent', cp_loss: 15 })).toBe(false)
      expect(isSuboptimalMove({ classification: 'good', cp_loss: 20 })).toBe(false)
      expect(isSuboptimalMove({ classification: 'forced', cp_loss: 0 })).toBe(false)
    })

    it('returns true for mistakes, blunders, and inaccuracies', () => {
      expect(isSuboptimalMove({ classification: 'blunder', cp_loss: 300 })).toBe(true)
      expect(isSuboptimalMove({ classification: 'mistake', cp_loss: 150 })).toBe(true)
      expect(isSuboptimalMove({ classification: 'inaccuracy', cp_loss: 60 })).toBe(true)
    })

    it('handles unclassified moves based on cp_loss threshold', () => {
      expect(isSuboptimalMove({ cp_loss: 10 })).toBe(false)
      expect(isSuboptimalMove({ cp_loss: 50 })).toBe(true)
    })
  })

  describe('buildAlternativeSummary', () => {
    it('returns null when best move equals the played move', () => {
      expect(buildAlternativeSummary('e4', 'Pawn moves from e2 to e4', 'e4')).toBeNull()
      expect(buildAlternativeSummary('Nf3', undefined, 'Nf3')).toBeNull()
      expect(buildAlternativeSummary('c5', 'pawn moves', ' C5 ')).toBeNull()
    })

    it('returns formatted alternative when best move is different', () => {
      expect(buildAlternativeSummary('Nf3', 'knight moves from g1 to f3', 'f3')).toBe(
        'Better was Nf3 (knight moves from g1 to f3).'
      )
      expect(buildAlternativeSummary('d4', undefined, 'e3')).toBe('Better was d4.')
    })

    it('returns null when bestSan is empty or null', () => {
      expect(buildAlternativeSummary(null, null, 'e4')).toBeNull()
      expect(buildAlternativeSummary('', null, 'e4')).toBeNull()
    })
  })

  describe('buildWhyBadSummary', () => {
    it('returns null for book move even if feedback is provided', () => {
      const bookMove: Partial<ChessMove> = {
        move_san: 'e4',
        best_move_san: 'e4',
        best_move_summary: 'pawn moves from e2 to e4',
        classification: 'book',
        cp_loss: 0,
        eval_before: 0.2,
        eval_after: 0.3,
        best_line_san: ['e4', 'e5', 'Nf3'],
      }
      const summary = buildWhyBadSummary(bookMove, '1. e4 takes the center.', 'white')
      expect(summary).toBeNull()
    })

    it('returns null for best move', () => {
      const bestMove: Partial<ChessMove> = {
        move_san: 'e4',
        best_move_san: 'e4',
        classification: 'best',
        cp_loss: 0,
      }
      expect(buildWhyBadSummary(bestMove, null, 'white')).toBeNull()
    })

    it('builds a summary for blunders and mistakes without self-referential alternative', () => {
      const blunderMove: Partial<ChessMove> = {
        move_san: 'f3',
        best_move_san: 'e4',
        best_move_summary: 'pawn moves from e2 to e4',
        classification: 'blunder',
        cp_loss: 250,
        eval_before: 0.2,
        eval_after: -2.3,
        deviation_best_line_san: ['e5', 'Nc3', 'd5'],
      }
      const summary = buildWhyBadSummary(blunderMove, null, 'white')
      expect(summary).not.toBeNull()
      expect(summary?.headline).toContain('serious tactical or positional advantage')
      expect(summary?.alternative).toBe('Better was e4 (pawn moves from e2 to e4).')
      expect(summary?.replyLine).toBe('e5 Nc3 d5')
    })
  })

  describe('buildPositionSwingSummary and buildFallbackHeadline', () => {
    it('summarizes eval swing', () => {
      const swing = buildPositionSwingSummary(20, -150, 'white')
      expect(swing).toContain('Position changed from')
    })

    it('returns correct fallback headlines', () => {
      expect(buildFallbackHeadline('blunder', 200)).toContain('tactical or positional advantage')
      expect(buildFallbackHeadline('mistake', 120)).toContain('loosened the position')
      expect(buildFallbackHeadline('inaccuracy', 60)).toContain('inaccuracy')
    })
  })
})
