import { describe, it, expect } from 'vitest'
import {
  buildFensBefore,
  buildFensAfter,
  decodeLine,
  computeFenForMoveIndex,
  uciToReadable,
} from '../fenTree'
import { START_FEN } from '../pgnParser'

describe('fenTree', () => {
  const moves = [
    { move_uci: 'e2e4' },
    { move_uci: 'e7e5' },
    { move_uci: 'g1f3' },
    { move_uci: 'b8c6' },
  ]

  it('buildFensBefore produces correct sequence of initial and intermediate FENs', () => {
    const fens = buildFensBefore(moves)
    expect(fens.length).toBe(4)
    expect(fens[0]).toBe(START_FEN)
    expect(fens[1]).toContain('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq')
  })

  it('buildFensAfter produces correct sequence after each move', () => {
    const fens = buildFensAfter(moves)
    expect(fens.length).toBe(4)
    expect(fens[0]).toContain('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq')
  })

  it('computeFenForMoveIndex returns correct FEN for index -1 and move indices', () => {
    expect(computeFenForMoveIndex(moves, -1)).toBe(START_FEN)
    const fenAfter1 = computeFenForMoveIndex(moves, 0)
    expect(fenAfter1).toContain('4P3')
  })

  it('uciToReadable converts UCI format to human readable string', () => {
    expect(uciToReadable('e2e4')).toBe('E2 → E4')
    expect(uciToReadable('g1f3')).toBe('G1 → F3')
  })

  it('decodeLine produces step-by-step descriptions with piece icons', () => {
    const steps = decodeLine(START_FEN, ['e2e4', 'e7e5', 'g1f3'])
    expect(steps.length).toBe(3)
    expect(steps[0].san).toBe('e4')
    expect(steps[0].from).toBe('e2')
    expect(steps[0].to).toBe('e4')
    expect(steps[0].color).toBe('white')
    expect(steps[2].san).toBe('Nf3')
    expect(steps[2].color).toBe('white')
  })
})
