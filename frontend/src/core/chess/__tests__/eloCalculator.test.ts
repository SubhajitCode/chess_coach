import { describe, it, expect } from 'vitest'
import { estimateElo, computeSideStats } from '../eloCalculator'
import type { ChessMove } from '../../../types/chess'

describe('eloCalculator', () => {
  describe('estimateElo', () => {
    it('returns null when both avgCpLoss and accuracy are null', () => {
      expect(estimateElo(null, null)).toBeNull()
    })

    it('estimates high Elo for master-level play (accuracy >= 98% and low ACPL)', () => {
      const elo = estimateElo(5, 99)
      expect(elo).toBeGreaterThanOrEqual(2500)
    })

    it('estimates club-level Elo for medium accuracy and ACPL', () => {
      const elo = estimateElo(45, 78)
      expect(elo).toBeGreaterThan(1300)
      expect(elo).toBeLessThan(1800)
    })

    it('estimates beginner-level Elo for high blunder rate and low accuracy', () => {
      const elo = estimateElo(150, 40)
      expect(elo).toBeLessThan(900)
    })
  })

  describe('computeSideStats', () => {
    it('returns zeroes when moves list is empty', () => {
      const stats = computeSideStats([])
      expect(stats.total).toBe(0)
      expect(stats.blunders).toBe(0)
      expect(stats.accuracy).toBeNull()
      expect(stats.estimated_elo).toBeNull()
    })

    it('correctly aggregates move classifications, accuracy and cp loss', () => {
      const moves: Partial<ChessMove>[] = [
        { classification: 'best', cp_loss: 0 },
        { classification: 'excellent', cp_loss: 5 },
        { classification: 'good', cp_loss: 15 },
        { classification: 'inaccuracy', cp_loss: 30 },
        { classification: 'mistake', cp_loss: 75 },
        { classification: 'blunder', cp_loss: 200 },
      ]

      const stats = computeSideStats(moves)
      expect(stats.total).toBe(6)
      expect(stats.best_moves).toBe(1)
      expect(stats.excellent_moves).toBe(1)
      expect(stats.good_moves).toBe(1)
      expect(stats.inaccuracies).toBe(1)
      expect(stats.mistakes).toBe(1)
      expect(stats.blunders).toBe(1)
      expect(stats.accuracy).toBeGreaterThan(0)
      expect(stats.avgCpLoss).toBeGreaterThan(0)
      expect(stats.estimated_elo).toBeGreaterThan(300)
    })

    it('calculates realistic accuracy (~74%) for solid games even with endgame blunders or mate loss', () => {
      // 28 moves: 2 book, 11 best, 5 excellent, 5 good, 2 inaccuracies, 1 mistake, 2 blunders (including mate blunder)
      const moves: Partial<ChessMove>[] = [
        { classification: 'book', cp_loss: 0 },
        { classification: 'book', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'best', cp_loss: 0 },
        { classification: 'excellent', cp_loss: 10 },
        { classification: 'excellent', cp_loss: 15 },
        { classification: 'excellent', cp_loss: 20 },
        { classification: 'excellent', cp_loss: 25 },
        { classification: 'excellent', cp_loss: 25 },
        { classification: 'good', cp_loss: 35 },
        { classification: 'good', cp_loss: 40 },
        { classification: 'good', cp_loss: 45 },
        { classification: 'good', cp_loss: 50 },
        { classification: 'good', cp_loss: 50 },
        { classification: 'inaccuracy', cp_loss: 70 },
        { classification: 'inaccuracy', cp_loss: 85 },
        { classification: 'mistake', cp_loss: 150 },
        { classification: 'blunder', cp_loss: 450 },
        { classification: 'blunder', cp_loss: 10000 }, // Mate blunder
      ]

      const stats = computeSideStats(moves)
      // Accuracy = (2*100 + 11*100 + 5*90 + 5*75 + 2*50 + 1*25 + 2*0) / 28
      // = (200 + 1100 + 450 + 375 + 100 + 25 + 0) / 28 = 2250 / 28 = 80.4%
      expect(stats.accuracy).toBeCloseTo(80.4, 1)
      expect(stats.blunders).toBe(2)
      expect(stats.mistakes).toBe(1)
      expect(stats.estimated_elo).toBeGreaterThan(1200)
    })
  })
})
