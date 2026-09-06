import { describe, it, expect } from 'vitest'
import { evalLabel, cpLossDescription } from '../moveClassifier'

describe('moveClassifier', () => {
  describe('evalLabel', () => {
    it('formats winning and losing scores for White', () => {
      expect(evalLabel(350, 'white').text).toContain('Winning')
      expect(evalLabel(-350, 'white').text).toContain('Losing')
    })

    it('inverts perspective for Black', () => {
      expect(evalLabel(350, 'black').text).toContain('Losing')
      expect(evalLabel(-350, 'black').text).toContain('Winning')
    })

    it('handles mate evaluations', () => {
      expect(evalLabel(9500, 'white').text).toBe('Checkmate threat')
      expect(evalLabel(-9500, 'white').text).toBe('Getting mated')
    })
  })

  describe('cpLossDescription', () => {
    it('returns null for negligible cp loss (<=5)', () => {
      expect(cpLossDescription(4)).toBeNull()
    })

    it('returns appropriate description based on severity', () => {
      expect(cpLossDescription(15)).toBe('Minimal loss of advantage')
      expect(cpLossDescription(40)).toBe('Noticeable advantage lost')
      expect(cpLossDescription(80)).toBe('Significant advantage lost')
      expect(cpLossDescription(150)).toBe(
        'Major blunder — large advantage given away'
      )
    })
  })
})
