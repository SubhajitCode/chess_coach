import { describe, it, expect } from 'vitest'
import {
  extractPgnHeaders,
  parsePgnMoves,
  prettifyOpening,
  sortGames,
} from '../pgnParser'
import type { GameItem } from '../../../types/chess'

describe('pgnParser', () => {
  const samplePgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.08.20"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`

  describe('extractPgnHeaders', () => {
    it('extracts standard PGN headers correctly', () => {
      const headers = extractPgnHeaders(samplePgn)
      expect(headers.White).toBe('Player1')
      expect(headers.Black).toBe('Player2')
      expect(headers.Result).toBe('1-0')
      expect(headers.ECO).toBe('C50')
      expect(headers.Opening).toBe('Italian Game')
    })

    it('returns empty object for empty or null pgn', () => {
      expect(extractPgnHeaders('')).toEqual({})
      expect(extractPgnHeaders(null)).toEqual({})
    })
  })

  describe('parsePgnMoves', () => {
    it('parses moves into structured objects with move numbers, SAN and UCI', () => {
      const moves = parsePgnMoves(samplePgn)
      expect(moves.length).toBe(6)
      expect(moves[0]).toEqual({
        move_number: 1,
        color: 'white',
        move_san: 'e4',
        move_uci: 'e2e4',
        san: 'e4',
      })
      expect(moves[1]).toEqual({
        move_number: 1,
        color: 'black',
        move_san: 'e5',
        move_uci: 'e7e5',
        san: 'e5',
      })
      expect(moves[2]).toEqual({
        move_number: 2,
        color: 'white',
        move_san: 'Nf3',
        move_uci: 'g1f3',
        san: 'Nf3',
      })
    })

    it('returns empty array for invalid or empty pgn', () => {
      expect(parsePgnMoves('')).toEqual([])
      expect(parsePgnMoves(null)).toEqual([])
    })
  })

  describe('prettifyOpening', () => {
    it('formats URL slug into human readable name', () => {
      const slug = 'https://www.chess.com/openings/Italian-Game-Giuoco-Piano'
      expect(prettifyOpening(slug)).toBe('Italian Game Giuoco Piano')
    })

    it('preserves plain opening strings', () => {
      expect(prettifyOpening("Queen's Gambit Declined")).toBe(
        "Queen's Gambit Declined"
      )
    })
  })

  describe('sortGames', () => {
    const games: GameItem[] = [
      { white: 'Alice', black: 'Bob', end_time: 100, result: '1-0', pgn: '1. e4' },
      { white: 'Charlie', black: 'Alice', end_time: 300, result: '0-1', pgn: '1. d4' },
      { white: 'Alice', black: 'Dave', end_time: 200, result: '1/2-1/2', pgn: '1. c4' },
    ]

    it('sorts by date descending by default', () => {
      const sorted = sortGames(games, 'date_desc')
      expect(sorted[0].end_time).toBe(300)
      expect(sorted[2].end_time).toBe(100)
    })

    it('sorts by date ascending', () => {
      const sorted = sortGames(games, 'date_asc')
      expect(sorted[0].end_time).toBe(100)
      expect(sorted[2].end_time).toBe(300)
    })

    it('sorts by opponent name alphabetically', () => {
      const sorted = sortGames(games, 'opponent', 'Alice')
      expect(sorted[0].black).toBe('Bob')
      expect(sorted[1].white).toBe('Charlie')
      expect(sorted[2].black).toBe('Dave')
    })
  })
})
