import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useSparringSession } from '../useSparringSession'
import * as chessApi from '../../../../api/chess'
import type { ReactNode } from 'react'

vi.mock('../../../../api/chess', () => ({
  getAiMove: vi.fn(),
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

describe('useSparringSession hook', () => {
  it('initializes in standard starting state for White', () => {
    const { result } = renderHook(() => useSparringSession(), { wrapper })
    expect(result.current.playerColor).toBe('white')
    expect(result.current.isPlayerTurn).toBe(true)
    expect(result.current.history).toHaveLength(0)
    expect(result.current.gameOver).toBeNull()
  })

  it('allows legal player moves and records history', () => {
    const { result } = renderHook(() => useSparringSession(), { wrapper })

    vi.mocked(chessApi.getAiMove).mockResolvedValueOnce({
      selected_move_uci: 'e7e5',
      candidates: [{ move_san: 'e5', probability: 45.2, move_uci: 'e7e5' }],
      eval: 0.1,
      win_probability_pct: 50.5,
    })

    let success = false
    act(() => {
      success = result.current.handlePlayerPieceDrop({
        sourceSquare: 'e2',
        targetSquare: 'e4',
      })
    })

    expect(success).toBe(true)
    expect(result.current.history[0].san).toBe('e4')
  })

  it('handles takeback cleanly', async () => {
    const { result } = renderHook(() => useSparringSession(), { wrapper })

    vi.mocked(chessApi.getAiMove).mockResolvedValueOnce({
      selected_move_uci: 'e7e5',
      candidates: [{ move_san: 'e5', probability: 45.2, move_uci: 'e7e5' }],
      eval: 0.1,
      win_probability_pct: 50.5,
    })

    await act(async () => {
      result.current.handlePlayerPieceDrop({
        sourceSquare: 'e2',
        targetSquare: 'e4',
      })
    })

    expect(result.current.history.length).toBeGreaterThan(0)

    act(() => {
      result.current.handleTakeback()
    })

    expect(result.current.history).toHaveLength(0)
  })

  it('handles player resignation', () => {
    const { result } = renderHook(() => useSparringSession(), { wrapper })

    act(() => {
      result.current.handleResign()
    })

    expect(result.current.gameOver).not.toBeNull()
    expect(result.current.gameOver?.result).toBe('0-1')
  })
})
