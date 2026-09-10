import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CoachInsightCard from '../CoachInsightCard'
import type { ChessMove } from '../../../../types/chess'

describe('CoachInsightCard', () => {
  it('renders opening book move insight with default text when no feedback', () => {
    const move: ChessMove = {
      move_number: 1,
      color: 'white',
      move_san: 'e4',
      move_uci: 'e2e4',
      classification: 'book',
      cp_loss: 0,
    }

    render(<CoachInsightCard move={move} isPlayerMove={true} />)
    expect(screen.getByText(/Opening Book \/ Coach Insight/i)).toBeInTheDocument()
    expect(screen.getByText(/follows standard chess opening book theory/i)).toBeInTheDocument()
  })

  it('renders opening book move insight with custom AI feedback', () => {
    const move: ChessMove = {
      move_number: 1,
      color: 'white',
      move_san: 'e4',
      move_uci: 'e2e4',
      classification: 'book',
      cp_loss: 0,
    }

    render(
      <CoachInsightCard
        move={move}
        feedback="1. e4 takes full central stake and unleashes your bishops."
        isPlayerMove={true}
      />
    )
    expect(screen.getByText(/Opening Book \/ Coach Insight/i)).toBeInTheDocument()
    expect(screen.getByText('1. e4 takes full central stake and unleashes your bishops.')).toBeInTheDocument()
  })

  it('renders best move card with emerald theme', () => {
    const move: ChessMove = {
      move_number: 10,
      color: 'white',
      move_san: 'Nd5',
      move_uci: 'c3d5',
      classification: 'best',
      cp_loss: 0,
    }

    render(<CoachInsightCard move={move} isPlayerMove={true} />)
    expect(screen.getByText(/Best Move \/ Coach Insight/i)).toBeInTheDocument()
    expect(screen.getByText(/engine's top choice/i)).toBeInTheDocument()
  })

  it('renders opponent move analysis when feedback is provided', () => {
    const move: ChessMove = {
      move_number: 5,
      color: 'black',
      move_san: 'Bg4',
      move_uci: 'c8g4',
      classification: 'good',
    }

    render(
      <CoachInsightCard
        move={move}
        feedback="Black pins your f3 knight to the queen."
        isPlayerMove={false}
      />
    )
    expect(screen.getByText(/Opponent Move Analysis/i)).toBeInTheDocument()
    expect(screen.getByText('Black pins your f3 knight to the queen.')).toBeInTheDocument()
  })

  it('renders master database games count and candidate choices for book moves', () => {
    const move: ChessMove = {
      move_number: 1,
      color: 'white',
      move_san: 'e4',
      move_uci: 'e2e4',
      classification: 'book',
      cp_loss: 0,
      book_weight: 10439,
      book_candidates: [
        { san: 'e4', uci: 'e2e4', weight: 10439, percentage: 52.3 },
        { san: 'd4', uci: 'd2d4', weight: 6812, percentage: 34.1 },
        { san: 'Nf3', uci: 'g1f3', weight: 1720, percentage: 8.6 },
      ],
    }

    render(<CoachInsightCard move={move} isPlayerMove={true} />)
    expect(screen.getByText(/10,439 master games/i)).toBeInTheDocument()
    expect(screen.getByText(/Master Database Choices/i)).toBeInTheDocument()
    expect(screen.getAllByText('e4').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('(52.3%)')).toBeInTheDocument()
    expect(screen.getByText('d4')).toBeInTheDocument()
    expect(screen.getByText('(34.1%)')).toBeInTheDocument()
    expect(screen.getByText('Nf3')).toBeInTheDocument()
    expect(screen.getByText('(8.6%)')).toBeInTheDocument()
  })
})
