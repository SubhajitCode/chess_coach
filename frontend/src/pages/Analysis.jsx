import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import {
  analyzeGameStream,
  getPerMoveCoaching,
  getCachedPerMoveCoaching,
  getCachedAnalysis,
  getGameOverview,
  computePgnHash,
  analyzePosition,
  fetchEngines,
} from '../api/chess'
import MoveTable from '../components/MoveTable'
import EvalBar from '../components/EvalBar'
import EvalChart from '../components/EvalChart'
import CoachPanel from '../components/CoachPanel'
import DeviationPanel from '../components/DeviationPanel'

const CLASSIFICATION_BADGE = {
  best: { label: 'Best', color: 'bg-emerald-600' },
  excellent: { label: 'Excellent', color: 'bg-green-600' },
  good: { label: 'Good', color: 'bg-lime-600' },
  inaccuracy: { label: 'Inaccuracy', color: 'bg-yellow-600' },
  mistake: { label: 'Mistake', color: 'bg-orange-600' },
  blunder: { label: 'Blunder', color: 'bg-red-600' },
}

const ACCURACY_ELO_MAP = [
  [98, 2800],
  [95, 2500],
  [90, 2150],
  [85, 1850],
  [80, 1600],
  [75, 1450],
  [70, 1300],
  [65, 1150],
  [60, 1000],
  [50, 750],
  [40, 500],
  [25, 300],
]

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const LAST_SESSION_STORAGE_KEY = 'chess_last_analysis_v1'

function estimateElo(avgCpLoss, accuracy) {
  if (accuracy == null && avgCpLoss == null) return null

  let eloFromAcc = 1200
  if (accuracy != null) {
    const acc = Math.max(0, Math.min(100, accuracy))
    if (acc >= ACCURACY_ELO_MAP[0][0]) {
      eloFromAcc = ACCURACY_ELO_MAP[0][1]
    } else if (acc <= ACCURACY_ELO_MAP[ACCURACY_ELO_MAP.length - 1][0]) {
      eloFromAcc = ACCURACY_ELO_MAP[ACCURACY_ELO_MAP.length - 1][1]
    } else {
      for (let i = 0; i < ACCURACY_ELO_MAP.length - 1; i++) {
        const [topAcc, topElo] = ACCURACY_ELO_MAP[i]
        const [botAcc, botElo] = ACCURACY_ELO_MAP[i + 1]
        if (acc <= topAcc && acc >= botAcc) {
          const span = topAcc - botAcc
          const progress = span === 0 ? 0 : (acc - botAcc) / span
          eloFromAcc = botElo + (topElo - botElo) * progress
          break
        }
      }
    }
  }

  if (avgCpLoss != null && !Number.isNaN(avgCpLoss)) {
    const cappedCp = Math.min(200.0, Math.max(0, avgCpLoss))
    const eloFromAcpl = Math.max(300, Math.min(2800, 2600 - cappedCp * 16.0))
    const finalElo = accuracy != null ? Math.round(eloFromAcc * 0.75 + eloFromAcpl * 0.25) : Math.round(eloFromAcpl)
    return Math.max(300, Math.min(2850, finalElo))
  }

  return Math.max(300, Math.min(2850, Math.round(eloFromAcc)))
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
  const username = state?.username || null
  const initialPlayerColor = state?.playerColor || (
    username && game?.black?.toLowerCase() === username.toLowerCase() ? 'black' : 'white'
  )

  const [playerColor, setPlayerColor] = useState(initialPlayerColor)
  const [streamedMoves, setStreamedMoves] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [summary, setSummary] = useState(null)
  const [gameMeta, setGameMeta] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [analyzedCount, setAnalyzedCount] = useState(0)

  // Engine selection state
  const [selectedEngine, setSelectedEngine] = useState('stockfish')
  const [availableEngines, setAvailableEngines] = useState([])

  // Coaching
  const [moveCoaching, setMoveCoaching] = useState({}) // map: move_index -> feedback string for all moves
  const [coachProfile, setCoachProfile] = useState(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState(null)
  const [gameOverview, setGameOverview] = useState(null) // { overview, key_moments[] }
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState(null)
  const [pgnHash, setPgnHash] = useState(null)

  const [depth, setDepth] = useState(18)
  const [showArrows, setShowArrows] = useState(true)
  const [trackLatest, setTrackLatest] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  // Temporary board preview when hovering best-line steps in CoachPanel
  const [bestLinePreview, setBestLinePreview] = useState(null) // { fen, from, to }
  // Right-panel tab: 'moves' | 'coach' | 'explore'
  const [rightTab, setRightTab] = useState('moves')

  // ── Deviation explorer state ──
  const [exploreMode, setExploreMode] = useState(false)
  // Each entry: { fen, moveUci, moveSan, moveSummary, color, evalBefore, evalAfter, cpLoss, classification,
  //               bestMoveUci, bestMoveSan, bestLineSan, bestLineUci, deviationBestLineSan, deviationBestLineUci, fenAfter }
  const [exploreStack, setExploreStack] = useState([])
  const [exploreAnalyzing, setExploreAnalyzing] = useState(false)

  const abortRef = useRef(null)
  const moveTableRef = useRef(null)
  const previewActiveRef = useRef(false) // true while BestLineViewer is in preview mode
  const trackLatestRef = useRef(true)

  const clearPreviewState = useCallback(() => {
    setBestLinePreview(null)
    previewActiveRef.current = false
  }, [])

  const switchRightTab = useCallback((tab) => {
    clearPreviewState()
    setRightTab(tab)
  }, [clearPreviewState])

  const setTrackLatestState = useCallback((value) => {
    trackLatestRef.current = value
    setTrackLatest(value)
  }, [])

  useEffect(() => {
    if (!game?.pgn) {
      navigate('/', { replace: true })
    }
  }, [game?.pgn, navigate])

  useEffect(() => {
    if (!game?.pgn) return

    const resumePayload = {
      game: {
        pgn: game.pgn,
        white: game.white,
        black: game.black,
        result: game.result,
        opening: game.opening,
        time_control: game.time_control,
        end_time: game.end_time,
        source: game.source,
        white_rating: game.white_rating,
        black_rating: game.black_rating,
        pgn_hash: pgnHash || game.pgn_hash || null,
      },
      playerColor,
      username: username || null,
      savedAt: new Date().toISOString(),
    }

    localStorage.setItem(LAST_SESSION_STORAGE_KEY, JSON.stringify(resumePayload))
  }, [
    game?.black,
    game?.black_rating,
    game?.end_time,
    game?.opening,
    game?.pgn,
    game?.pgn_hash,
    game?.result,
    game?.source,
    game?.time_control,
    game?.white,
    game?.white_rating,
    pgnHash,
    playerColor,
    username,
  ])

  // On mount, try to load a cached analysis for this game's PGN
  useEffect(() => {
    if (!game?.pgn) return
    let cancelled = false
    ;(async () => {
      try {
        const hash = await computePgnHash(game.pgn)
        if (cancelled) return
        setPgnHash(hash)
        const cached = await getCachedAnalysis(hash)
        if (cancelled || !cached) return
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
        const analysisForOverview = {
          opening: openingFromPgn || game.opening || null,
          time_control: game.time_control || null,
          white: game.white,
          black: game.black,
          result: game.result,
          moves: cached.moves || [],
          summary: cachedSummary || null,
        }

        setFromCache(true)
        setTrackLatestState(false)
        setCurrentIndex(-1)  // start at beginning

        // Also try loading cached per-move coaching
        const coachRes = await getCachedPerMoveCoaching(hash)
        if (!cancelled) {
          setCoachProfile(coachRes?.profile_used || null)
        }
        if (!cancelled && coachRes?.coaching?.length) {
          const coaching = coachRes.coaching
          if (coaching.length >= (cached.moves || []).length) {
            const map = {}
            coaching.forEach(c => { map[c.move_index] = c.feedback })
            setMoveCoaching(map)
            switchRightTab('coach')
          }
        }

        if (!cancelled && (cached.moves || []).length > 0) {
          setOverviewLoading(true)
          setOverviewError(null)
          try {
            const overviewRes = await getGameOverview(hash, analysisForOverview, playerColor, username)
            if (!cancelled) {
              setGameOverview(overviewRes?.data?.overview || null)
            }
          } catch (err) {
            if (!cancelled) {
              const detail = err?.response?.data?.detail || err?.message || 'Game overview failed'
              setOverviewError(detail)
            }
          } finally {
            if (!cancelled) setOverviewLoading(false)
          }
        }
      } catch {
        // Keep the page usable if cache bootstrap fails.
      }
    })()
    return () => { cancelled = true }
  }, [
    game?.black,
    game?.opening,
    game?.pgn,
    game?.result,
    game?.time_control,
    game?.white,
    playerColor,
    setTrackLatestState,
    switchRightTab,
    username,
  ])

  const parsedGameMoves = useMemo(() => parsePgnMoves(game?.pgn), [game?.pgn])
  const boardMoves = streamedMoves.length > 0 ? streamedMoves : parsedGameMoves
  const totalMoves = gameMeta?.total_moves ?? parsedGameMoves.length
  const maxNavigableIndex = Math.max(-1, boardMoves.length - 1)
  const activeIndex = currentIndex > maxNavigableIndex ? maxNavigableIndex : currentIndex

  // The FEN to show on the board
  const currentFen = useMemo(() => {
    if (activeIndex < 0 || boardMoves.length === 0) {
      return START_FEN
    }

    const ch = new Chess()
    const moveCount = Math.min(activeIndex + 1, boardMoves.length)

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
  }, [activeIndex, boardMoves])
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

    const activeMove = activeIndex >= 0 ? boardMoves[activeIndex] : boardMoves[0]
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
    if (isMistake && activeIndex >= 0 && activeMove.move_uci && activeMove.move_uci.length >= 4) {
      arrows.push({
        startSquare: activeMove.move_uci.slice(0, 2),
        endSquare:   activeMove.move_uci.slice(2, 4),
        color: 'rgba(239, 68, 68, 0.8)',
      })
    }

    return arrows
  }, [showArrows, activeIndex, boardMoves, bestLinePreview])

  const currentMove = streamedMoves[activeIndex] || parsedGameMoves[activeIndex] || null
  const currentEval = currentMove?.eval_after ?? null
  const hasMoveCoaching = Object.keys(moveCoaching).length > 0

  // Highlighted squares for the last move played
  const highlightSquares = currentMove
    ? {
        [currentMove.move_uci?.slice(0, 2)]: { backgroundColor: 'rgba(255, 255, 100, 0.4)' },
        [currentMove.move_uci?.slice(2, 4)]: { backgroundColor: 'rgba(255, 255, 100, 0.4)' },
      }
    : {}

  useEffect(() => {
    fetchEngines()
      .then((data) => setAvailableEngines(data.engines || []))
      .catch(() => {})
  }, [])

  const handleAnalyze = () => {
    // Cancel any in-flight stream
    abortRef.current?.abort()

    clearPreviewState()
    setAnalyzing(true)
    setAnalyzeError(null)
    setStreamedMoves([])
    setSummary(null)
    setGameMeta(null)
    setMoveCoaching({})
    setCoachProfile(null)
    setCoachLoading(false)
    setCoachError(null)
    setGameOverview(null)
    setOverviewLoading(false)
    setOverviewError(null)
    setAnalyzedCount(0)
    setTrackLatestState(true)
    setCurrentIndex(-1)
    setFromCache(false)
    setExploreMode(false)
    setExploreStack([])
    setRightTab('moves')

    // Capture moves and summary to trigger coaching after stream
    const collectedMovesRef = { current: [] }
    const collectedSummaryRef = { current: null }
    const collectedMetaRef = { current: null }

    abortRef.current = analyzeGameStream({
      pgn: game.pgn,
      depth,
      playerColor,
      engine: selectedEngine,
      onMeta: (meta) => {
        setGameMeta(meta)
        collectedMetaRef.current = meta
      },
      onMove: (move) => {
        let nextLength = 0
        setStreamedMoves(prev => {
          const updated = [...prev, move]
          collectedMovesRef.current = updated
          nextLength = updated.length
          return updated
        })
        if (trackLatestRef.current) {
          setCurrentIndex(nextLength - 1)
        }
        setAnalyzedCount(c => c + 1)
      },
      onSummary: (s) => {
        setSummary(s)
        collectedSummaryRef.current = s
      },
      onDone: async () => {
        setAnalyzing(false)
        setTrackLatestState(false)
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
          setOverviewLoading(true)
          setOverviewError(null)
          const [perMoveResult, overviewResult] = await Promise.allSettled([
            getPerMoveCoaching(pgnHash, analysis, playerColor, username),
            getGameOverview(pgnHash, analysis, playerColor, username),
          ])

          if (perMoveResult.status === 'fulfilled') {
            const map = {}
            perMoveResult.value?.data?.coaching?.forEach(c => { map[c.move_index] = c.feedback })
            setMoveCoaching(map)
            setCoachProfile(perMoveResult.value?.data?.profile_used || null)
            setCoachError(null)
            switchRightTab('coach')
          } else {
            const err = perMoveResult.reason
            const detail = err?.response?.data?.detail || err?.message || 'Coaching failed'
            setCoachError(detail)
          }

          if (overviewResult.status === 'fulfilled') {
            setGameOverview(overviewResult.value?.data?.overview || null)
            setOverviewError(null)
          } else {
            const err = overviewResult.reason
            const detail = err?.response?.data?.detail || err?.message || 'Game overview failed'
            setOverviewError(detail)
          }

          setCoachLoading(false)
          setOverviewLoading(false)
        }
      },
      onError: (msg) => {
        setAnalyzeError(msg)
        setAnalyzing(false)
        setTrackLatestState(false)
      },
    })
  }

  // Cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), [])

  const handleMoveClick = useCallback((index) => {
    setTrackLatestState(false)
    clearPreviewState()
    setCurrentIndex(index)
    // Avoid jumping to the Coach tab when clicking moves in the Moves tab.
    // Keep the user on the current tab and just update the eval/chart pointer.
    // Only ensure the Coach tab remains visible if the user is already viewing it.
    if (hasMoveCoaching && rightTab === 'coach') {
      // coach remains visible; CoachPanel can react to currentIndex via props
    }
  }, [clearPreviewState, hasMoveCoaching, setTrackLatestState, rightTab])

  const handleKeyDown = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
    // Don't interfere while BestLineViewer has taken over arrow keys for step navigation
    if (previewActiveRef.current) return
    if (e.key === 'ArrowLeft') {
      setTrackLatestState(false)
      clearPreviewState()
      setCurrentIndex(i => Math.max(-1, i - 1))
    } else if (e.key === 'ArrowRight') {
      setTrackLatestState(false)
      clearPreviewState()
      setCurrentIndex(i => Math.min(maxNavigableIndex, i + 1))
    }
  }, [clearPreviewState, maxNavigableIndex, setTrackLatestState])

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

  const handleRequestOverview = async () => {
    if (!fullAnalysis || !pgnHash) return
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const res = await getGameOverview(pgnHash, fullAnalysis, playerColor, username)
      setGameOverview(res?.data?.overview || null)
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Game overview failed'
      setOverviewError(detail)
    } finally {
      setOverviewLoading(false)
    }
  }

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
      setCoachProfile(res.data.profile_used || null)
      switchRightTab('coach')
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Coaching failed'
      setCoachError(detail)
    } finally {
      setCoachLoading(false)
    }
  }

  // ── Deviation explorer handlers ──

  // The FEN the board is at when explore mode starts (or after last deviation)
  const exploreBoardFen = useMemo(() => {
    if (!exploreMode) return null
    if (exploreStack.length === 0) return currentFen
    return exploreStack[exploreStack.length - 1].fenAfter ?? currentFen
  }, [exploreMode, exploreStack, currentFen])

  const handleEnterExplore = useCallback(() => {
    clearPreviewState()
    setExploreStack([])
    setExploreMode(true)
    setRightTab('explore')
  }, [clearPreviewState])

  const handleExitExplore = useCallback(() => {
    setExploreMode(false)
    setExploreStack([])
    clearPreviewState()
    setRightTab(hasMoveCoaching ? 'coach' : 'moves')
  }, [clearPreviewState, hasMoveCoaching])

  const handleExploreUndo = useCallback(() => {
    clearPreviewState()
    setExploreStack(prev => prev.slice(0, -1))
  }, [clearPreviewState])

  const handleExploreReset = useCallback(() => {
    clearPreviewState()
    setExploreStack([])
  }, [clearPreviewState])

  // v5 API: onPieceDrop receives { piece, sourceSquare, targetSquare }
  const handleExplorePieceDrop = useCallback(async ({ piece, sourceSquare, targetSquare }) => {
    // piece.pieceType = e.g. "bN" (black knight), "wP" (white pawn)
    const pieceCode = piece?.pieceType || ''
    const isPawn = pieceCode[1]?.toUpperCase() === 'P'
    const isPromotion = isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1')
    const moveUci = `${sourceSquare}${targetSquare}${isPromotion ? 'q' : ''}`

    // Validate with chess.js
    const fenToPlayOn = exploreStack.length === 0 ? currentFen : (exploreStack[exploreStack.length - 1].fenAfter ?? currentFen)
    const ch = new Chess(fenToPlayOn)
    const result = ch.move({ from: sourceSquare, to: targetSquare, promotion: isPromotion ? 'q' : undefined })
    if (!result) return false  // illegal move — reject drop

    // Kick off Stockfish analysis
    setExploreAnalyzing(true)
    try {
      const res = await analyzePosition(fenToPlayOn, moveUci, 12, 5)
      const d = res.data
      setExploreStack(prev => [...prev, {
        fen: fenToPlayOn,
        moveUci,
        moveSan: d.move_san || result.san,
        moveSummary: d.move_summary || null,
        color: d.color || (ch.turn() === 'w' ? 'black' : 'white'), // color who played = opposite of current turn
        evalBefore: d.eval_before,
        evalAfter: d.eval_after,
        cpLoss: d.cp_loss,
        classification: d.classification,
        bestMoveUci: d.best_move_uci,
        bestMoveSan: d.best_move_san,
        bestLineSan: d.best_line_san || [],
        bestLineUci: d.best_line_uci || [],
        deviationBestLineSan: d.deviation_best_line_san || [],
        deviationBestLineUci: d.deviation_best_line_uci || [],
        fenAfter: d.fen_after || ch.fen(),
      }])
    } catch {
      // On error, still accept the move on the board (show position without analysis)
      setExploreStack(prev => [...prev, {
        fen: fenToPlayOn,
        moveUci,
        moveSan: result.san,
        moveSummary: null,
        color: ch.turn() === 'w' ? 'black' : 'white',
        fenAfter: ch.fen(),
        bestLineSan: [], bestLineUci: [],
        deviationBestLineSan: [], deviationBestLineUci: [],
      }])
    } finally {
      setExploreAnalyzing(false)
    }
    return true  // accept the drop
  }, [currentFen, exploreStack])

  if (!game?.pgn) {
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
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">
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
            {/* Engine Selector */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-400">Engine</label>
              <select
                value={selectedEngine}
                onChange={e => setSelectedEngine(e.target.value)}
                disabled={analyzing}
                className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none disabled:opacity-50 font-medium"
                title="Select Analysis Engine"
              >
                {availableEngines.length > 0 ? (
                  availableEngines.map(eng => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name || eng.id}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="stockfish">⚡ Stockfish 16</option>
                    <option value="human_model">🧠 Human AI (1400–1800)</option>
                    <option value="hybrid">🔮 Hybrid Coach</option>
                  </>
                )}
              </select>
            </div>
            {selectedEngine === 'stockfish' && (
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
            )}
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
        <div className="flex-shrink-0 px-6 pt-2 max-w-7xl w-full mx-auto">
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">{analyzeError}</div>
        </div>
      )}

      <main className="flex-1 overflow-hidden min-h-0">
        <div className="h-full max-w-7xl mx-auto px-6 py-4 flex gap-6">
          {/* Left: Board column — fixed width, scrollable only if viewport is tiny */}
          <div className="flex flex-col gap-2 flex-shrink-0 overflow-y-auto">
            {/* Opponent label */}
            <div className="flex items-center gap-2 px-1 ml-7">
              <div className={`w-4 h-4 rounded-sm flex-shrink-0 ${playerColor === 'white' ? 'bg-gray-700 border border-gray-500' : 'bg-gray-200'}`} />
              <span className="text-sm text-gray-300 font-medium truncate">{opponent}</span>
            </div>

            {/* Eval Bar + Board row */}
            <div className="flex gap-2">
              <EvalBar evalScore={currentEval} />

              {/* Board */}
              <div className="w-[520px] rounded-xl overflow-hidden border border-gray-700 shadow-2xl relative">
                {bestLinePreview && !exploreMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-emerald-900/90 border border-emerald-600 rounded-full text-[11px] text-emerald-300 font-medium pointer-events-none">
                    Previewing best line
                  </div>
                )}
                {exploreMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-purple-900/90 border border-purple-600 rounded-full text-[11px] text-purple-300 font-medium pointer-events-none">
                    {exploreStack.length === 0 ? '🔍 Explore — drag a piece' : `🔍 Exploring (+${exploreStack.length})`}
                  </div>
                )}
                <Chessboard
                  options={{
                    id: `analysis-board-${playerColor}`,
                    position: exploreMode
                      ? (bestLinePreview?.fen?.split(' ')[0] ?? (exploreBoardFen?.split(' ')[0] ?? boardPosition))
                      : boardPosition,
                    boardOrientation: playerColor,
                    allowDragging: exploreMode && !bestLinePreview,
                    onPieceDrop: exploreMode ? handleExplorePieceDrop : undefined,
                    animationDuration: bestLinePreview ? 0 : 200,
                    boardStyle: { borderRadius: '0' },
                    darkSquareStyle: { backgroundColor: exploreMode ? '#3d6b4f' : '#4a7c59' },
                    lightSquareStyle: { backgroundColor: exploreMode ? '#d4c5a0' : '#f0d9b5' },
                    squareStyles: bestLinePreview ? {} : (exploreMode ? {} : highlightSquares),
                    arrows: exploreMode ? [] : analysisArrows,
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
                <NavButton onClick={() => { setTrackLatestState(false); clearPreviewState(); setCurrentIndex(-1) }} label="⟨⟨" title="Start" />
                <NavButton onClick={() => { setTrackLatestState(false); clearPreviewState(); setCurrentIndex(i => Math.max(-1, i - 1)) }} label="⟨" title="Previous (←)" />
                <div className="flex-1 text-center text-xs text-gray-400">
                  {activeIndex < 0
                    ? <span className="text-gray-500">Start position</span>
                    : <span>Move {currentMove?.move_number} <span className="font-mono text-white font-semibold">{currentMove?.move_san}</span></span>
                  }
                </div>
                <NavButton onClick={() => { setTrackLatestState(false); clearPreviewState(); setCurrentIndex(i => Math.min(maxNavigableIndex, i + 1)) }} label="⟩" title="Next (→)" />
                <NavButton onClick={() => { setTrackLatestState(false); clearPreviewState(); setCurrentIndex(maxNavigableIndex) }} label="⟩⟩" title="End" />
              </div>

            {/* Explore Mode toggle button */}
            {!analyzing && streamedMoves.length > 0 && (
              <button
                onClick={exploreMode ? handleExitExplore : handleEnterExplore}
                className={`text-xs py-1.5 px-3 rounded-lg border transition-colors text-center ml-7
                  ${exploreMode
                    ? 'border-purple-500 text-purple-300 bg-purple-900/30 hover:bg-purple-900/50'
                    : 'border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300'}`}
              >
                {exploreMode ? '✕ Exit Explore' : '🔍 Explore this position'}
              </button>
            )}

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
                onClick={() => {
                  const nextValue = !trackLatestRef.current
                  setTrackLatestState(nextValue)
                  if (nextValue && streamedMoves.length > 0) {
                    clearPreviewState()
                    setCurrentIndex(streamedMoves.length - 1)
                  }
                }}
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
          </div>

          {/* Right panel — tabbed, fills remaining width, scrolls independently */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden min-h-0">

            {/* Tab bar — only shown after analysis */}
            {streamedMoves.length > 0 && (
              <div className="flex-shrink-0 flex items-center gap-1 border-b border-gray-700 mb-0">
                <RightTabButton
                  active={rightTab === 'moves'}
                  onClick={() => switchRightTab('moves')}
                >
                  📋 Moves
                </RightTabButton>
                <RightTabButton
                  active={rightTab === 'coach'}
                  onClick={() => switchRightTab('coach')}
                  badge={hasMoveCoaching}
                >
                  🎓 Coach
                </RightTabButton>
                {exploreMode && (
                  <RightTabButton
                    active={rightTab === 'explore'}
                    onClick={() => switchRightTab('explore')}
                  >
                    🔍 Explore
                  </RightTabButton>
                )}
              </div>
            )}

            {/* Scrollable tab content */}
            <div className="flex-1 overflow-y-auto min-h-0 py-4">

              {/* ── Moves tab ── */}
              {(rightTab === 'moves' || streamedMoves.length === 0) && (
                <div className="flex flex-col gap-4">
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

                  {/* AI game overview */}
                  {(streamedMoves.length > 0 || overviewLoading || overviewError || gameOverview) && (
                    <GameOverviewPanel
                      overview={gameOverview}
                      loading={overviewLoading}
                      error={overviewError}
                      onRetry={handleRequestOverview}
                    />
                  )}

                  {/* Summary stats */}
                  {(summary || (analyzing && streamedMoves.length > 0)) && (
                    <SummaryPanel
                      summary={summary}
                      streamedMoves={streamedMoves}
                      playerColor={playerColor}
                      onSelectColor={setPlayerColor}
                      whiteName={game?.white || 'White'}
                      blackName={game?.black || 'Black'}
                      analyzing={analyzing}
                      opening={prettifyOpening(gameMeta?.opening || game?.opening)}
                    />
                  )}

                  {/* Eval Chart */}
                  {streamedMoves.length > 0 && (
                    <EvalChart
                      moves={streamedMoves}
                      currentIndex={activeIndex}
                      onMoveClick={handleMoveClick}
                    />
                  )}

                  {/* Move Table */}
                  {streamedMoves.length > 0 && (
                    <div ref={moveTableRef}>
                      <MoveTable
                        moves={streamedMoves}
                        currentIndex={activeIndex}
                        onMoveClick={handleMoveClick}
                      />
                    </div>
                  )}

                  {/* Practice Mistakes CTA */}
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
              )}

              {/* ── Coach tab ── */}
              {rightTab === 'coach' && streamedMoves.length > 0 && (
                <CoachPanel
                  moveCoaching={moveCoaching}
                  currentIndex={activeIndex}
                  currentMove={currentMove}
                  playerColor={playerColor}
                  loading={coachLoading}
                  error={coachError}
                  hasAnalysis={!!fullAnalysis}
                  coachingProfile={coachProfile}
                  onRequest={handleRequestCoaching}
                  analyzing={analyzing}
                  onPreviewBestLineStep={setBestLinePreview}
                  onResetBestLinePreview={clearPreviewState}
                  onPreviewModeChange={(active) => { previewActiveRef.current = active }}
                />
              )}

              {/* ── Explore tab ── */}
              {rightTab === 'explore' && exploreMode && (
                <DeviationPanel
                  key={`explore-${currentIndex}-${exploreStack.length}`}
                  exploreStack={exploreStack}
                  analyzing={exploreAnalyzing}
                  playerColor={playerColor}
                  gameMoveNumber={currentMove?.move_number}
                  username={username}
                  onPreviewStep={setBestLinePreview}
                  onExitPreview={clearPreviewState}
                  onPreviewModeChange={(active) => { previewActiveRef.current = active }}
                  onUndo={handleExploreUndo}
                  onReset={handleExploreReset}
                  onExit={handleExitExplore}
                />
              )}

            </div>
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

function RightTabButton({ active, onClick, badge, children }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
      }`}
    >
      {children}
      {badge && !active && (
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      )}
    </button>
  )
}

function GameOverviewPanel({ overview, loading, error, onRetry }) {
  const keyMoments = overview?.key_moments || []
  const hasOverview = !!overview?.overview

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">AI Game Overview</h3>
        {loading && <span className="text-xs text-blue-400 animate-pulse">Generating…</span>}
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400 text-xs font-medium mb-1">Could not generate overview</p>
          <p className="text-red-300 text-xs opacity-90">{error}</p>
          <button
            onClick={onRetry}
            className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!error && loading && !hasOverview && (
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-3 bg-gray-700 rounded w-full" />
          <div className="h-3 bg-gray-700 rounded w-5/6" />
          <div className="h-3 bg-gray-700 rounded w-4/6" />
        </div>
      )}

      {hasOverview && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-200 leading-relaxed">{overview.overview}</p>
          {keyMoments.length > 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-950/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Step by step</div>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-300">
                {keyMoments.map((item, idx) => (
                  <li key={`${idx}-${item.slice(0, 24)}`} className="leading-relaxed">{item}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function computeSideStats(moves) {
  if (!moves || moves.length === 0) {
    return {
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0,
      good_moves: 0,
      excellent_moves: 0,
      best_moves: 0,
      accuracy: null,
      avgCpLoss: null,
      estimated_elo: null,
    }
  }

  const blunders = moves.filter(m => m.classification === 'blunder').length
  const mistakes = moves.filter(m => m.classification === 'mistake').length
  const inaccuracies = moves.filter(m => m.classification === 'inaccuracy').length
  const good = moves.filter(m => m.classification === 'good').length
  const excellent = moves.filter(m => m.classification === 'excellent').length
  const best = moves.filter(m => m.classification === 'best').length

  const accuracy = Math.round(
    moves.reduce((acc, m) =>
      acc + ({ best: 100, excellent: 90, good: 75, inaccuracy: 50, mistake: 25, blunder: 0 }[m.classification] || 0), 0
    ) / moves.length
  )

  const cappedCpLosses = moves.map(m => Math.min(200.0, Math.max(0, m.cp_loss || 0)))
  const avgCpLoss = cappedCpLosses.reduce((acc, cp) => acc + cp, 0) / moves.length
  const estimated_elo = estimateElo(avgCpLoss, accuracy)

  return {
    blunders,
    mistakes,
    inaccuracies,
    good_moves: good,
    excellent_moves: excellent,
    best_moves: best,
    accuracy,
    avgCpLoss: Math.round(avgCpLoss * 10) / 10,
    estimated_elo,
  }
}

function SummaryPanel({ summary, streamedMoves, playerColor, onSelectColor, whiteName = 'White', blackName = 'Black', analyzing, opening }) {
  const whiteMoves = streamedMoves.filter(m => m.color === 'white')
  const blackMoves = streamedMoves.filter(m => m.color === 'black')

  const whiteStats = computeSideStats(whiteMoves)
  const blackStats = computeSideStats(blackMoves)

  const activeStats = playerColor === 'white' ? whiteStats : blackStats
  const s = (summary && playerColor === (summary.player_color || playerColor)) ? summary : activeStats

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <span>📊 Performance & Elo Audit</span>
          {analyzing && <span className="text-blue-400 normal-case font-normal text-xs">(live evaluating with Stockfish)</span>}
        </h3>
        <span className="text-[11px] text-gray-400">Click a player to switch perspective</span>
      </div>

      {/* Dual Player Comparison Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* White Card */}
        <button
          onClick={() => onSelectColor && onSelectColor('white')}
          className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between gap-1.5 ${
            playerColor === 'white'
              ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/40'
              : 'bg-gray-800/60 border-gray-700 hover:bg-gray-800'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-300 flex-shrink-0" />
              <span className="text-xs font-bold text-gray-200 truncate">{whiteName}</span>
            </div>
            {playerColor === 'white' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-medium">Active</span>
            )}
          </div>
          <div className="flex items-baseline justify-between w-full mt-1">
            <div>
              <div className="text-xs text-gray-400 font-medium">Est. Elo</div>
              <div className="text-lg font-bold text-purple-400">
                {whiteStats.estimated_elo ? `~${whiteStats.estimated_elo}` : '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 font-medium">Accuracy</div>
              <div className="text-lg font-bold text-blue-400">
                {whiteStats.accuracy !== null ? `${whiteStats.accuracy}%` : '—'}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-400 flex items-center gap-2 pt-1 border-t border-gray-700/60">
            <span>{whiteStats.blunders} blunders</span>
            <span>·</span>
            <span>{whiteStats.mistakes} mistakes</span>
          </div>
        </button>

        {/* Black Card */}
        <button
          onClick={() => onSelectColor && onSelectColor('black')}
          className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between gap-1.5 ${
            playerColor === 'black'
              ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/40'
              : 'bg-gray-800/60 border-gray-700 hover:bg-gray-800'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-3 h-3 rounded-sm bg-gray-900 border border-gray-600 flex-shrink-0" />
              <span className="text-xs font-bold text-gray-200 truncate">{blackName}</span>
            </div>
            {playerColor === 'black' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-medium">Active</span>
            )}
          </div>
          <div className="flex items-baseline justify-between w-full mt-1">
            <div>
              <div className="text-xs text-gray-400 font-medium">Est. Elo</div>
              <div className="text-lg font-bold text-purple-400">
                {blackStats.estimated_elo ? `~${blackStats.estimated_elo}` : '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 font-medium">Accuracy</div>
              <div className="text-lg font-bold text-blue-400">
                {blackStats.accuracy !== null ? `${blackStats.accuracy}%` : '—'}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-400 flex items-center gap-2 pt-1 border-t border-gray-700/60">
            <span>{blackStats.blunders} blunders</span>
            <span>·</span>
            <span>{blackStats.mistakes} mistakes</span>
          </div>
        </button>
      </div>

      {/* Opening badge */}
      {opening && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700">
          <span className="text-sm">♟</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">Opening:</span>
            <span className="text-xs text-gray-200 font-semibold">{opening}</span>
          </div>
        </div>
      )}

      {/* Detailed Move Quality Breakdown for Active Player */}
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>{playerColor === 'white' ? whiteName : blackName} Move Distribution</span>
          <span className="text-gray-500 normal-case">{activeStats.total ? `${activeStats.total} moves` : ''}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBadge label="Blunders" value={s.blunders ?? activeStats.blunders} color="text-red-400" />
          <StatBadge label="Mistakes" value={s.mistakes ?? activeStats.mistakes} color="text-orange-400" />
          <StatBadge label="Inaccuracies" value={s.inaccuracies ?? activeStats.inaccuracies} color="text-yellow-400" />
          <StatBadge label="Good" value={s.good_moves ?? activeStats.good_moves} color="text-lime-400" />
          <StatBadge label="Excellent" value={s.excellent_moves ?? activeStats.excellent_moves} color="text-green-400" />
          <StatBadge label="Best" value={s.best_moves ?? activeStats.best_moves} color="text-emerald-400" />
        </div>
      </div>
    </div>
  )
}

function StatBadge({ label, value, color }) {
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2 text-center border border-gray-700/40">
      <div className={`text-lg font-bold ${color}`}>{value ?? 0}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
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
