import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import ReactMarkdown from 'react-markdown'
import { analyzePosition, getDeviationCoaching } from '../api/chess'
import EvalBar from '../components/EvalBar'

const BOARD_SIZE = 520
const MAX_ATTEMPTS = 3

const CLS_META = {
  blunder: { icon: '??', label: 'Blunder', color: 'text-red-400', bg: 'bg-red-950/50 border-red-800/60', dot: 'bg-red-500' },
  mistake: { icon: '?',  label: 'Mistake', color: 'text-orange-400', bg: 'bg-orange-950/50 border-orange-800/60', dot: 'bg-orange-500' },
}

/** Replay move_uci list to produce FEN before each move index. */
function buildFensBefore(moves) {
  const ch = new Chess()
  const fens = []
  for (const m of moves) {
    fens.push(ch.fen())
    const uci = m.move_uci
    if (uci && uci.length >= 4) {
      try {
        ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
      } catch { break }
    }
  }
  return fens
}

function buildFensAfter(moves) {
  const ch = new Chess()
  const fens = []
  for (const m of moves) {
    const uci = m.move_uci
    if (!uci || uci.length < 4) break
    try {
      ch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
      fens.push(ch.fen())
    } catch {
      break
    }
  }
  return fens
}

/** Convert UCI to readable English, e.g. e2e4 → "e2 → e4" */
function uciToReadable(uci) {
  if (!uci || uci.length < 4) return uci
  return `${uci.slice(0, 2).toUpperCase()} → ${uci.slice(2, 4).toUpperCase()}`
}

/**
 * Decode a UCI move list into human-readable steps and fenAfter for preview.
 * Returns [{ uci, from, to, san, fenAfter, isCapture, isCheck }]
 */
function decodeLine(fenBefore, uciList, limit = 6) {
  if (!fenBefore || !uciList?.length) return []
  try {
    const chess = new Chess(fenBefore)
    const steps = []
    for (const uci of uciList.slice(0, limit)) {
      if (!uci || uci.length < 4) break
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promo = uci[4] || undefined
      const piece = chess.get(from)
      const target = chess.get(to)

      const fenBeforeStep = chess.fen()
      const result = chess.move({ from, to, promotion: promo })
      if (!result) break

      const isCheck = chess.inCheck ? chess.inCheck() : (chess?.in_check ? chess.is_check() : false)
      const isMate = chess.isCheckmate ? chess.isCheckmate() : (chess?.is_checkmate ? chess.is_checkmate() : false)

      steps.push({
        uci,
        from,
        to,
        san: result.san,
        fenBefore: fenBeforeStep,
        fenAfter: chess.fen(),
        isCapture: !!target,
        isCheck: !!isCheck,
        isMate: !!isMate,
        evalBefore: null,
        evalAfter: null,
      })
    }
    return steps
  } catch {
    return []
  }
}

export default function Practice() {
  const rawLocation = useLocation()
  const navigate = useNavigate()
  // Allow passing a serialized state via query param for testing (fallback)
  const state = rawLocation.state ?? (() => {
    try {
      const s = new URLSearchParams(window.location.search).get('state')
      if (!s) return null
      return JSON.parse(decodeURIComponent(s))
    } catch {
      return null
    }
  })()


  const moves = useMemo(() => state?.moves ?? [], [state])
  const playerColor = state?.playerColor || 'white'
  const gameInfo = state?.gameInfo    || {}

  // 'all' | 'mine' | 'opponent'
  const defaultFilter = useMemo(() => {
    const mine = moves.filter(m => (m.classification === 'blunder' || m.classification === 'mistake') && m.color === playerColor).length
    return mine > 0 ? 'mine' : 'all'
  }, [moves, playerColor])

  const [filter, setFilter]           = useState(defaultFilter)
  const [step, setStep]               = useState(0)
  // phase: 'playing' | 'correct' | 'revealed'
  const [phase, setPhase]             = useState('playing')
  const [attempts, setAttempts]       = useState(0)
  const [hintsUsed, setHintsUsed]     = useState(0)  // 0 = none, 1 = piece, 2 = square
  const [streak, setStreak]           = useState(0)
  const [maxStreak, setMaxStreak]     = useState(0)
  const [solvedCount, setSolvedCount] = useState(0)
  const [done, setDone]               = useState(false)
  const [attemptedUci, setAttemptedUci] = useState(null)
  const [results, setResults]         = useState([]) // per puzzle: 'correct' | 'wrong' | 'skipped'
  const [shake, setShake]             = useState(false)
  const [reviewOffset, setReviewOffset] = useState(0)

  const fensBefore = useMemo(() => buildFensBefore(moves), [moves])
  const fensAfter = useMemo(() => buildFensAfter(moves), [moves])

  // Deep analysis settings for on-demand explanations
  const DEPTH_DEEP = 22
  const PV_LENGTH = 6

  // Cache explanations per global move index (originalIdx)
  const [explanations, setExplanations] = useState({}) // { [originalIdx]: { loading, error, text, depth, bestLineSan, bestLineUci, deviationBestLineSan, deviationBestLineUci } }

  // Preview state for showing engine line steps on the board
  const [bestLinePreview, setBestLinePreview] = useState(null) // { fen, from, to }
  const [bestLineSteps, setBestLineSteps] = useState([])
  const [bestLineIdx, setBestLineIdx] = useState(null)
  const [devLineSteps, setDevLineSteps] = useState([])
  const [devLineIdx, setDevLineIdx] = useState(null)
  const [arrowMode, setArrowMode] = useState('original') // 'original' | 'preview' | 'both'

  // Cached evals for review moves (keyed by reviewIndex)
  const [evalCache, setEvalCache] = useState({})

  const allMistakes = useMemo(() =>
    moves
      .map((m, idx) => ({ ...m, originalIdx: idx, fenBefore: fensBefore[idx] }))
      .filter(m => m.classification === 'blunder' || m.classification === 'mistake'),
    [moves, fensBefore]
  )

  const filtered = useMemo(() => {
    if (filter === 'mine')     return allMistakes.filter(m => m.color === playerColor)
    if (filter === 'opponent') return allMistakes.filter(m => m.color !== playerColor)
    return allMistakes
  }, [allMistakes, filter, playerColor])

  const resetPuzzleState = useCallback(() => {
    setStep(0); setPhase('playing'); setAttempts(0); setHintsUsed(0)
    setSolvedCount(0); setStreak(0); setDone(false); setAttemptedUci(null); setResults([]); setReviewOffset(0)
  }, [])

  const handleFilterChange = useCallback((nextFilter) => {
    setFilter(nextFilter)
    setStep(0)
    setPhase('playing')
    setAttempts(0)
    setHintsUsed(0)
    setSolvedCount(0)
    setStreak(0)
    setDone(false)
    setAttemptedUci(null)
    setResults([])
    setReviewOffset(0)
  }, [])

  const current = filtered[step]
  const showAnswer = phase === 'correct' || phase === 'revealed'
  const puzzlePositionIndex = current ? current.originalIdx - 1 : -1
  const reviewIndex = Math.max(-1, Math.min(moves.length - 1, puzzlePositionIndex + reviewOffset))
  const reviewMove = reviewIndex >= 0 ? moves[reviewIndex] : null
  const isPuzzlePosition = reviewIndex === puzzlePositionIndex
  const reviewFen = reviewIndex < 0 ? 'start' : (fensAfter[reviewIndex] || current?.fenBefore || 'start')

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }) => {
    if (phase !== 'playing' || !current) return false
    const uci = sourceSquare + targetSquare
    const bestUci = current.best_move_uci
    const isCorrect = bestUci && (uci === bestUci || uci === bestUci.slice(0, 4))
    setAttemptedUci(uci)

    if (isCorrect) {
      setPhase('correct')
      setSolvedCount(s => s + 1)
      setStreak(s => { const ns = s + 1; setMaxStreak(m => Math.max(m, ns)); return ns })
      setResults(r => [...r, 'correct'])
    } else {
      const next = attempts + 1
      setAttempts(next)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      if (next >= MAX_ATTEMPTS) {
        setPhase('revealed')
        setStreak(0)
        setResults(r => [...r, 'wrong'])
      }
      // else stay in 'playing' for retry
    }
    return true
  }, [phase, current, attempts])

  const handleHint = useCallback(() => setHintsUsed(h => Math.min(h + 1, 2)), [])

  const handleSkip = useCallback(() => {
    setPhase('revealed')
    setStreak(0)
    setResults(r => [...r, 'skipped'])
  }, [])

  const handleExplain = useCallback(async () => {
    if (!current) return
    const key = current.originalIdx
    setExplanations(prev => ({ ...prev, [key]: { loading: true, error: null, text: null, depth: DEPTH_DEEP } }))
    try {
      const res = await analyzePosition(current.fenBefore, current.move_uci, DEPTH_DEEP, PV_LENGTH)
      const d = res.data
      const payload = {
        fen_before: current.fenBefore,
        move_uci: current.move_uci,
        move_san: d.move_san || current.move_san || '',
        move_summary: d.move_summary || current.move_summary || '',
        player_color: playerColor,
        eval_before: d.eval_before,
        eval_after: d.eval_after,
        cp_loss: d.cp_loss,
        classification: d.classification,
        best_move_san: d.best_move_san || current.best_move_san || '',
        best_line_san: d.best_line_san || [],
        deviation_best_line_san: d.deviation_best_line_san || [],
        game_move_number: current.move_number,
      }
      const coachRes = await getDeviationCoaching(payload)
      const coachingText = coachRes?.data?.coaching ?? (coachRes?.data || '')
      setExplanations(prev => ({
        ...prev,
        [key]: {
          loading: false,
          error: null,
          text: coachingText,
          depth: DEPTH_DEEP,
          bestLineSan: d.best_line_san || [],
          bestLineUci: d.best_line_uci || [],
          deviationBestLineSan: d.deviation_best_line_san || [],
          deviationBestLineUci: d.deviation_best_line_uci || [],
          fenAfter: d.fen_after || null,
        },
      }))
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Explanation failed'
      setExplanations(prev => ({ ...prev, [key]: { loading: false, error: msg, text: null, depth: DEPTH_DEEP } }))
    }
  }, [current, playerColor])

  const handleNext = useCallback(() => {
    if (step + 1 >= filtered.length) {
      setDone(true)
    } else {
      setStep(s => s + 1)
      setPhase('playing')
      setAttempts(0)
      setHintsUsed(0)
      setAttemptedUci(null)
      setReviewOffset(0)
    }
  }, [step, filtered.length])

  const handleReviewPrev = useCallback(() => {
    setReviewOffset(offset => {
      const nextIndex = Math.max(-1, Math.min(moves.length - 1, puzzlePositionIndex + offset - 1))
      return nextIndex - puzzlePositionIndex
    })
  }, [moves.length, puzzlePositionIndex])

  const handleReviewNext = useCallback(() => {
    setReviewOffset(offset => {
      const nextIndex = Math.max(-1, Math.min(moves.length - 1, puzzlePositionIndex + offset + 1))
      return nextIndex - puzzlePositionIndex
    })
  }, [moves.length, puzzlePositionIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') {
        handleReviewPrev()
        e.preventDefault()
        return
      }
      if (e.key === 'ArrowRight') {
        handleReviewNext()
        e.preventDefault()
        return
      }
      if (e.key === 'Enter' && showAnswer && !done) {
        handleNext(); e.preventDefault()
      }
      if (e.key === 'h' && phase === 'playing' && hintsUsed < 2) handleHint()
      if (e.key === 's' && phase === 'playing') handleSkip()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showAnswer, done, phase, hintsUsed, handleNext, handleHint, handleSkip, handleReviewPrev, handleReviewNext])

  // Square highlight styles
  const squareStyles = useMemo(() => {
    if (!current) return {}
    const s = {}
    // hint 1 — highlight the piece to move
    if (hintsUsed >= 1 && current.best_move_uci && phase === 'playing') {
      s[current.best_move_uci.slice(0, 2)] = { backgroundColor: 'rgba(234,179,8,0.55)', borderRadius: '4px' }
    }
    // hint 2 — highlight destination
    if (hintsUsed >= 2 && current.best_move_uci && phase === 'playing') {
      s[current.best_move_uci.slice(2, 4)] = { backgroundColor: 'rgba(234,179,8,0.35)', borderRadius: '4px' }
    }
    if (phase === 'correct' && current.best_move_uci && isPuzzlePosition) {
      s[current.best_move_uci.slice(0, 2)] = { backgroundColor: 'rgba(34,197,94,0.6)' }
      s[current.best_move_uci.slice(2, 4)] = { backgroundColor: 'rgba(34,197,94,0.6)' }
    }
    if (phase === 'revealed' && isPuzzlePosition) {
      if (attemptedUci) {
        s[attemptedUci.slice(0, 2)] = { backgroundColor: 'rgba(239,68,68,0.4)' }
        s[attemptedUci.slice(2, 4)] = { backgroundColor: 'rgba(239,68,68,0.4)' }
      }
      if (current.best_move_uci) {
        s[current.best_move_uci.slice(0, 2)] = { backgroundColor: 'rgba(34,197,94,0.6)' }
        s[current.best_move_uci.slice(2, 4)] = { backgroundColor: 'rgba(34,197,94,0.6)' }
      }
    }
    return s
  }, [phase, current, attemptedUci, hintsUsed, isPuzzlePosition])

  const arrows = useMemo(() => {
    if (!current) return []

    const items = []

    // Determine the "original" move (played) and its arrow color
    let origUci = null
    let origColor = '#ef4444'
    if (isPuzzlePosition && current.move_uci && current.move_uci.length >= 4) {
      origUci = current.move_uci
      origColor = '#ef4444'
    } else if (reviewMove?.move_uci && reviewMove.move_uci.length >= 4) {
      origUci = reviewMove.move_uci
      origColor = reviewIndex === current.originalIdx ? '#ef4444' : 'rgba(148, 163, 184, 0.9)'
    }

    // If a best-line step preview is active, show preview and/or original based on arrowMode
    if (bestLinePreview) {
      if (arrowMode === 'preview' || arrowMode === 'both') {
        items.push({
          startSquare: bestLinePreview.from,
          endSquare: bestLinePreview.to,
          color: '#16a34a',
        })
      }
      if ((arrowMode === 'original' || arrowMode === 'both') && origUci) {
        items.push({
          startSquare: origUci.slice(0, 2),
          endSquare: origUci.slice(2, 4),
          color: origColor,
        })
      }
      return items
    }

    // No preview active — show original (unless arrowMode === 'preview')
    if (arrowMode !== 'preview' && origUci) {
      items.push({
        startSquare: origUci.slice(0, 2),
        endSquare: origUci.slice(2, 4),
        color: origColor,
      })
    }

    // Keep showing the best-move arrow when the answer is revealed (unchanged behavior)
    if (showAnswer && isPuzzlePosition && current.best_move_uci && current.best_move_uci.length >= 4) {
      items.push({
        startSquare: current.best_move_uci.slice(0, 2),
        endSquare: current.best_move_uci.slice(2, 4),
        color: '#22c55e',
      })
    }

    return items
  }, [showAnswer, current, isPuzzlePosition, reviewMove, reviewIndex, bestLinePreview, arrowMode])

  const reviewLabel = useMemo(() => {
    if (!current) return ''
    if (reviewIndex < 0) return 'Game start'
    if (isPuzzlePosition) return 'Before the mistake'
    if (!reviewMove?.move_uci) return `Move ${reviewMove?.move_number ?? reviewIndex + 1}`
    const sideLabel = reviewMove.color === playerColor ? 'You played' : 'Opponent played'
    const mistakeLabel = reviewIndex === current.originalIdx ? ' · Mistake move' : ''
    return `${sideLabel} ${reviewMove.san || reviewMove.move_summary || uciToReadable(reviewMove.move_uci)}${mistakeLabel}`
  }, [current, reviewIndex, isPuzzlePosition, reviewMove, playerColor])

  // Fetch and cache shallow eval for the review move when user navigates reviewIndex
  useEffect(() => {
    // If previewing best/dev line, those evals take precedence so don't fetch review eval
    if (bestLineIdx !== null || devLineIdx !== null) return
    if (reviewIndex < 0 || !reviewMove) return
    if (evalCache[reviewIndex]) return // already cached

    let cancelled = false
    const DEPTH_PREVIEW = 12
    ;(async () => {
      try {
        const res = await analyzePosition(reviewFen, reviewMove.move_uci, DEPTH_PREVIEW, 0)
        if (cancelled) return
        setEvalCache(prev => ({ ...prev, [reviewIndex]: { eval_before: res.data.eval_before, eval_after: res.data.eval_after } }))
      } catch (err) {
        // ignore
      }
    })()

    return () => { cancelled = true }
  }, [reviewIndex, reviewMove, reviewFen, bestLineIdx, devLineIdx, evalCache])

  const mineCount = allMistakes.filter(m => m.color === playerColor).length
  const oppCount  = allMistakes.filter(m => m.color !== playerColor).length

  if (!state || moves.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        No practice data.{' '}
        <button onClick={() => navigate(-1)} className="ml-2 text-blue-400 underline">Go back</button>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        filter={filter} playerColor={playerColor}
        mineCount={mineCount} oppCount={oppCount}
        setFilter={setFilter} onBack={() => navigate(-1)}
      />
    )
  }

  if (done) {
    return (
      <DoneSummary
        solved={solvedCount} total={filtered.length}
        maxStreak={maxStreak} results={results}
        onRetry={resetPuzzleState} onBack={() => navigate(-1)}
      />
    )
  }

  const cls = CLS_META[current.classification] || CLS_META.mistake
  const isMyMistake = current.color === playerColor

  return (
    <>
      {/* Shake + board glow keyframes */}
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-6px)}
          30%{transform:translateX(6px)}
          45%{transform:translateX(-5px)}
          60%{transform:translateX(5px)}
          75%{transform:translateX(-3px)}
          90%{transform:translateX(3px)}
        }
        @keyframes correctFlash {
          0%{box-shadow:0 0 0 0 rgba(34,197,94,0)}
          40%{box-shadow:0 0 32px 8px rgba(34,197,94,0.5)}
          100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}
        }
        .board-shake { animation: shake 0.5s ease-in-out; }
        .board-correct { animation: correctFlash 0.8s ease-out; }
      `}</style>

      <div className="min-h-screen bg-[#0d1117] text-gray-100 flex flex-col select-none">

        {/* ── Top bar ── */}
        <header className="flex-shrink-0 px-5 py-2.5 flex items-center gap-3 border-b border-gray-800/70 bg-gray-900/60">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white text-sm transition-colors">
            ← Back
          </button>
          <div className="w-px h-4 bg-gray-700" />

          {/* Game info */}
          <span className="text-xs text-gray-500 truncate hidden sm:block max-w-[180px]">
            {gameInfo.white} vs {gameInfo.black}
          </span>

          {/* Progress dots — centered */}
          <div className="flex items-center gap-1.5 flex-1 justify-center">
            {filtered.map((_, i) => {
              const r = results[i]
              const isActive = i === step
              const isPast   = i < step
              return (
                <div key={i} className={`rounded-full transition-all duration-300 ${
                  isActive ? 'w-3 h-3 bg-white ring-2 ring-white/30'
                  : isPast && r === 'correct'  ? 'w-2 h-2 bg-emerald-500'
                  : isPast && r === 'wrong'    ? 'w-2 h-2 bg-red-500'
                  : isPast && r === 'skipped'  ? 'w-2 h-2 bg-gray-500'
                  : 'w-2 h-2 bg-gray-700'
                }`} />
              )
            })}
          </div>

          {/* Streak */}
          {streak > 0 && (
            <div className="flex items-center gap-1 text-orange-400 font-bold text-sm animate-pulse">
              🔥 {streak}
            </div>
          )}

          {/* Filter pills */}
          <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 border border-gray-700">
            {[
              { key: 'all',      label: `All (${allMistakes.length})` },
              { key: 'mine',     label: `Mine (${mineCount})` },
              { key: 'opponent', label: `Opp (${oppCount})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => handleFilterChange(key)}
                className={`px-2.5 py-1 text-xs rounded-md transition-all font-medium ${
                  filter === key ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >{label}</button>
            ))}
          </div>

          <span className="text-xs text-gray-600 font-mono">{step + 1}/{filtered.length}</span>
        </header>

        {/* ── Main layout ── */}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="grid gap-8 items-start w-full max-w-screen-2xl mx-auto grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">

            {/* Board column */}
            <div className="flex flex-col items-center gap-3 flex-shrink-0">

              {/* "to move" indicator */}
              <div className="flex items-center gap-2 w-full">
                <div className={`w-4 h-4 rounded-sm border flex-shrink-0 ${
                  current.color === 'white' ? 'bg-gray-100 border-gray-300' : 'bg-gray-900 border-gray-500'
                }`} />
                <span className="text-sm font-medium text-gray-300 capitalize">{current.color} to move</span>
                {phase === 'playing' && (
                  <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls.color} ${cls.bg}`}>
                    {cls.icon} {cls.label}
                  </span>
                )}
              </div>

              {/* Board */}
              <div className="w-full" style={{ maxWidth: 'min(900px, calc(100vw - 420px))' }}>
                <div className="flex items-start gap-4 aspect-square">
                  <div className="w-14 flex-shrink-0 h-full flex items-center justify-center">
                    <EvalBar evalScore={(() => {
                      // compute eval for current view: preview step -> dev step -> cached review eval -> review move -> current
                      if (bestLineIdx !== null && bestLineSteps?.[bestLineIdx]?.evalAfter != null) return bestLineSteps[bestLineIdx].evalAfter
                      if (devLineIdx !== null && devLineSteps?.[devLineIdx]?.evalAfter != null) return devLineSteps[devLineIdx].evalAfter
                      const cached = evalCache?.[reviewIndex]
                      if (cached?.eval_after != null) return cached.eval_after
                      if (cached?.eval_before != null) return cached.eval_before
                      if (reviewMove?.eval_after != null) return reviewMove.eval_after
                      if (reviewMove?.eval_before != null) return reviewMove.eval_before
                      if (current?.eval_after != null) return current.eval_after
                      if (current?.eval_before != null) return current.eval_before
                      return null
                    })()} />
                  </div>
                  <div className={`flex-1 aspect-square rounded-xl overflow-hidden border shadow-2xl transition-all duration-300 mx-auto ${shake ? 'border-red-600 board-shake' : phase === 'correct' ? 'border-emerald-500 board-correct' : phase === 'revealed' ? 'border-gray-600' : 'border-gray-700'}`}>
                    <Chessboard
                      options={{
                        id: 'practice-board',
                        position: (bestLinePreview?.fen ?? reviewFen).split(' ')[0] || 'start',
                        boardOrientation: current.color,
                        allowDragging: phase === 'playing' && isPuzzlePosition,
                        boardStyle: { borderRadius: '0' },
                        darkSquareStyle:  { backgroundColor: '#4a7c59' },
                        lightSquareStyle: { backgroundColor: '#f0d9b5' },
                        squareStyles,
                        arrows,
                        onPieceDrop: handlePieceDrop,
                      }}
                    />
                  </div>
                </div>
              </div>
              {/* Inline engine preview controls (preview best / deviation lines on board) */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-[11px] text-gray-500 mr-1">Show arrows:</span>
                  <button onClick={() => setArrowMode('original')} className={`px-2 py-1 text-xs rounded ${arrowMode === 'original' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300'}`}>Original</button>
                  <button onClick={() => setArrowMode('preview')} className={`px-2 py-1 text-xs rounded ${arrowMode === 'preview' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300'}`}>Blunder</button>
                  <button onClick={() => setArrowMode('both')} className={`px-2 py-1 text-xs rounded ${arrowMode === 'both' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-300'}`}>Both</button>
                </div>
                {explanations[current.originalIdx]?.bestLineUci?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const uciList = explanations[current.originalIdx].bestLineUci || []
                        const steps = decodeLine(current.fenBefore, uciList, 8)
                        setBestLineSteps(steps)
                        if (steps.length) { setBestLineIdx(0); setBestLinePreview({ fen: steps[0].fenAfter, from: steps[0].from, to: steps[0].to }) }

                        // Fetch shallow evals for each preview step (cached in steps)
                        try {
                          const DEPTH_PREVIEW = 12
                          const promises = steps.map((s, i) => {
                            const fenBefore = s.fenBefore || (i === 0 ? current.fenBefore : (steps[i - 1]?.fenAfter))
                            return analyzePosition(fenBefore, s.uci, DEPTH_PREVIEW, 1)
                              .then(res => ({ i, evalBefore: res.data.eval_before, evalAfter: res.data.eval_after }))
                              .catch(() => null)
                          })
                          const results = await Promise.all(promises)
                          setBestLineSteps(prev => prev.map((p, idx) => {
                            const r = results.find(r => r && r.i === idx)
                            return r ? { ...p, evalBefore: r.evalBefore ?? p.evalBefore, evalAfter: r.evalAfter ?? p.evalAfter } : p
                          }))
                        } catch (e) {
                          // ignore
                        }
                      }}
                      className="px-3 py-1 text-xs rounded bg-gray-800 text-gray-200"
                    >Preview engine best line</button>
                    <button
                      onClick={() => { if (bestLineIdx > 0) { const ni = bestLineIdx - 1; setBestLineIdx(ni); const s = bestLineSteps[ni]; setBestLinePreview({ fen: s.fenAfter, from: s.from, to: s.to }) } }}
                      disabled={!bestLineSteps?.length || bestLineIdx === null}
                      className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40"
                    >‹</button>
                    <div className="text-sm font-mono text-gray-200">
                      {bestLineSteps?.length ? (bestLineSteps[bestLineIdx]?.san ?? '') : ''}
                    </div>
                    <button
                      onClick={() => { if (!bestLineSteps?.length) return; if (bestLineIdx === null) { setBestLineIdx(0); setBestLinePreview({ fen: bestLineSteps[0].fenAfter, from: bestLineSteps[0].from, to: bestLineSteps[0].to }) } else if (bestLineIdx < bestLineSteps.length - 1) { const ni = bestLineIdx + 1; setBestLineIdx(ni); const s = bestLineSteps[ni]; setBestLinePreview({ fen: s.fenAfter, from: s.from, to: s.to }) } }}
                      disabled={!bestLineSteps?.length}
                      className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40"
                    >›</button>
                    <button onClick={() => { setBestLinePreview(null); setBestLineIdx(null); setBestLineSteps([]) }} className="px-2 py-1 text-xs rounded bg-gray-800">Stop</button>
                  </div>
                )}

                {explanations[current.originalIdx]?.deviationBestLineUci?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const uciList = explanations[current.originalIdx].deviationBestLineUci || []
                        const startFen = explanations[current.originalIdx].fenAfter || current.fenBefore
                        const steps = decodeLine(startFen, uciList, 8)
                        setDevLineSteps(steps)
                        if (steps.length) { setDevLineIdx(0); setBestLinePreview({ fen: steps[0].fenAfter, from: steps[0].from, to: steps[0].to }) }

                        try {
                          const DEPTH_PREVIEW = 12
                          const promises = steps.map((s, i) => {
                            const fenBefore = s.fenBefore || (i === 0 ? startFen : (steps[i - 1]?.fenAfter))
                            return analyzePosition(fenBefore, s.uci, DEPTH_PREVIEW, 1)
                              .then(res => ({ i, evalBefore: res.data.eval_before, evalAfter: res.data.eval_after }))
                              .catch(() => null)
                          })
                          const results = await Promise.all(promises)
                          setDevLineSteps(prev => prev.map((p, idx) => {
                            const r = results.find(r => r && r.i === idx)
                            return r ? { ...p, evalBefore: r.evalBefore ?? p.evalBefore, evalAfter: r.evalAfter ?? p.evalAfter } : p
                          }))
                        } catch (e) {
                          // ignore
                        }
                      }}
                      className="px-3 py-1 text-xs rounded bg-gray-800 text-gray-200"
                    >Preview continuation after played move</button>
                    <button
                      onClick={() => { if (devLineIdx > 0) { const ni = devLineIdx - 1; setDevLineIdx(ni); const s = devLineSteps[ni]; setBestLinePreview({ fen: s.fenAfter, from: s.from, to: s.to }) } }}
                      disabled={!devLineSteps?.length || devLineIdx === null}
                      className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40"
                    >‹</button>
                    <div className="text-sm font-mono text-gray-200">
                      {devLineSteps?.length ? (devLineSteps[devLineIdx]?.san ?? '') : ''}
                    </div>
                    <button
                      onClick={() => { if (!devLineSteps?.length) return; if (devLineIdx === null) { setDevLineIdx(0); setBestLinePreview({ fen: devLineSteps[0].fenAfter, from: devLineSteps[0].from, to: devLineSteps[0].to }) } else if (devLineIdx < devLineSteps.length - 1) { const ni = devLineIdx + 1; setDevLineIdx(ni); const s = devLineSteps[ni]; setBestLinePreview({ fen: s.fenAfter, from: s.from, to: s.to }) } }}
                      disabled={!devLineSteps?.length}
                      className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40"
                    >›</button>
                    <button onClick={() => { setBestLinePreview(null); setDevLineIdx(null); setDevLineSteps([]) }} className="px-2 py-1 text-xs rounded bg-gray-800">Stop</button>
                  </div>
                )}
              </div>

              {/* Move number label */}
              <div className="flex w-full justify-between items-center px-1 gap-3">
                <span className="text-xs text-gray-600 font-mono">Move {current.move_number}</span>
                <span className="text-[11px] text-gray-500 truncate text-right">{reviewLabel}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 w-full">
                <button
                  onClick={handleReviewPrev}
                  disabled={reviewIndex <= -1}
                  className="py-2 text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev move
                </button>
                <button
                  onClick={() => setReviewOffset(0)}
                  disabled={isPuzzlePosition}
                  className="py-2 text-xs font-medium text-gray-200 border border-gray-600 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Puzzle position
                </button>
                <button
                  onClick={handleReviewNext}
                  disabled={reviewIndex >= moves.length - 1}
                  className="py-2 text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next move →
                </button>
              </div>

              <div className="flex w-full justify-between items-center px-1 text-[11px] text-gray-600">
                <span>{isMyMistake ? '● Your mistake puzzle' : '● Opponent mistake puzzle'}</span>
                <span>{isPuzzlePosition ? 'Drag to solve' : 'Review only'}</span>
              </div>
            </div>

            {/* Info panel */}
            <div className="flex flex-col gap-4" style={{ width: 300 }}>

              {/* Classification + context */}
              <div className={`px-4 py-3 rounded-xl border ${cls.bg}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-2xl font-black leading-none ${cls.color}`}>{cls.icon}</span>
                  <span className={`font-bold text-base ${cls.color}`}>{cls.label}</span>
                  <span className="ml-auto text-xs text-gray-500 capitalize">
                    {isMyMistake ? 'Your mistake' : 'Opponent mistake'}
                  </span>
                </div>
                <p className="text-gray-400 text-xs">
                  Move {current.move_number} · {current.color === 'white' ? 'White' : 'Black'} to play
                  {current.cp_loss > 0 && <> · <span className="text-red-400">~{Math.round(current.cp_loss)} cp lost</span></>}
                </p>
              </div>

              {/* Puzzle prompt / feedback */}
              {phase === 'playing' && (
                <div className="space-y-3">
                  <p className="text-lg font-semibold text-white leading-snug">
                    {attempts === 0
                      ? 'What was the best move here?'
                      : attempts === 1
                      ? 'Not quite — try again!'
                      : 'Last chance — find the best move!'}
                  </p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    The red arrow shows the move that was actually played. Use the board navigation to step backward or forward and see how the position changed.
                  </p>
                  {/* Attempt pips */}
                  <div className="flex gap-1.5">
                    {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                      <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${
                        i < attempts ? 'bg-red-500' : 'bg-gray-700'
                      }`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-600">
                    {isPuzzlePosition ? 'Drag a piece on the board to make your move.' : 'Return to Puzzle position to try your move.'}
                  </p>
                </div>
              )}

              {phase === 'correct' && (
                <div className="px-4 py-4 bg-emerald-950/50 border border-emerald-700/60 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">✓</span>
                    <span className="text-emerald-300 font-bold text-lg">Correct!</span>
                    {streak > 1 && <span className="text-orange-400 text-sm ml-1">🔥 {streak}</span>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-emerald-400/90">
                      <span className="font-mono font-semibold text-emerald-300">{current.best_move_san}</span>
                      {' '}({uciToReadable(current.best_move_uci)}) was the best move.
                    </p>
                    {current.move_summary && (
                      <p className="text-xs text-gray-500 italic">
                        What was played: {current.move_summary}
                      </p>
                    )}
                    {current.cp_loss > 0 && (
                      <p className="text-xs text-gray-500">
                        The actual move lost <span className="text-red-400">{Math.round(current.cp_loss)} centipawns</span> compared to best play.
                      </p>
                    )}
                  </div>

                  {/* Explain / AI coaching (also available in Correct view) */}
                  <div className="mt-3">
                    {explanations[current.originalIdx]?.text ? (
                      <div className="rounded-lg border border-purple-800/40 bg-purple-950/20 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-400 mb-2">
                          🎓 AI Explanation (depth {explanations[current.originalIdx].depth})
                        </div>

                        {/* Engine lines (best continuation and deviation continuation) */}
                        {(explanations[current.originalIdx].bestLineSan?.length > 0 || explanations[current.originalIdx].deviationBestLineSan?.length > 0) && (
                          <div className="rounded-lg border border-gray-700/40 bg-gray-950/60 p-3 mb-3">
                            {explanations[current.originalIdx].bestLineSan?.length > 0 && (
                              <div className="mb-2">
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">Engine best line (from this position)</div>
                                <div className="text-sm font-mono text-gray-200 mt-1">
                                  {explanations[current.originalIdx].bestLineSan.join(' → ')}
                                </div>
                              </div>
                            )}
                            {explanations[current.originalIdx].deviationBestLineSan?.length > 0 && (
                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">Best continuation after the played move</div>
                                <div className="text-sm font-mono text-gray-200 mt-1">
                                  {explanations[current.originalIdx].deviationBestLineSan.join(' → ')}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="prose prose-invert prose-sm max-w-none text-gray-300 prose-strong:text-gray-200 prose-p:my-1">
                          <ReactMarkdown>{explanations[current.originalIdx].text}</ReactMarkdown>
                        </div>
                        <button
                          onClick={() => { setExplanations(prev => { const n = { ...prev }; delete n[current.originalIdx]; return n }) }}
                          className="mt-2 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                        >
                          ↺ Clear explanation
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <button
                            onClick={handleExplain}
                            disabled={explanations[current.originalIdx]?.loading}
                            className="w-full py-2 text-sm font-semibold rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white transition-colors"
                          >
                            {explanations[current.originalIdx]?.loading ? 'Analyzing…' : 'Explain why this was a mistake'}
                          </button>
                        </div>
                        {explanations[current.originalIdx]?.error && <p className="text-xs text-red-400 mt-2">{explanations[current.originalIdx].error}</p>}
                        <p className="text-[11px] text-gray-500 mt-2">Explanations are generated on-demand using a deeper engine search and an AI; may take a few seconds.</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {phase === 'revealed' && (
                <div className="px-4 py-4 bg-gray-800/60 border border-gray-700 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💡</span>
                    <span className="text-gray-200 font-semibold">Solution</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-300">
                      Best move:{' '}
                      <span className="font-mono font-bold text-emerald-400">{current.best_move_san}</span>
                      {' '}<span className="text-gray-600 text-xs">({uciToReadable(current.best_move_uci)})</span>
                    </p>
                    <p className="text-xs text-gray-500">Green arrow shows the best move. Red arrow shows what was actually played.</p>
                    {current.move_summary && (
                      <p className="text-xs text-gray-600 italic">
                        What happened: {current.move_summary}
                      </p>
                    )}
                    {current.cp_loss > 0 && (
                      <p className="text-xs text-gray-500">
                        The played move lost <span className="text-red-400">{Math.round(current.cp_loss)} cp</span>.
                      </p>
                    )}
                  </div>

                  {/* Explain / AI coaching */}
                  <div className="mt-3">
                    {explanations[current.originalIdx]?.text ? (
                      <div className="rounded-lg border border-purple-800/40 bg-purple-950/20 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-400 mb-2">
                          🎓 AI Explanation (depth {explanations[current.originalIdx].depth})
                        </div>

                        {/* Engine lines (best continuation and deviation continuation) */}
                        {(explanations[current.originalIdx].bestLineSan?.length > 0 || explanations[current.originalIdx].deviationBestLineSan?.length > 0) && (
                          <div className="rounded-lg border border-gray-700/40 bg-gray-950/60 p-3 mb-3">
                            {explanations[current.originalIdx].bestLineSan?.length > 0 && (
                              <div className="mb-2">
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">Engine best line (from this position)</div>
                                <div className="text-sm font-mono text-gray-200 mt-1">
                                  {explanations[current.originalIdx].bestLineSan.join(' → ')}
                                </div>
                              </div>
                            )}
                            {explanations[current.originalIdx].deviationBestLineSan?.length > 0 && (
                              <div>
                                <div className="text-[11px] text-gray-500 uppercase font-semibold">Best continuation after the played move</div>
                                <div className="text-sm font-mono text-gray-200 mt-1">
                                  {explanations[current.originalIdx].deviationBestLineSan.join(' → ')}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="prose prose-invert prose-sm max-w-none text-gray-300 prose-strong:text-gray-200 prose-p:my-1">
                          <ReactMarkdown>{explanations[current.originalIdx].text}</ReactMarkdown>
                        </div>
                        <button
                          onClick={() => setExplanations(prev => { const n = { ...prev }; delete n[current.originalIdx]; return n })}
                          className="mt-2 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                        >
                          ↺ Clear explanation
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <button
                            onClick={handleExplain}
                            disabled={explanations[current.originalIdx]?.loading}
                            className="w-full py-2 text-sm font-semibold rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white transition-colors"
                          >
                            {explanations[current.originalIdx]?.loading ? 'Analyzing…' : 'Explain why this was a mistake'}
                          </button>
                        </div>
                        {explanations[current.originalIdx]?.error && <p className="text-xs text-red-400 mt-2">{explanations[current.originalIdx].error}</p>}
                        <p className="text-[11px] text-gray-500 mt-2">Explanations are generated on-demand using a deeper engine search and an AI; may take a few seconds.</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Hint / Skip (only while playing) */}
              {phase === 'playing' && (
                <div className="flex gap-2">
                  <button onClick={handleHint} disabled={hintsUsed >= 2}
                    className="flex-1 py-2 text-xs font-medium text-yellow-400/80 border border-yellow-800/40 bg-yellow-950/20 rounded-lg hover:bg-yellow-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {hintsUsed === 0 ? '💡 Hint (piece)' : hintsUsed === 1 ? '💡 Hint (square)' : '💡 No hints left'}
                  </button>
                  <button onClick={handleSkip}
                    className="flex-1 py-2 text-xs text-gray-500 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Skip →
                  </button>
                </div>
              )}

              {/* Next button */}
              {showAnswer && (
                <button onClick={handleNext}
                  className="w-full py-3 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors text-sm"
                >
                  {step + 1 >= filtered.length ? '🏁 See Results' : 'Next Puzzle →'}
                </button>
              )}

              {/* Keyboard hint */}
              <p className="text-[11px] text-gray-700 text-center">
                {showAnswer ? '←/→ review moves · Enter for next puzzle' : '←/→ review moves · H = hint · S = skip'}
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ filter, mineCount, oppCount, setFilter, onBack }) {
  const other = filter === 'mine' && oppCount > 0 ? 'opponent' : filter === 'opponent' && mineCount > 0 ? 'mine' : null
  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center text-center px-6">
      <div className="text-6xl mb-4">🏆</div>
      <h2 className="text-2xl font-bold text-white mb-2">Nothing to practice here!</h2>
      <p className="text-gray-400 mb-6">
        {filter === 'mine' ? 'You had no blunders or mistakes — great game!'
         : filter === 'opponent' ? 'Your opponent had no blunders or mistakes.'
         : 'No blunders or mistakes found in this game.'}
      </p>
      <div className="flex gap-3">
        {other && (
          <button onClick={() => setFilter(other)}
            className="px-5 py-2.5 bg-purple-700 hover:bg-purple-600 text-white rounded-xl font-semibold transition-colors text-sm"
          >
            Practice {other === 'mine' ? 'Your' : "Opponent's"} Mistakes
          </button>
        )}
        <button onClick={onBack}
          className="px-5 py-2.5 border border-gray-600 text-gray-300 hover:text-white rounded-xl font-semibold transition-colors text-sm"
        >
          ← Back to Analysis
        </button>
      </div>
    </div>
  )
}

function DoneSummary({ solved, total, maxStreak, results, onRetry, onBack }) {
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0
  const skipped = results.filter(r => r === 'skipped').length
  const wrong   = results.filter(r => r === 'wrong').length
  const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '🎯' : pct >= 40 ? '👍' : '📚'
  const msg =
    pct >= 80 ? 'Excellent tactical vision!' :
    pct >= 60 ? 'Good work — keep practicing!' :
    pct >= 40 ? 'Solid effort. Review the positions you missed.' :
    'Study these positions carefully with an engine.'
  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center text-center px-6">
      <div className="text-7xl mb-5">{emoji}</div>
      <h2 className="text-3xl font-bold text-white mb-2">Practice Complete</h2>
      <p className="text-gray-400 mb-8">{msg}</p>

      <div className="flex items-center gap-8 mb-6">
        <Stat value={solved}   label="Correct"  color="text-emerald-400" />
        <Stat value={wrong}    label="Missed"   color="text-red-400" />
        <Stat value={skipped}  label="Skipped"  color="text-gray-400" />
        <Stat value={`${pct}%`} label="Score"  color="text-blue-400" />
      </div>

      {maxStreak > 1 && (
        <p className="text-orange-400 text-sm font-semibold mb-4">🔥 Best streak: {maxStreak}</p>
      )}

      <div className="w-64 bg-gray-800 rounded-full h-3 overflow-hidden mb-10">
        <div className={`h-full rounded-full transition-all duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex gap-3">
        <button onClick={onRetry}
          className="px-6 py-2.5 border border-gray-600 text-gray-300 hover:text-white rounded-xl font-semibold transition-colors text-sm"
        >🔄 Try Again</button>
        <button onClick={onBack}
          className="px-6 py-2.5 bg-purple-700 hover:bg-purple-600 text-white rounded-xl font-semibold transition-colors text-sm"
        >← Back to Analysis</button>
      </div>
    </div>
  )
}

function Stat({ value, label, color }) {
  return (
    <div className="text-center">
      <div className={`text-4xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
