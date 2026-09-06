import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { usePracticeSession } from '../usePracticeSession'
import type { ReactNode } from 'react'
import type { ChessMove } from '../../../../types/chess'

const sampleMoves: Partial<ChessMove>[] = [
  {
    move_number: 1,
    color: 'white',
    move_san: 'e4',
    move_uci: 'e2e4',
    classification: 'best',
  },
  {
    move_number: 1,
    color: 'black',
    move_san: 'e5',
    move_uci: 'e7e5',
    classification: 'best',
  },
  {
    move_number: 2,
    color: 'white',
    move_san: 'Qh5',
    move_uci: 'd1h5',
    classification: 'blunder',
    best_move_san: 'Nf3',
    best_move_uci: 'g1f3',
  },
]

const createWrapper = (initialState: any) => {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[{ pathname: '/practice', state: initialState }]}>
      {children}
    </MemoryRouter>
  )
}

describe('usePracticeSession hook', () => {
  it('extracts blunders and mistakes into interactive practice puzzles', () => {
    const wrapper = createWrapper({
      moves: sampleMoves,
      playerColor: 'white',
    })

    const { result } = renderHook(() => usePracticeSession(), { wrapper })

    expect(result.current.allMistakes).toHaveLength(1)
    expect(result.current.current?.move_san).toBe('Qh5')
    expect(result.current.phase).toBe('playing')
  })

  it('marks correct answer when player drops the best move', () => {
    const wrapper = createWrapper({
      moves: sampleMoves,
      playerColor: 'white',
    })

    const { result } = renderHook(() => usePracticeSession(), { wrapper })

    act(() => {
      result.current.handlePieceDrop({
        sourceSquare: 'g1',
        targetSquare: 'f3',
      })
    })

    expect(result.current.phase).toBe('correct')
    expect(result.current.solvedCount).toBe(1)
    expect(result.current.streak).toBe(1)
  })

  it('increments attempts on wrong move and reveals after max attempts', () => {
    const wrapper = createWrapper({
      moves: sampleMoves,
      playerColor: 'white',
    })

    const { result } = renderHook(() => usePracticeSession(), { wrapper })

    act(() => {
      result.current.handlePieceDrop({
        sourceSquare: 'b1',
        targetSquare: 'c3',
      })
    })
    expect(result.current.attempts).toBe(1)
    expect(result.current.phase).toBe('playing')

    act(() => {
      result.current.handlePieceDrop({
        sourceSquare: 'b1',
        targetSquare: 'c3',
      })
    })
    act(() => {
      result.current.handlePieceDrop({
        sourceSquare: 'b1',
        targetSquare: 'c3',
      })
    })

    expect(result.current.phase).toBe('revealed')
    expect(result.current.streak).toBe(0)
  })
})
