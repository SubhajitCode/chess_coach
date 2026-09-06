import { Chess } from 'chess.js'
import type { GameHeaders, ParsedMove, GameItem } from '../../types/chess'

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function extractPgnHeaders(pgn?: string | null): GameHeaders {
  if (!pgn) return {}
  const headers: GameHeaders = {}
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g
  let match: RegExpExecArray | null
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2]
  }
  return headers
}

export function parsePgnMoves(pgn?: string | null): ParsedMove[] {
  if (!pgn) return []
  try {
    const chess = new Chess()
    chess.loadPgn(pgn)
    const history = chess.history({ verbose: true })
    return history.map((m, idx) => ({
      move_number: Math.floor(idx / 2) + 1,
      color: m.color === 'w' ? 'white' : 'black',
      move_san: m.san,
      move_uci: `${m.from}${m.to}${m.promotion || ''}`,
      san: m.san,
    }))
  } catch {
    return []
  }
}

export function prettifyOpening(raw?: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsedUrl = new URL(trimmed)
      const segments = parsedUrl.pathname.split('/').filter(Boolean)
      const lastSegment = segments[segments.length - 1] || ''
      if (lastSegment) {
        return decodeURIComponent(lastSegment)
          .replace(/[-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
    } catch {
      // fallback to regex replace
    }
  }

  return trimmed
    .replace(/^https?:\/\/[^/]+\/(?:openings\/)?/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatDate(timestamp?: number | string | null): string {
  if (!timestamp) return ''
  try {
    const date =
      typeof timestamp === 'number'
        ? new Date(timestamp * 1000)
        : new Date(timestamp)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function formatSavedAt(isoString?: string | null): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function sortGames(
  games: GameItem[],
  sortBy: string,
  username?: string | null
): GameItem[] {
  return [...games].sort((a, b) => {
    if (sortBy === 'date_asc') {
      const timeA = typeof a.end_time === 'number' ? a.end_time : 0
      const timeB = typeof b.end_time === 'number' ? b.end_time : 0
      return timeA - timeB
    }
    if (sortBy === 'result') {
      const resultOrder: Record<string, number> = {
        '1-0': 1,
        '0-1': 2,
        '1/2-1/2': 3,
        '*': 4,
      }
      return (resultOrder[a.result || '*'] || 99) - (resultOrder[b.result || '*'] || 99)
    }
    if (sortBy === 'opponent' && username) {
      const getOpponent = (g: GameItem) =>
        g.white.toLowerCase() === username.toLowerCase() ? g.black : g.white
      return getOpponent(a).localeCompare(getOpponent(b))
    }
    // Default 'date_desc'
    const timeA = typeof a.end_time === 'number' ? a.end_time : 0
    const timeB = typeof b.end_time === 'number' ? b.end_time : 0
    return timeB - timeA
  })
}
