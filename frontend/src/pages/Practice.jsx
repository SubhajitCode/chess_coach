import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'

const BOARD_WIDTH = 400

const CLS_COLOR = {
  blunder: 'text-red-400',
  mistake: 'text-orange-400',
}
const CLS_ICON = {
  blunder: '??',
  mistake: '?',
}
const CLS_BG = {
  blunder: 'bg-red-950/60 border-red-800',
  mistake: 'bg-orange-950/60 border-orange-800',
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
      } catch {
        break
      }
    }
  }
  return fens
}

export default function Practice() {
  const { state } = useLocation()
  const navigate = useNavigate()

  const moves = state?.moves || []
  const pgn = state?.pgn || ''
  const playerColor = state?.playerColor || 'white'
  const username = state?.username
  const gameInfo = state?.gameInfo || {}

  const [filter, setFilter] = useState('all') // 'all' | 'mine' | 'opponent'
  const [step, setStep] = useState(0)
  const [result, setResult] = useState(null) // null | 'correct' | 'incorrect' | 'skipped'
  const [solvedCount, setSolvedCount] = useState(0)
  const [done, setDone] = useState(false)
  const [attemptedUci, setAttemptedUci] = useState(null)

  // Pre-compute FENs once
  const fensBefore = useMemo(() => buildFensBefore(moves), [moves])

  const allMistakes = useMemo(() =>
    moves
      .map((m, idx) => ({ ...m, originalIdx: idx, fenBefore: fensBefore[idx] }))
      .filter(m => m.classification === 'blunder' || m.classification === 'mistake'),
    [moves, fensBefore]
  )

  const filtered = useMemo(() => {
    if (filter === 'mine') return allMistakes.filter(m => m.color === playerColor)
    if (filter === 'opponent') return allMistakes.filter(m => m.color !== playerColor)
    return allMistakes
  }, [allMistakes, filter, playerColor])

  // Reset when filter changes
  useEffect(() => {
    setStep(0)
    setResult(null)
    setSolvedCount(0)
    setDone(false)
    setAttemptedUci(null)
  }, [filter])

  const current = filtered[step]

  const handlePieceDrop = useCallback(({ sourceSquare, targetSquare }) => {
    if (result !== null || !current) return false
    const uci = sourceSquare + targetSquare
    const bestUci = current.best_move_uci
    const isCorrect = bestUci && (uci === bestUci || uci === bestUci.slice(0, 4))
    setAttemptedUci(uci)
    if (isCorrect) {
      setResult('correct')
      setSolvedCount(s => s + 1)
    } else {
      setResult('incorrect')
    }
    return true
  }, [result, current])

  const handleNext = useCallback(() => {
    if (step + 1 >= filtered.length) {
      setDone(true)
    } else {
      setStep(s => s + 1)
      setResult(null)
      setAttemptedUci(null)
    }
  }, [step, filtered.length])

  const handleSkip = useCallback(() => {
    setResult('skipped')
  }, [])

  const handleRetry = useCallback(() => {
    setStep(0)
    setResult(null)
    setSolvedCount(0)
    setDone(false)
    setAttemptedUci(null)
  }, [])

  const handleBack = useCallback(() => navigate(-1), [navigate])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' && result !== null && !done) handleNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [result, done, handleNext])

  // Highlight squares on the board
  const squareStyles = useMemo(() => {
    if (!current || result === null) return {}
    const styles = {}
    if (result === 'correct') {
      if (current.best_move_uci) {
        styles[current.best_move_uci.slice(0, 2)] = { backgroundColor: 'rgba(34,197,94,0.55)' }
        styles[current.best_move_uci.slice(2, 4)] = { backgroundColor: 'rgba(34,197,94,0.55)' }
      }
    } else {
      if (attemptedUci && result === 'incorrect') {
        styles[attemptedUci.slice(0, 2)] = { backgroundColor: 'rgba(239,68,68,0.45)' }
        styles[attemptedUci.slice(2, 4)] = { backgroundColor: 'rgba(239,68,68,0.45)' }
      }
      if (current.best_move_uci) {
        styles[current.best_move_uci.slice(0, 2)] = { backgroundColor: 'rgba(34,197,94,0.55)' }
        styles[current.best_move_uci.slice(2, 4)] = { backgroundColor: 'rgba(34,197,94,0.55)' }
      }
    }
    return styles
  }, [result, current, attemptedUci])

  // Red arrow showing the bad move that was actually played
  const mistakeArrow = useMemo(() => {
    if (!current?.move_uci || current.move_uci.length < 4) return []
    return [{
      startSquare: current.move_uci.slice(0, 2),
      endSquare: current.move_uci.slice(2, 4),
      color: '#ef4444',
    }]
  }, [current])

  const mineCount = allMistakes.filter(m => m.color === playerColor).length
  const oppCount = allMistakes.filter(m => m.color !== playerColor).length

  if (!state || moves.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        No practice data.{' '}
        <button onClick={handleBack} className="ml-2 text-blue-400 underline">Go back</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
          >
            ← Back
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <span className="text-xl">🎯</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white">Practice Mistakes</h1>
            <p className="text-xs text-gray-400">
              {gameInfo.white} vs {gameInfo.black}
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-xl p-1 border border-gray-700">
            {[
              { key: 'all',      label: `All (${allMistakes.length})` },
              { key: 'mine',     label: `Mine (${mineCount})` },
              { key: 'opponent', label: `Opponent (${oppCount})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all font-medium ${
                  filter === key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
        {filtered.length === 0 ? (
          <EmptyState filter={filter} onBack={handleBack} />
        ) : done ? (
          <DoneSummary
            solved={solvedCount}
            total={filtered.length}
            onRetry={handleRetry}
            onBack={handleBack}
          />
        ) : (
          <div className="flex gap-6 items-start">
            {/* ── Left column: board + context ── */}
            <div className="flex flex-col gap-4 flex-shrink-0" style={{ width: BOARD_WIDTH }}>
              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${(step / filtered.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 font-mono whitespace-nowrap">{step + 1} / {filtered.length}</span>
                <span className="text-xs text-emerald-400 font-mono">✓ {solvedCount}</span>
              </div>

              {/* Context card */}
              <div className={`rounded-xl border px-4 py-3 ${CLS_BG[current.classification]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-bold ${CLS_COLOR[current.classification]}`}>
                    {CLS_ICON[current.classification]}
                  </span>
                  <span className="text-white font-semibold capitalize">{current.classification}</span>
                  <span className="text-gray-400 text-sm">— move {current.move_number}</span>
                  <span className="ml-auto text-xs text-gray-400 capitalize px-1.5 py-0.5 bg-gray-800/60 rounded">
                    {current.color}
                  </span>
                </div>
                <p className="text-gray-300 text-sm">
                  <span className={`font-mono font-semibold ${CLS_COLOR[current.classification]}`}>
                    {current.move_san}
                  </span>
                  {' '}was played, losing{' '}
                  <span className="text-red-400 font-semibold">{Math.round(current.cp_loss)} cp</span>.
                  {result === null && ' Can you find the best move?'}
                </p>
              </div>

              {/* Chess board */}
              <div
                className="rounded-xl overflow-hidden border border-gray-700 shadow-xl"
                style={{ width: BOARD_WIDTH, height: BOARD_WIDTH }}
              >
                <Chessboard
                  options={{
                    id: 'practice-board',
                    position: (current.fenBefore || '').split(' ')[0] || 'start',
                    boardOrientation: current.color,
                    boardWidth: BOARD_WIDTH,
                    allowDragging: result === null,
                    boardStyle: { borderRadius: '0' },
                    darkSquareStyle: { backgroundColor: '#4a7c59' },
                    lightSquareStyle: { backgroundColor: '#f0d9b5' },
                    squareStyles,
                    arrows: mistakeArrow,
                    onPieceDrop: handlePieceDrop,
                  }}
                />
              </div>

              {/* Feedback */}
              {result === 'correct' && (
                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-950/60 border border-emerald-700 rounded-xl">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="text-emerald-300 font-semibold text-sm">Correct!</p>
                    <p className="text-emerald-400 text-xs font-mono">{current.best_move_san} was the best move</p>
                  </div>
                </div>
              )}
              {result === 'incorrect' && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-950/60 border border-red-700 rounded-xl">
                  <span className="text-2xl">❌</span>
                  <div>
                    <p className="text-red-300 font-semibold text-sm">Not quite.</p>
                    <p className="text-red-400 text-xs">
                      Best was{' '}
                      <span className="font-mono font-bold text-emerald-400">{current.best_move_san}</span>
                      {' '}(green squares)
                    </p>
                  </div>
                </div>
              )}
              {result === 'skipped' && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl">
                  <span className="text-2xl">💡</span>
                  <div>
                    <p className="text-gray-300 font-semibold text-sm">Solution revealed</p>
                    <p className="text-gray-400 text-xs">
                      Best was{' '}
                      <span className="font-mono font-bold text-emerald-400">{current.best_move_san}</span>
                      {' '}(green squares)
                    </p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {result === null ? (
                  <button
                    onClick={handleSkip}
                    className="flex-1 py-2 text-sm text-gray-400 border border-gray-600 rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    💡 Show Solution
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="flex-1 py-2.5 text-sm font-semibold bg-purple-700 hover:bg-purple-600 text-white rounded-xl transition-colors"
                  >
                    {step + 1 >= filtered.length ? '🏁 See Results' : 'Next →'}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-600 text-center">
                {result !== null ? 'Press → or click Next' : 'Drag a piece to make your move'}
              </p>
            </div>

            {/* ── Right column: mistake list ── */}
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Positions in this set
              </h3>
              <div className="flex flex-col gap-1.5">
                {filtered.map((item, idx) => (
                  <MistakeRow
                    key={item.originalIdx}
                    item={item}
                    index={idx}
                    step={step}
                    playerColor={playerColor}
                    pastResult={idx < step ? 'done' : idx === step ? result : null}
                  />
                ))}
              </div>

              {/* How to use hint */}
              <div className="mt-6 p-4 bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-500 space-y-1">
                <p className="font-semibold text-gray-400">How to practice</p>
                <p>Drag the correct piece to find the best move from each position.</p>
                <p>Use <kbd className="bg-gray-800 px-1 rounded">→</kbd> to advance after answering.</p>
                <p>Use <span className="text-blue-400">💡 Show Solution</span> if you're stuck.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MistakeRow({ item, index, step, playerColor, pastResult }) {
  const isActive = index === step
  const isPast = index < step
  const isOwn = item.color === playerColor

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm transition-all
      ${isActive
        ? 'bg-purple-900/30 border-purple-700/60'
        : isPast
        ? 'bg-gray-900 border-gray-800 opacity-60'
        : 'bg-gray-900 border-gray-800'
      }
    `}>
      {/* Status icon */}
      <span className={`text-xs w-4 flex-shrink-0 ${
        isActive ? 'text-purple-400' : isPast ? 'text-gray-600' : 'text-gray-700'
      }`}>
        {isActive ? '▶' : isPast ? '●' : '○'}
      </span>

      {/* Move number */}
      <span className="text-gray-500 text-xs w-6 font-mono flex-shrink-0">{item.move_number}.</span>

      {/* Classification icon */}
      <span className={`text-xs font-bold w-5 flex-shrink-0 ${CLS_COLOR[item.classification]}`}>
        {CLS_ICON[item.classification]}
      </span>

      {/* Move */}
      <span className={`font-mono font-semibold flex-1 ${isActive ? 'text-white' : 'text-gray-400'}`}>
        {item.move_san}
      </span>

      {/* Yours / Theirs badge */}
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
        ${isOwn ? 'bg-blue-900/60 text-blue-300' : 'bg-purple-900/60 text-purple-300'}
      `}>
        {isOwn ? 'You' : 'Them'}
      </span>

      {/* cp loss */}
      <span className="text-xs text-gray-600 font-mono w-14 text-right flex-shrink-0">
        −{Math.round(item.cp_loss)} cp
      </span>
    </div>
  )
}

function EmptyState({ filter, onBack }) {
  const messages = {
    mine: 'You had no blunders or mistakes — great game!',
    opponent: 'Your opponent had no blunders or mistakes here.',
    all: 'No blunders or mistakes found in this game.',
  }
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl mb-4">🏆</div>
      <h2 className="text-2xl font-bold text-white mb-2">Nothing to practice!</h2>
      <p className="text-gray-400 mb-6">{messages[filter]}</p>
      <button
        onClick={onBack}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors"
      >
        ← Back to Analysis
      </button>
    </div>
  )
}

function DoneSummary({ solved, total, onRetry, onBack }) {
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0
  const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '🎯' : pct >= 40 ? '👍' : '📚'
  const msg =
    pct >= 80 ? 'Excellent tactical vision!' :
    pct >= 60 ? 'Good work — keep practicing!' :
    pct >= 40 ? 'Solid effort. Review the positions you missed.' :
    'Study these positions carefully with an engine.'

  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
      <div className="text-7xl mb-5">{emoji}</div>
      <h2 className="text-3xl font-bold text-white mb-2">Practice Complete</h2>
      <p className="text-gray-400 mb-8">{msg}</p>

      <div className="flex items-center gap-10 mb-8">
        <Stat value={solved} label="Correct" color="text-emerald-400" />
        <Stat value={total - solved} label="Missed" color="text-red-400" />
        <Stat value={`${pct}%`} label="Score" color="text-blue-400" />
      </div>

      <div className="w-64 bg-gray-800 rounded-full h-3 overflow-hidden mb-10">
        <div className={`h-full rounded-full transition-all duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="px-6 py-2.5 border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 rounded-xl font-semibold transition-colors"
        >
          🔄 Try Again
        </button>
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-purple-700 hover:bg-purple-600 text-white rounded-xl font-semibold transition-colors"
        >
          ← Back to Analysis
        </button>
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
