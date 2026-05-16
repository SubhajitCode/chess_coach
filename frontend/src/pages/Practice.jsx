import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'

const BOARD_SIZE = 500
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

export default function Practice() {
  const { state } = useLocation()
  const navigate = useNavigate()

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

    if (isPuzzlePosition && current.move_uci && current.move_uci.length >= 4) {
      items.push({
        startSquare: current.move_uci.slice(0, 2),
        endSquare: current.move_uci.slice(2, 4),
        color: '#ef4444',
      })
    } else if (reviewMove?.move_uci && reviewMove.move_uci.length >= 4) {
      items.push({
        startSquare: reviewMove.move_uci.slice(0, 2),
        endSquare: reviewMove.move_uci.slice(2, 4),
        color: reviewIndex === current.originalIdx ? '#ef4444' : 'rgba(148, 163, 184, 0.9)',
      })
    }

    if (showAnswer && isPuzzlePosition && current.best_move_uci && current.best_move_uci.length >= 4) {
      items.push({
        startSquare: current.best_move_uci.slice(0, 2),
        endSquare: current.best_move_uci.slice(2, 4),
        color: '#22c55e',
      })
    }

    return items
  }, [showAnswer, current, isPuzzlePosition, reviewMove, reviewIndex])

  const reviewLabel = useMemo(() => {
    if (!current) return ''
    if (reviewIndex < 0) return 'Game start'
    if (isPuzzlePosition) return 'Before the mistake'
    if (!reviewMove?.move_uci) return `Move ${reviewMove?.move_number ?? reviewIndex + 1}`
    const sideLabel = reviewMove.color === playerColor ? 'You played' : 'Opponent played'
    const mistakeLabel = reviewIndex === current.originalIdx ? ' · Mistake move' : ''
    return `${sideLabel} ${reviewMove.san || reviewMove.move_summary || uciToReadable(reviewMove.move_uci)}${mistakeLabel}`
  }, [current, reviewIndex, isPuzzlePosition, reviewMove, playerColor])

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
          <div className="flex gap-8 items-center w-full" style={{ maxWidth: 860 }}>

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
              <div
                className={`rounded-xl overflow-hidden border shadow-2xl transition-all duration-300 ${
                  shake           ? 'border-red-600 board-shake'
                  : phase === 'correct'  ? 'border-emerald-500 board-correct'
                  : phase === 'revealed' ? 'border-gray-600'
                  : 'border-gray-700'
                }`}
                style={{ width: BOARD_SIZE, height: BOARD_SIZE }}
              >
                <Chessboard
                  options={{
                    id: 'practice-board',
                    position: reviewFen.split(' ')[0] || 'start',
                    boardOrientation: current.color,
                    boardWidth: BOARD_SIZE,
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
