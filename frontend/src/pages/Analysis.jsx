import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { analyzeGameStream, getPerMoveCoaching, getCachedPerMoveCoaching, getCachedAnalysis, computePgnHash } from '../api/chess'
import MoveTable from '../components/MoveTable'
import EvalBar from '../components/EvalBar'
import EvalChart from '../components/EvalChart'
import CoachPanel from '../components/CoachPanel'

const CLASSIFICATION_BADGE = {
  best: { label: 'Best', color: 'bg-emerald-600' },
  excellent: { label: 'Excellent', color: 'bg-green-600' },
  good: { label: 'Good', color: 'bg-lime-600' },
  inaccuracy: { label: 'Inaccuracy', color: 'bg-yellow-600' },
  mistake: { label: 'Mistake', color: 'bg-orange-600' },
  blunder: { label: 'Blunder', color: 'bg-red-600' },
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const ELO_CALIBRATION_POINTS = [
  [0, 2500],
  [10, 2200],
  [30, 1800],
  [60, 1400],
  [120, 800],
  [200, 200],
]

function estimateElo(avgCpLoss) {
  if (avgCpLoss == null || Number.isNaN(avgCpLoss)) return null

  const normalizedCpLoss = Math.max(0, avgCpLoss)

  for (let index = 0; index < ELO_CALIBRATION_POINTS.length - 1; index += 1) {
    const [leftCp, leftElo] = ELO_CALIBRATION_POINTS[index]
    const [rightCp, rightElo] = ELO_CALIBRATION_POINTS[index + 1]
    if (normalizedCpLoss <= rightCp) {
      const span = rightCp - leftCp
      const progress = span === 0 ? 0 : (normalizedCpLoss - leftCp) / span
      return Math.round(Math.max(200, Math.min(2800, leftElo + (rightElo - leftElo) * progress)))
    }
  }

  return ELO_CALIBRATION_POINTS[ELO_CALIBRATION_POINTS.length - 1][1]
}

function prettifyOpening(raw) {
  if (!raw) return null
  if (raw.startsWith('http')) {
    // e.g. https://www.chess.com/openings/Italian-Game-Giuoco-Piano → "Italian Game: Giuoco Piano"
    const slug = raw.split('/').pop()
    const parts = slug.split('-')
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
  }
  return raw
}

function extractPgnHeaders(pgn) {
  if (!pgn) return {}
  const headers = {}
  const lines = pgn.split('\n')
  for (const line of lines) {
    const m = line.match(/^\[(\w+)\s+"([^"]*)"\]/)
    if (m) headers[m[1]] = m[2]
    if (line.trim() === '' && Object.keys(headers).length > 0 && !line.startsWith('[')) break
  }
  return headers
}

function parsePgnMoves(pgn) {
  if (!pgn) return []

  const attempts = [
    pgn,
    pgn.replace(/\{[^}]*\}/g, ' ').replace(/\$\d+/g, ' '),
  ]

  for (const candidate of attempts) {
    const ch = new Chess()

    try {
      ch.loadPgn(candidate)
      const history = ch.history({ verbose: true })

      return history.map((move, index) => ({
        move_number: Math.floor(index / 2) + 1,
        color: move.color === 'w' ? 'white' : 'black',
        move_san: move.san,
        move_uci: `${move.from}${move.to}${move.promotion || ''}`,
      }))
    } catch {
      continue
    }
  }

  return []
}

export default function Analysis() {
  const { state } = useLocation()
  const navigate = useNavigate()

  const game = state?.game
  const playerColor = state?.playerColor || 'white'
  const username = state?.username

  const [totalMoves, setTotalMoves] = useState(0)

  // currentIndex: -1 = start position, 0..n-1 = after move index
  const [currentIndex, setCurrentIndex] = useState(-1)

  // Streaming analysis state
  const [streamedMoves, setStreamedMoves] = useState([])
  const [summary, setSummary] = useState(null)
  const [gameMeta, setGameMeta] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [analyzedCount, setAnalyzedCount] = useState(0)

  // Coaching
  const [moveCoaching, setMoveCoaching] = useState({}) // map: move_index -> feedback string for all moves
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState(null)
  const [pgnHash, setPgnHash] = useState(null)

  const [depth, setDepth] = useState(18)
  const [showArrows, setShowArrows] = useState(true)
  const [trackLatest, setTrackLatest] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  // Temporary board preview when hovering best-line steps in CoachPanel
  const [bestLinePreview, setBestLinePreview] = useState(null) // { fen, from, to }

  const abortRef = useRef(null)
  const moveTableRef = useRef(null)

  // On mount, try to load a cached analysis for this game's PGN
  useEffect(() => {
    if (!game?.pgn) return
    let cancelled = false
    ;(async () => {
      try {
        const hash = await computePgnHash(game.pgn)
        if (cancelled) return
        setPgnHash(hash)
        const res = await getCachedAnalysis(hash)
        if (cancelled) return
        const cached = res.data
        setStreamedMoves(cached.moves || [])

        // Recompute the displayed estimate from move data so cached analyses
        // pick up calibration changes without needing cache invalidation.
        let cachedSummary = cached.summary || null
        if (cachedSummary) {
          const playerMoves = (cached.moves || []).filter(m => m.color === playerColor)
          if (playerMoves.length > 0) {
            const avgCpLoss = playerMoves.reduce((acc, m) => acc + (m.cp_loss || 0), 0) / playerMoves.length
            cachedSummary = { ...cachedSummary, estimated_elo: estimateElo(avgCpLoss) }
          }
        }
        setSummary(cachedSummary)

        // Extract opening from PGN headers if not in cached meta
        const pgnHeaders = extractPgnHeaders(game.pgn)
        const openingFromPgn = pgnHeaders.Opening || pgnHeaders.ECOUrl || null
        if (openingFromPgn) setGameMeta(prev => ({ ...(prev || {}), opening: openingFromPgn }))

        setFromCache(true)
        setTrackLatest(false)
        setCurrentIndex(-1)  // start at beginning

        // Also try loading cached per-move coaching
        try {
          const coachRes = await getCachedPerMoveCoaching(hash)
          if (!cancelled && coachRes.data?.coaching) {
            const coaching = coachRes.data.coaching
            if (coaching.length >= (cached.moves || []).length) {
              const map = {}
              coaching.forEach(c => { map[c.move_index] = c.feedback })
              setMoveCoaching(map)
            }
          }
        } catch {
          // No cached coaching — will be generated after analysis
        }
      } catch {
        // No cache — compute hash for later use
        try {
          const hash = await computePgnHash(game.pgn)
          if (!cancelled) setPgnHash(hash)
        } catch { /* ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [game?.pgn])

  const parsedGameMoves = useMemo(() => parsePgnMoves(game?.pgn), [game?.pgn])
  const boardMoves = streamedMoves.length > 0 ? streamedMoves : parsedGameMoves
  const maxNavigableIndex = Math.max(-1, boardMoves.length - 1)

  // Reset navigation when the selected game changes
  useEffect(() => {
    setTotalMoves(parsedGameMoves.length)
    setCurrentIndex(-1)
  }, [parsedGameMoves])

  // The FEN to show on the board
  const currentFen = useMemo(() => {
    if (currentIndex < 0 || boardMoves.length === 0) {
      return START_FEN
    }

    const ch = new Chess()
    const moveCount = Math.min(currentIndex + 1, boardMoves.length)

    for (let i = 0; i < moveCount; i += 1) {
      const uci = boardMoves[i]?.move_uci
      if (!uci || uci.length < 4) break

      const result = ch.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] || undefined,
      })

      if (!result) break
    }

    return ch.fen()
  }, [boardMoves, currentIndex])
  // When hovering a best-line step, show that position; otherwise show current game position
  const displayFen   = bestLinePreview?.fen ?? currentFen
  const boardPosition = displayFen.split(' ')[0]

  const analysisArrows = useMemo(() => {
    // While hovering a best-line step, show only that move's arrow
    if (bestLinePreview) {
      return [{
        startSquare: bestLinePreview.from,
        endSquare:   bestLinePreview.to,
        color: 'rgba(16, 185, 129, 0.9)',
      }]
    }

    if (!showArrows) return []

    const activeMove = currentIndex >= 0 ? boardMoves[currentIndex] : boardMoves[0]
    if (!activeMove) return []

    const arrows = []

    // Best move arrow (Green)
    if (activeMove.best_move_uci && activeMove.best_move_uci.length >= 4) {
      arrows.push({
        startSquare: activeMove.best_move_uci.slice(0, 2),
        endSquare:   activeMove.best_move_uci.slice(2, 4),
        color: 'rgba(16, 185, 129, 0.8)',
      })
    }

    // Mistake / blunder arrow (Red)
    const isMistake = activeMove.classification === 'mistake' || activeMove.classification === 'blunder'
    if (isMistake && currentIndex >= 0 && activeMove.move_uci && activeMove.move_uci.length >= 4) {
      arrows.push({
        startSquare: activeMove.move_uci.slice(0, 2),
        endSquare:   activeMove.move_uci.slice(2, 4),
        color: 'rgba(239, 68, 68, 0.8)',
      })
    }

    return arrows
  }, [showArrows, currentIndex, boardMoves, bestLinePreview])

  const currentMove = streamedMoves[currentIndex] || parsedGameMoves[currentIndex] || null
  const currentEval = currentMove?.eval_after ?? null

  // Highlighted squares for the last move played
  const highlightSquares = currentMove
    ? {
        [currentMove.move_uci?.slice(0, 2)]: { backgroundColor: 'rgba(255, 255, 100, 0.4)' },
        [currentMove.move_uci?.slice(2, 4)]: { backgroundColor: 'rgba(255, 255, 100, 0.4)' },
      }
    : {}

  const handleAnalyze = () => {
    // Cancel any in-flight stream
    abortRef.current?.abort()

    setAnalyzing(true)
    setAnalyzeError(null)
    setStreamedMoves([])
    setSummary(null)
    setGameMeta(null)
    setMoveCoaching({})
    setCoachLoading(false)
    setCoachError(null)
    setAnalyzedCount(0)
    setTrackLatest(true)
    setCurrentIndex(-1)
    setFromCache(false)

    // Capture moves and summary to trigger coaching after stream
    const collectedMovesRef = { current: [] }
    const collectedSummaryRef = { current: null }
    const collectedMetaRef = { current: null }

    abortRef.current = analyzeGameStream({
      pgn: game.pgn,
      depth,
      playerColor,
      onMeta: (meta) => {
        setGameMeta(meta)
        collectedMetaRef.current = meta
        if (typeof meta.total_moves === 'number') {
          setTotalMoves(meta.total_moves)
        }
      },
      onMove: (move) => {
        setStreamedMoves(prev => {
          const updated = [...prev, move]
          collectedMovesRef.current = updated
          return updated
        })
        setAnalyzedCount(c => c + 1)
      },
      onSummary: (s) => {
        setSummary(s)
        collectedSummaryRef.current = s
      },
      onDone: async () => {
        setAnalyzing(false)
        setTrackLatest(false)
        // Auto-generate per-move coaching
        const moves = collectedMovesRef.current
        const summ = collectedSummaryRef.current
        if (moves.length > 0 && pgnHash) {
          const analysis = {
            ...(collectedMetaRef.current || {}),
            white: game.white,
            black: game.black,
            result: game.result,
            moves,
            summary: summ,
          }
          setCoachLoading(true)
          try {
            const res = await getPerMoveCoaching(pgnHash, analysis, playerColor, username)
            const map = {}
            res.data.coaching.forEach(c => { map[c.move_index] = c.feedback })
            setMoveCoaching(map)
            setCoachError(null)
          } catch (err) {
            const detail = err?.response?.data?.detail || err?.message || 'Coaching failed'
            setCoachError(detail)
          } finally {
            setCoachLoading(false)
          }
        }
      },
      onError: (msg) => {
        setAnalyzeError(msg)
        setAnalyzing(false)
      },
    })
  }

  // While streaming, if trackLatest is on, auto-advance board to latest analyzed move
  useEffect(() => {
    if (trackLatest && analyzing && streamedMoves.length > 0) {
      setCurrentIndex(streamedMoves.length - 1)
    }
  }, [streamedMoves.length, trackLatest, analyzing])

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, maxNavigableIndex))
  }, [maxNavigableIndex])

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), [])

  const handleMoveClick = useCallback((index) => {
    setTrackLatest(false)  // user took manual control
    setCurrentIndex(index)
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
    if (e.key === 'ArrowLeft') {
      setTrackLatest(false)
      setCurrentIndex(i => Math.max(-1, i - 1))
    } else if (e.key === 'ArrowRight') {
      setTrackLatest(false)
      setCurrentIndex(i => Math.min(maxNavigableIndex, i + 1))
    }
  }, [maxNavigableIndex])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Build full analysis object for coaching — works for both live and cached analyses
  const fullAnalysis = (summary && streamedMoves.length > 0) ? {
    ...(gameMeta || {}),
    white: game.white,
    black: game.black,
    result: game.result,
    moves: streamedMoves,
    summary,
  } : null

  // Manually re-request per-move coaching (e.g. after cache load with no coaching yet)
  const handleRequestCoaching = async () => {
    if (!fullAnalysis || !pgnHash) return
    setCoachLoading(true)
    setCoachError(null)
    try {
      const res = await getPerMoveCoaching(pgnHash, fullAnalysis, playerColor, username)
      const map = {}
      res.data.coaching.forEach(c => { map[c.move_index] = c.feedback })
      setMoveCoaching(map)
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Coaching failed'
      setCoachError(detail)
    } finally {
      setCoachLoading(false)
    }
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        No game selected.{' '}
        <button onClick={() => navigate('/')} className="ml-2 text-blue-400 underline">Go back</button>
      </div>
    )
  }

  const opponent = playerColor === 'white' ? game.black : game.white
  const progressPercent = totalMoves > 0 ? Math.round((analyzedCount / totalMoves) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => { abortRef.current?.abort(); navigate('/') }}
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
          >
            ← Back
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <span className="text-2xl">♛</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white truncate">
              {game.white} vs {game.black}
            </h1>
            <p className="text-xs text-gray-400 truncate">
              {game.result} · {game.time_control} · {prettifyOpening(gameMeta?.opening || game.opening) || 'Unknown opening'}
            </p>
          </div>
          {/* Depth + Analyze */}
          <div className="flex items-center gap-2">
            {fromCache && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-800/50 border border-emerald-600 text-emerald-400">
                ✓ Cached
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-400">Depth</label>
              <select
                value={depth}
                onChange={e => setDepth(Number(e.target.value))}
                disabled={analyzing}
                className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none disabled:opacity-50"
              >
                {[10, 12, 15, 18, 20, 22].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 ml-2 mr-2">
              <label className="text-xs text-gray-400">Arrows</label>
              <button
                onClick={() => setShowArrows(!showArrows)}
                className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-all
                  ${showArrows
                    ? 'bg-emerald-900/30 border-emerald-600 text-emerald-400'
                    : 'bg-gray-800 border-gray-600 text-gray-400'}`}
              >
                {showArrows ? 'ON' : 'OFF'}
              </button>
            </div>
            <button
              onClick={analyzing ? () => { abortRef.current?.abort(); setAnalyzing(false) } : handleAnalyze}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-xl transition-all
                ${analyzing
                  ? 'bg-red-700 hover:bg-red-600'
                  : 'bg-blue-600 hover:bg-blue-500'}`}
            >
              {analyzing ? '■ Stop' : streamedMoves.length > 0 ? 'Re-analyze' : '▶ Analyze'}
            </button>
            {/* Practice Mistakes button — shown after analysis */}
            {!analyzing && streamedMoves.length > 0 && (
              <button
                onClick={() => navigate('/practice', {
                  state: {
                    moves: streamedMoves,
                    pgn: game.pgn,
                    playerColor,
                    username,
                    gameInfo: { white: game.white, black: game.black, result: game.result, time_control: game.time_control, opening: game.opening },
                  }
                })}
                className="px-4 py-2 text-white text-sm font-semibold rounded-xl transition-all bg-purple-700 hover:bg-purple-600 flex items-center gap-1.5"
                title="Practice finding best moves from your mistakes"
              >
                🎯 Practice
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {analyzing && (
          <div className="max-w-7xl mx-auto px-6 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {analyzedCount} / {totalMoves} moves
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Error */}
      {analyzeError && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">{analyzeError}</div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Left: Board column */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {/* Opponent label */}
            <div className="flex items-center gap-2 px-1 ml-7">
              <div className={`w-4 h-4 rounded-sm flex-shrink-0 ${playerColor === 'white' ? 'bg-gray-700 border border-gray-500' : 'bg-gray-200'}`} />
              <span className="text-sm text-gray-300 font-medium truncate">{opponent}</span>
            </div>

            {/* Eval Bar + Board row */}
            <div className="flex gap-2">
              <EvalBar evalScore={currentEval} playerColor={playerColor} />

              {/* Board */}
              <div className="w-[520px] rounded-xl overflow-hidden border border-gray-700 shadow-2xl relative">
                {bestLinePreview && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-emerald-900/90 border border-emerald-600 rounded-full text-[11px] text-emerald-300 font-medium pointer-events-none">
                    Previewing best line
                  </div>
                )}
                <Chessboard
                  key={currentIndex}
                  options={{
                    id: `analysis-board-${playerColor}`,
                    position: boardPosition,
                    boardOrientation: playerColor,
                    allowDragging: false,
                    boardStyle: { borderRadius: '0' },
                    darkSquareStyle: { backgroundColor: '#4a7c59' },
                    lightSquareStyle: { backgroundColor: '#f0d9b5' },
                    squareStyles: bestLinePreview ? {} : highlightSquares,
                    arrows: analysisArrows,
                  }}
                />
              </div>
            </div>{/* end eval+board row */}

            {/* Player label */}
            <div className="flex items-center gap-2 px-1 ml-7">
              <div className={`w-4 h-4 rounded-sm flex-shrink-0 ${playerColor === 'white' ? 'bg-gray-200' : 'bg-gray-700 border border-gray-500'}`} />
              <span className="text-sm text-gray-300 font-medium truncate">{username || (playerColor === 'white' ? game.white : game.black)}</span>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-1.5 bg-gray-900 rounded-xl p-1.5 border border-gray-700">
                <NavButton onClick={() => { setTrackLatest(false); setBestLinePreview(null); setCurrentIndex(-1) }} label="⟨⟨" title="Start" />
                <NavButton onClick={() => { setTrackLatest(false); setBestLinePreview(null); setCurrentIndex(i => Math.max(-1, i - 1)) }} label="⟨" title="Previous (←)" />
                <div className="flex-1 text-center text-xs text-gray-400">
                  {currentIndex < 0
                    ? <span className="text-gray-500">Start position</span>
                    : <span>Move {currentMove?.move_number} <span className="font-mono text-white font-semibold">{currentMove?.move_san}</span></span>
                  }
                </div>
                <NavButton onClick={() => { setTrackLatest(false); setBestLinePreview(null); setCurrentIndex(i => Math.min(maxNavigableIndex, i + 1)) }} label="⟩" title="Next (→)" />
                <NavButton onClick={() => { setTrackLatest(false); setBestLinePreview(null); setCurrentIndex(maxNavigableIndex) }} label="⟩⟩" title="End" />
              </div>

            {/* Move classification badge */}
            {currentMove && currentMove.classification && (
              <div className="flex items-center gap-2 px-1 ml-7">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${CLASSIFICATION_BADGE[currentMove.classification]?.color || 'bg-gray-700'}`}>
                  {CLASSIFICATION_BADGE[currentMove.classification]?.label}
                </span>
                {currentMove.best_move_san && currentMove.classification !== 'best' && (
                  <span className="text-xs text-gray-400">
                    Best: <span className="font-mono text-emerald-400 font-semibold">{currentMove.best_move_san}</span>
                  </span>
                )}
                <span className="ml-auto">
                  {currentEval !== null && (
                    <span className={`text-xs font-mono font-bold ${currentEval >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {currentEval >= 9000 ? 'M+' : currentEval <= -9000 ? 'M-' : `${(currentEval / 100).toFixed(2)}`}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Track latest toggle when streaming */}
            {analyzing && streamedMoves.length > 0 && (
              <button
                onClick={() => setTrackLatest(v => !v)}
                className={`text-xs py-1.5 px-3 rounded-lg border transition-colors text-center ml-7
                  ${trackLatest
                    ? 'border-blue-500 text-blue-400 bg-blue-900/20'
                    : 'border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-400'}`}
              >
                {trackLatest ? '📍 Tracking latest move' : '📌 Track latest'}
              </button>
            )}

            {/* No analysis yet hint */}
            {!analyzing && streamedMoves.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-1 ml-7">
                ← Use arrow keys or click moves to navigate
              </div>
            )}

            {/* AI Coach Panel — left column, below the board controls */}
            {(streamedMoves.length > 0 || Object.keys(moveCoaching).length > 0) && (
              <div className="w-[548px]">
                <CoachPanel
                  moveCoaching={moveCoaching}
                  currentIndex={currentIndex}
                  currentMove={currentMove}
                  playerColor={playerColor}
                  loading={coachLoading}
                  error={coachError}
                  hasAnalysis={!!fullAnalysis}
                  onRequest={handleRequestCoaching}
                  analyzing={analyzing}
                  onPreviewBestLineStep={setBestLinePreview}
                  onResetBestLinePreview={() => setBestLinePreview(null)}
                />
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* Pre-analysis CTA */}
            {!analyzing && streamedMoves.length === 0 && (
              <div className="bg-gray-900 rounded-xl border border-gray-700 border-dashed p-8 text-center">
                <div className="text-4xl mb-3">♟</div>
                <h3 className="text-gray-200 font-semibold mb-1">Ready to analyze</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Click <span className="text-blue-400 font-medium">▶ Analyze</span> in the header to start Stockfish analysis.
                </p>
                <button
                  onClick={handleAnalyze}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all"
                >
                  ▶ Analyze Game
                </button>
              </div>
            )}

            {/* Summary stats */}
            {(summary || (analyzing && streamedMoves.length > 0)) && (
              <SummaryPanel
                summary={summary}
                streamedMoves={streamedMoves}
                playerColor={playerColor}
                analyzing={analyzing}
                opening={prettifyOpening(gameMeta?.opening || game?.opening)}
              />
            )}

            {/* Eval Chart */}
            {streamedMoves.length > 0 && (
              <EvalChart
                moves={streamedMoves}
                currentIndex={currentIndex}
                onMoveClick={handleMoveClick}
              />
            )}

            {/* Move Table */}
            {streamedMoves.length > 0 && (
              <div ref={moveTableRef}>
                <MoveTable
                  moves={streamedMoves}
                  currentIndex={currentIndex}
                  playerColor={playerColor}
                  onMoveClick={handleMoveClick}
                />
              </div>
            )}

            {/* Practice Mistakes CTA — shown after analysis completes */}
            {!analyzing && streamedMoves.length > 0 && (
              <PracticeCTA
                moves={streamedMoves}
                playerColor={playerColor}
                onOpen={() => navigate('/practice', {
                  state: {
                    moves: streamedMoves,
                    pgn: game.pgn,
                    playerColor,
                    username,
                    gameInfo: { white: game.white, black: game.black, result: game.result, time_control: game.time_control, opening: game.opening },
                  }
                })}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function NavButton({ onClick, label, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 flex items-center justify-center bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-gray-300 transition-all text-sm"
    >
      {label}
    </button>
  )
}

function SummaryPanel({ summary, streamedMoves, playerColor, analyzing, opening }) {
  // Live-compute stats from streamed moves if summary not yet received
  const playerMoves = streamedMoves.filter(m => m.color === playerColor)
  const liveBlunders = playerMoves.filter(m => m.classification === 'blunder').length
  const liveMistakes = playerMoves.filter(m => m.classification === 'mistake').length
  const liveInaccuracies = playerMoves.filter(m => m.classification === 'inaccuracy').length
  const liveGood = playerMoves.filter(m => m.classification === 'good').length
  const liveExcellent = playerMoves.filter(m => m.classification === 'excellent').length
  const liveBest = playerMoves.filter(m => m.classification === 'best').length

  const liveAccuracy = playerMoves.length > 0
    ? Math.round(playerMoves.reduce((acc, m) =>
        acc + ({ best: 100, excellent: 90, good: 75, inaccuracy: 50, mistake: 25, blunder: 0 }[m.classification] || 0), 0
      ) / playerMoves.length)
    : null

  const liveAvgCpLoss = playerMoves.length > 0
    ? playerMoves.reduce((acc, m) => acc + (m.cp_loss || 0), 0) / playerMoves.length
    : null

  const liveElo = estimateElo(liveAvgCpLoss)

  const s = summary || {
    blunders: liveBlunders,
    mistakes: liveMistakes,
    inaccuracies: liveInaccuracies,
    good_moves: liveGood,
    excellent_moves: liveExcellent,
    best_moves: liveBest,
    accuracy: liveAccuracy,
    estimated_elo: liveElo,
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Game Summary {analyzing && <span className="text-blue-400 normal-case font-normal text-xs ml-1">(live)</span>}
        </h3>
        <div className="flex items-center gap-3">
          {s.estimated_elo && (
            <div className="text-right">
              <div className="text-xl font-bold text-purple-400">~{s.estimated_elo}</div>
              <div className="text-xs text-gray-500">Est. ELO</div>
            </div>
          )}
          {s.accuracy !== null && (
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-400">{s.accuracy}%</div>
              <div className="text-xs text-gray-500">Accuracy</div>
            </div>
          )}
        </div>
      </div>

      {/* Opening badge */}
      {opening && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-800/60 rounded-lg border border-gray-700">
          <span className="text-base">♟</span>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Opening</div>
            <div className="text-sm text-gray-200 font-semibold">{opening}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatBadge label="Blunders" value={s.blunders} color="text-red-400" />
        <StatBadge label="Mistakes" value={s.mistakes} color="text-orange-400" />
        <StatBadge label="Inaccuracies" value={s.inaccuracies} color="text-yellow-400" />
        <StatBadge label="Good" value={s.good_moves} color="text-lime-400" />
        <StatBadge label="Excellent" value={s.excellent_moves} color="text-green-400" />
        <StatBadge label="Best" value={s.best_moves} color="text-emerald-400" />
      </div>
    </div>
  )
}

function StatBadge({ label, value, color }) {
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2 text-center">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function PracticeCTA({ moves, playerColor, onOpen }) {
  const mistakes = moves.filter(m => m.classification === 'blunder' || m.classification === 'mistake')
  const myMistakes = mistakes.filter(m => m.color === playerColor)
  const theirMistakes = mistakes.filter(m => m.color !== playerColor)

  if (mistakes.length === 0) return null

  return (
    <div className="bg-gray-900 rounded-xl border border-purple-800/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">🎯</span>
        <div>
          <h3 className="text-white font-semibold">Learn from Mistakes</h3>
          <p className="text-gray-400 text-xs">
            Practice finding the best moves from {mistakes.length} critical position{mistakes.length !== 1 ? 's' : ''} in this game
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 text-sm">
        {myMistakes.length > 0 && (
          <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5">
            <span className="text-red-400 font-bold text-xs">??</span>
            <span className="text-gray-300">Your mistakes: <span className="text-white font-semibold">{myMistakes.length}</span></span>
          </div>
        )}
        {theirMistakes.length > 0 && (
          <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5">
            <span className="text-purple-400 font-bold text-xs">??</span>
            <span className="text-gray-300">Opponent's: <span className="text-white font-semibold">{theirMistakes.length}</span></span>
          </div>
        )}
      </div>

      <button
        onClick={onOpen}
        className="w-full py-2.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
      >
        🎯 Start Mistake Practice
      </button>
    </div>
  )
}
