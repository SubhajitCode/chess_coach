import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EvalBar from '../EvalBar'

describe('EvalBar component', () => {
  it('renders with evalScore in centipawns', () => {
    render(<EvalBar evalScore={150} />)
    expect(screen.getByText('+1.5')).toBeInTheDocument()
    const whiteBar = screen.getByTestId('eval-bar-white')
    expect(whiteBar).toBeInTheDocument()
  })

  it('renders properly with evalCp prop (bugfix verification)', () => {
    render(<EvalBar evalCp={-200} />)
    expect(screen.getByText('-2.0')).toBeInTheDocument()
  })

  it('renders checkmate scores as M and -M', () => {
    const { rerender } = render(<EvalBar evalScore={9500} />)
    expect(screen.getByText('M')).toBeInTheDocument()

    rerender(<EvalBar evalScore={-9500} />)
    expect(screen.getByText('-M')).toBeInTheDocument()
  })

  it('defaults to 0.0 for null or undefined eval', () => {
    render(<EvalBar evalScore={null} />)
    expect(screen.getByText('0.0')).toBeInTheDocument()
  })
})
