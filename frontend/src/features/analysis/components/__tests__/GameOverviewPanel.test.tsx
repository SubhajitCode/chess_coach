import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameOverviewPanel from '../GameOverviewPanel'

describe('GameOverviewPanel', () => {
  it('renders correctly when overview is a nested object from backend', () => {
    const nestedOverview = {
      overview: {
        overview: 'You played accurately in the opening.',
        key_moments: ['Move 10 was sharp', 'Move 15 missed a tactic'],
      },
      cached: false,
    }

    render(
      <GameOverviewPanel
        overview={nestedOverview as any}
        onRetry={vi.fn()}
      />
    )

    expect(screen.getByText('You played accurately in the opening.')).toBeInTheDocument()
    expect(screen.getByText('Move 10 was sharp')).toBeInTheDocument()
    expect(screen.getByText('Move 15 missed a tactic')).toBeInTheDocument()
  })

  it('renders correctly when overview is already unnested', () => {
    const flatOverview = {
      overview: 'Solid endgame technique.',
      key_moments: ['Move 25 king activation'],
    }

    render(
      <GameOverviewPanel
        overview={flatOverview}
        onRetry={vi.fn()}
      />
    )

    expect(screen.getByText('Solid endgame technique.')).toBeInTheDocument()
    expect(screen.getByText('Move 25 king activation')).toBeInTheDocument()
  })
})
