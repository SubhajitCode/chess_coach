import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const fetchGames = (source, username, year, month, maxGames = 20) =>
  api.get('/games', { params: { source, username, year, month, max_games: maxGames } })

export const fetchEngines = () =>
  api.get('/engines').then((res) => res.data)

export const analyzeGame = (pgn, depth = 18, playerColor = null, engine = 'stockfish') =>
  api.post('/analyze', { pgn, depth, player_color: playerColor, engine })

export const getCoaching = (analysis, playerColor, username = null) =>
  api.post('/coach', { analysis, player_color: playerColor, username })

export const getPerMoveCoaching = (pgnHash, analysis, playerColor, username = null) =>
  api.post('/coach/per-move', { pgn_hash: pgnHash, analysis, player_color: playerColor, username })

export const getCachedPerMoveCoaching = (pgnHash) =>
  api.get(`/coach/per-move/${pgnHash}`).then((res) => res.data)

export const getGameOverview = (pgnHash, analysis, playerColor, username = null) =>
  api.post('/coach/overview', { pgn_hash: pgnHash, analysis, player_color: playerColor, username })

export const getCachedGameOverview = (pgnHash) =>
  api.get(`/coach/overview/${pgnHash}`).then((res) => res.data)

export const getCachedAnalysis = (pgnHash) =>
  api.get(`/analysis/cached/${pgnHash}`).then((res) => res.data.cached)

export const deleteCachedAnalysis = (pgnHash) =>
  api.delete(`/analysis/cached/${pgnHash}`)

export const checkPgnCache = (pgns) =>
  api.post('/analysis/check-cache', { pgns })

export const getPlayerProfile = () =>
  api.get('/profile')

export const savePlayerProfile = (profile) =>
  api.put('/profile', profile)

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

export const analyzePosition = (fen, moveUci = null, depth = 12, pvLength = 5, engine = 'stockfish') =>
  api.post('/analyze/position', { fen, move_uci: moveUci, depth, pv_length: pvLength, engine })

export const getDeviationCoaching = (payload) =>
  api.post('/coach/deviation', payload)

export const askCoach = (payload) =>
  api.post('/coach/ask', payload).then((res) => res.data)

export const getAiMove = ({ fen, engine = 'human_model', temperature = 0.2, topK = 4 }) =>
  api.post('/play/move', { fen, engine, temperature, top_k: topK }).then((res) => res.data)


/**
 * Stream analysis via SSE. Calls onMove for each move, onSummary at end, onDone when complete.
 * Returns an AbortController — call controller.abort() to cancel.
 */
export function analyzeGameStream({ pgn, depth = 18, playerColor = 'white', engine = 'stockfish', onMeta, onMove, onSummary, onDone, onError }) {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch('/api/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn, depth, player_color: playerColor, engine }),
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
