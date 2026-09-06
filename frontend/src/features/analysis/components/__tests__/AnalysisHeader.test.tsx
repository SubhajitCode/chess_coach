import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AnalysisHeader from '../AnalysisHeader'

describe('AnalysisHeader', () => {
  it('renders progress bar and metrics when analyzing is true', () => {
    const onStop = vi.fn()
    render(
      <AnalysisHeader
        game={{
          white: 'Carlsen',
          black: 'Nakamura',
          result: '1-0',
          pgn: '1. e4 e5',
        }}
        selectedEngine="stockfish"
        setSelectedEngine={vi.fn()}
        depth={18}
        setDepth={vi.fn()}
        analyzing={true}
        showArrows={true}
        setShowArrows={vi.fn()}
        analyzedCount={15}
        totalMoves={30}
        onAnalyze={vi.fn()}
        onStop={onStop}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByText('15 / 30 moves')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
  })

  it('does not render progress bar when analyzing is false', () => {
    render(
      <AnalysisHeader
        game={{
          white: 'Carlsen',
          black: 'Nakamura',
          result: '1-0',
          pgn: '1. e4 e5',
        }}
        selectedEngine="stockfish"
        setSelectedEngine={vi.fn()}
        depth={18}
        setDepth={vi.fn()}
        analyzing={false}
        showArrows={true}
        setShowArrows={vi.fn()}
        analyzedCount={0}
        totalMoves={30}
        onAnalyze={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
  })
})
