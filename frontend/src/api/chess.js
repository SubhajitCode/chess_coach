import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const fetchGames = (source, username, year, month, maxGames = 20) =>
  api.get('/games', { params: { source, username, year, month, max_games: maxGames } })

export const analyzeGame = (pgn, depth = 18, playerColor = null) =>
  api.post('/analyze', { pgn, depth, player_color: playerColor })

export const getCoaching = (analysis, playerColor, username = null) =>
  api.post('/coach', { analysis, player_color: playerColor, username })

export const getPerMoveCoaching = (pgnHash, analysis, playerColor, username = null) =>
  api.post('/coach/per-move', { pgn_hash: pgnHash, analysis, player_color: playerColor, username })

export const getCachedPerMoveCoaching = (pgnHash) =>
  api.get(`/coach/per-move/${pgnHash}`)

export const getCachedAnalysis = (pgnHash) =>
  api.get(`/analysis/cached/${pgnHash}`)

export const deleteCachedAnalysis = (pgnHash) =>
  api.delete(`/analysis/cached/${pgnHash}`)

/**
 * Compute a simple 24-char hex hash of a PGN string (matches backend sha256 truncated).
 * Uses SubtleCrypto — returns a Promise<string>.
 */
export async function computePgnHash(pgn) {
  const data = new TextEncoder().encode(pgn.trim())
  const buf = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 24)
}



/**
 * Stream analysis via SSE. Calls onMove for each move, onSummary at end, onDone when complete.
 * Returns an AbortController — call controller.abort() to cancel.
 */
export function analyzeGameStream({ pgn, depth = 18, playerColor = 'white', onMeta, onMove, onSummary, onDone, onError }) {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch('/api/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn, depth, player_color: playerColor }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Analysis failed' }))
        onError?.(err.detail || 'Analysis failed')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') {
            onDone?.()
            return
          }
          try {
            const data = JSON.parse(payload)
            if (data.type === 'meta') onMeta?.(data)
            else if (data.type === 'move') onMove?.(data)
            else if (data.type === 'summary') onSummary?.(data)
            else if (data.type === 'error') onError?.(data.message)
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError?.(err.message || 'Stream error')
      }
    }
  })()

  return controller
}

