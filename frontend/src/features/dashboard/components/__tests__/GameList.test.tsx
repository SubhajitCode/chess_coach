import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameList from '../GameList'
import type { GameItem, CacheStatusMap } from '../../../../types/chess'

describe('GameList with Analysis Badges', () => {
  const dummyGames: GameItem[] = [
    {
      white: 'Hikaru',
      black: 'Magnus',
      result: '1-0',
      pgn: '1. e4 e5',
      pgn_hash: 'hash-sf',
      time_control: '300+0',
      end_time: 1700000000,
    },
    {
      white: 'Magnus',
      black: 'Nepo',
      result: '0-1',
      pgn: '1. d4 Nf6',
      pgn_hash: 'hash-hybrid',
      time_control: '180+2',
      end_time: 1700000500,
    },
    {
      white: 'Caruana',
      black: 'Magnus',
      result: '1/2-1/2',
      pgn: '1. c4 c5',
      pgn_hash: 'hash-human',
      time_control: '600+0',
      end_time: 1700001000,
    },
    {
      white: 'Ding',
      black: 'Gukesh',
      result: '1-0',
      pgn: '1. e4 c5',
      pgn_hash: 'hash-multi',
      time_control: '900+10',
      end_time: 1700002000,
    },
    {
      white: 'Unanalyzed',
      black: 'Player',
      result: '1-0',
      pgn: '1. f4 d5',
      pgn_hash: 'hash-none',
      time_control: '300+0',
      end_time: 1700003000,
    },
  ]

  const cacheStatus: CacheStatusMap = {
    'hash-sf': {
      analyzed: true,
      engines: ['stockfish'],
      latest_engine: 'stockfish',
    },
    'hash-hybrid': {
      analyzed: true,
      engines: ['hybrid'],
      latest_engine: 'hybrid',
    },
    'hash-human': {
      analyzed: true,
      engines: ['human_model'],
      latest_engine: 'human_model',
    },
    'hash-multi': {
      analyzed: true,
      engines: ['stockfish', 'hybrid'],
      latest_engine: 'hybrid',
    },
    'hash-none': {
      analyzed: false,
      engines: [],
    },
  }

  it('renders styled icons and badges for different engine analysis types', () => {
    render(
      <GameList
        games={dummyGames}
        loading={false}
        selectedGame={null}
        onSelectGame={vi.fn()}
        gamesSource="Chess.com"
        username="Magnus"
        sortMode="date_desc"
        onSortChange={vi.fn()}
        cacheStatus={cacheStatus}
      />
    )

    // Stockfish badge on hash-sf
    expect(screen.getAllByText('Stockfish')).toHaveLength(2) // in hash-sf and hash-multi
    // Hybrid badge on hash-hybrid and hash-multi
    expect(screen.getAllByText('Hybrid')).toHaveLength(2) // in hash-hybrid and hash-multi
    // Human AI badge on hash-human
    expect(screen.getByText('Human AI')).toBeInTheDocument()

    // Verify icons exist
    expect(screen.getAllByText('⚡')).toHaveLength(2) // Stockfish icons
    expect(screen.getAllByText('🔮')).toHaveLength(2) // Hybrid icons
    expect(screen.getByText('👤')).toBeInTheDocument() // Human AI icon
  })
})
