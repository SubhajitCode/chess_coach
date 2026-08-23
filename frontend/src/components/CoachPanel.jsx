import { useState, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Chess } from 'chess.js'
import { askCoach } from '../api/chess'

// ─── Constants ──────────────────────────────────────────────────────────────

const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }
const PIECE_ICONS = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
}

const CLASSIFICATION_META = {
  best:       { icon: '★',  label: 'Best Move',   color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-700/60' },
  excellent:  { icon: '✓✓', label: 'Excellent',   color: 'text-green-400',   bg: 'bg-green-900/30 border-green-700/60' },
  good:       { icon: '✓',  label: 'Good Move',   color: 'text-lime-400',    bg: 'bg-lime-900/30 border-lime-700/60' },
  inaccuracy: { icon: '?!', label: 'Inaccuracy',  color: 'text-yellow-400',  bg: 'bg-yellow-900/30 border-yellow-700/60' },
  mistake:    { icon: '?',  label: 'Mistake',     color: 'text-orange-400',  bg: 'bg-orange-900/30 border-orange-700/60' },
  blunder:    { icon: '??', label: 'Blunder',     color: 'text-red-400',     bg: 'bg-red-900/30 border-red-700/60' },
}

function formatMotifBadge(motif) {
  if (motif.startsWith('self_pin:absolute:') || motif.startsWith('pin:absolute:')) {
    const pieceSq = motif.split(':').pop().replace('_', ' on ')
    return { icon: '📌', label: `Pinned: ${pieceSq}`, color: 'bg-amber-950/50 text-amber-300 border-amber-700/60' }
  }
  if (motif.startsWith('enemy_pin:absolute:')) {
    const pieceSq = motif.split(':').pop().replace('_', ' on ')
    return { icon: '📌', label: `Enemy pinned: ${pieceSq}`, color: 'bg-emerald-950/50 text-emerald-300 border-emerald-700/60' }
  }
  if (motif.startsWith('self_pin:relative:')) {
    const pieceSq = motif.split(':').pop().replace('_', ' on ')
    return { icon: '🎯', label: `Relative pin: ${pieceSq}`, color: 'bg-amber-950/50 text-amber-300 border-amber-700/60' }
  }
  if (motif.startsWith('enemy_pin:relative:')) {
    const pieceSq = motif.split(':').pop().replace('_', ' on ')
    return { icon: '🎯', label: `Enemy pinned: ${pieceSq}`, color: 'bg-emerald-950/50 text-emerald-300 border-emerald-700/60' }
  }
  if (motif.startsWith('fork:')) {
    return { icon: '🍴', label: 'Tactical Fork', color: 'bg-purple-950/50 text-purple-300 border-purple-700/60' }
  }
  if (motif.startsWith('skewer:')) {
    return { icon: '🍢', label: 'Skewer', color: 'bg-indigo-950/50 text-indigo-300 border-indigo-700/60' }
  }
  if (motif.startsWith('self_hanging:') || motif.startsWith('hanging:')) {
    const pieceSq = motif.split(':').pop().replace('_', ' on ')
    return { icon: '⚠️', label: `Hanging: ${pieceSq}`, color: 'bg-red-950/50 text-red-300 border-red-700/60' }
  }
  if (motif.startsWith('enemy_hanging:')) {
    const pieceSq = motif.split(':').pop().replace('_', ' on ')
    return { icon: '✨', label: `Free piece: ${pieceSq}`, color: 'bg-teal-950/50 text-teal-300 border-teal-700/60' }
  }
  if (motif.startsWith('self_underdefended:') || motif.startsWith('underdefended:')) {
    const pieceSq = motif.split(':').pop().replace('_', ' on ')
    return { icon: '⚠️', label: `Underdefended: ${pieceSq}`, color: 'bg-orange-950/50 text-orange-300 border-orange-700/60' }
  }
  if (motif.startsWith('back_rank_weakness:')) {
    return { icon: '🚪', label: 'Back-rank weakness', color: 'bg-rose-950/50 text-rose-300 border-rose-700/60' }
  }
  return { icon: '⚡', label: motif.replace(/_/g, ' '), color: 'bg-gray-800 text-gray-300 border-gray-700' }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function evalLabel(cp) {
  if (cp == null) return { text: '—', color: 'text-gray-400' }
  // After sign-flipping by caller, positive = good for the player, negative = bad
  if (cp >= 9000)  return { text: 'Checkmate threat', color: 'text-emerald-400' }
  if (cp <= -9000) return { text: 'Getting mated',    color: 'text-red-400' }
  const v = cp / 100
  if (v >= 3)    return { text: `Winning (+${v.toFixed(1)})`,             color: 'text-emerald-400' }
  if (v >= 1)    return { text: `Clearly better (+${v.toFixed(1)})`,      color: 'text-green-400' }
  if (v >= 0.3)  return { text: `Slight edge (+${v.toFixed(1)})`,         color: 'text-lime-400' }
  if (v > -0.3)  return { text: `Equal (${v === 0 ? '0.0' : v.toFixed(1)})`, color: 'text-gray-300' }
  if (v > -1)    return { text: `Slight disadvantage (${v.toFixed(1)})`,  color: 'text-yellow-400' }
  if (v > -3)    return { text: `Worse (${v.toFixed(1)})`,                color: 'text-orange-400' }
  return           { text: `Losing (${v.toFixed(1)})`,                    color: 'text-red-400' }
}

function cpLossDescription(loss) {
  if (loss == null || loss <= 5) return null
  if (loss < 20)  return 'Minimal loss of advantage'
  if (loss < 50)  return 'Noticeable advantage lost'
  if (loss < 100) return 'Significant advantage lost'
  return 'Major blunder — large advantage given away'
}

function previewSanLine(line) {
  if (!line?.length) return null
  return line.filter(Boolean).slice(0, 4).join(' ')
}

function splitFeedback(feedback) {
  if (!feedback) return { headline: null, detail: null }
  const normalized = feedback.replace(/\s+/g, ' ').trim()
  if (!normalized) return { headline: null, detail: null }
  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [normalized]
  return {
    headline: sentences[0] || null,
    detail: sentences.slice(1).join(' ') || null,
  }
}

function scoreFromPlayerPerspective(score, playerColor) {
  if (score == null) return null
  return playerColor === 'black' ? -score : score
}

function buildPositionSwingSummary(move, playerColor) {
  const before = scoreFromPlayerPerspective(move?.eval_before, playerColor)
  const after = scoreFromPlayerPerspective(move?.eval_after, playerColor)
  if (before == null || after == null) return null

  if (before >= 3 && after <= 0.3) return 'You let a winning position slip away.'
  if (before >= 1 && after < -0.3) return 'You went from better to worse in one move.'
  if (before >= 0.3 && after < -1) return 'You handed the advantage to your opponent.'
  if (before > -0.3 && after < -0.3) return 'You turned an equal position into a worse one.'
  if (before <= -0.3 && after <= before - 1) return 'This made an already difficult position even harder to defend.'

  const cpLoss = move?.cp_loss ?? 0
  if (cpLoss >= 150) return 'This gave your opponent a big swing in the position.'
  if (cpLoss >= 80) return 'This gave your opponent the easier game.'
  return null
}

function buildFallbackHeadline(move) {
  const replyMove = move.reply_move_san

  if (move.reply_move_is_checkmate && replyMove) {
    return `After ${move.move_san}, ${replyMove} ended the game immediately.`
  }
  if (move.reply_move_is_capture && move.reply_move_captured_piece && replyMove) {
    return `After ${move.move_san}, ${replyMove} won your ${move.reply_move_captured_piece}.`
  }
  if (move.reply_move_is_check && replyMove) {
    return `After ${move.move_san}, ${replyMove} put your king in trouble right away.`
  }
  if (replyMove) {
    return `After ${move.move_san}, ${replyMove} gave your opponent the initiative.`
  }
  return null
}

function buildAlternativeSummary(move) {
  const bestMove = move?.best_move_san
  if (!bestMove) return null

  if (move.best_move_is_checkmate) {
    return `Instead, ${bestMove} would have finished the game immediately.`
  }
  if (move.best_move_is_capture && move.best_move_captured_piece) {
    return `Instead, ${bestMove} would have won material right away.`
  }
  if (move.best_move_is_check) {
    return `Instead, ${bestMove} would have kept the initiative with check.`
  }
  return `Instead, ${bestMove} kept your position more stable.`
}

function buildWhyBadSummary(move, feedback, playerColor) {
  if (!move || !['mistake', 'blunder'].includes(move.classification)) return null

  const replyLine = previewSanLine(move.reply_line_san)
  const aiSummary = splitFeedback(feedback)
  const positionSwing = buildPositionSwingSummary(move, playerColor)
  const headline = aiSummary.headline || buildFallbackHeadline(move)

  if (!headline && !positionSwing) return null

  const detail = aiSummary.detail || positionSwing
  const detailStartsWithAlternative = /^instead\b/i.test(detail || '')

  return {
    headline,
    detail,
    alternative: detailStartsWithAlternative ? null : buildAlternativeSummary(move),
    replyLine,
  }
}

function prettifyProfileValue(value) {
  if (!value) return null
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Decode a list of UCI moves starting from fenBefore into plain-English steps */
function decodeLine(fenBefore, uciList, limit = 5) {
  if (!fenBefore || !uciList?.length) return []
  try {
    const chess = new Chess(fenBefore)
    const steps = []
    for (const uci of uciList.slice(0, limit)) {
      if (!uci || uci.length < 4) break
      const from = uci.slice(0, 2)
      const to   = uci.slice(2, 4)
      const promo = uci[4] || undefined
      const piece  = chess.get(from)
      const target = chess.get(to)
      const result = chess.move({ from, to, promotion: promo })
      if (!result) break

      const isCheck    = chess.inCheck()
      const isMate     = chess.isCheckmate()
      const isCastle   = result.flags?.includes('k') || result.flags?.includes('q')

      let description
      if (isCastle) {
        description = result.flags?.includes('k') ? 'Castles kingside (O-O)' : 'Castles queenside (O-O-O)'
      } else if (target) {
        description = `${PIECE_NAMES[piece?.type] ?? 'Piece'} on ${from} captures ${PIECE_NAMES[target.type]} on ${to}`
      } else {
        description = `${PIECE_NAMES[piece?.type] ?? 'Piece'} moves from ${from} to ${to}`
      }
      if (promo)  description += ` → promotes to ${PIECE_NAMES[promo]}`
      if (isMate) description += ' — Checkmate!'
      else if (isCheck) description += ' (check +)'

      steps.push({
        uci, from, to,
        icon: piece ? PIECE_ICONS[piece.color][piece.type] : '?',
        color: piece?.color === 'w' ? 'white' : 'black',
        description,
        san: result.san,
        fenAfter: chess.fen(),
        isCapture: !!target,
        isCheck,
      })
    }
    return steps
  } catch {
    return []
  }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EvalSwing({ before, after, cpLoss, isPlayerMove, playerColor }) {
  // Stockfish cp is always from White's perspective.
  // Flip sign for Black so "Winning" / "Losing" reflects the player's situation.
  const sign = playerColor === 'black' ? -1 : 1
  const beforeL = evalLabel(before != null ? before * sign : before)
  const afterL  = evalLabel(after  != null ? after  * sign : after)
  const loss    = cpLoss != null ? Math.round(cpLoss) : null
  const lossMsg = isPlayerMove ? cpLossDescription(loss) : null

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Position change
      </div>
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 mb-0.5">Before this move</div>
          <div className={`text-xs font-semibold truncate ${beforeL.color}`}>{beforeL.text}</div>
        </div>
        <div className="flex items-center text-gray-600 text-lg font-light">→</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 mb-0.5">After this move</div>
          <div className={`text-xs font-semibold truncate ${afterL.color}`}>{afterL.text}</div>
        </div>
        {loss != null && loss > 5 && (
          <div className="flex-shrink-0 text-right">
            <div className="text-[10px] text-gray-500 mb-0.5">Lost</div>
            <div className={`text-xs font-bold ${loss > 100 ? 'text-red-400' : loss > 50 ? 'text-orange-400' : 'text-yellow-400'}`}>
              −{loss} cp
            </div>
          </div>
        )}
      </div>
      {lossMsg && (
        <div className="mt-2 text-[11px] text-gray-400 italic">{lossMsg}</div>
      )}
    </div>
  )
}

function BestMoveCard({ uci, san, summary, fenBefore, onPreview, onExitPreview, isPreviewing }) {
  if (!san || !uci) return null

  let display = summary || san
  try {
    const chess = new Chess(fenBefore)
    const from  = uci.slice(0, 2)
    const to    = uci.slice(2, 4)
    const piece  = chess.get(from)
    const target = chess.get(to)
    if (piece) {
      const icon = PIECE_ICONS[piece.color][piece.type]
      const result = chess.move({ from, to, promotion: uci[4] || undefined })
      if (result) {
        const isCastle = result.flags?.includes('k') || result.flags?.includes('q')
        if (isCastle) {
          display = `${icon} ${result.flags?.includes('k') ? 'Castle kingside' : 'Castle queenside'}`
        } else if (target) {
          display = `${icon} ${PIECE_NAMES[piece.type]} on ${from} captures ${PIECE_NAMES[target.type]} on ${to}`
        } else {
          display = `${icon} ${PIECE_NAMES[piece.type]} moves from ${from} to ${to}`
        }
      }
    }
  } catch { /* keep summary/san fallback */ }

  const handleClick = () => {
    if (isPreviewing) onExitPreview?.()
    else onPreview?.()
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        isPreviewing
          ? 'border-emerald-500 bg-emerald-950/50 ring-1 ring-emerald-700/50'
          : 'border-emerald-800/50 bg-emerald-950/25 hover:border-emerald-600/70 hover:bg-emerald-950/40'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
          ★ Engine's best move
        </div>
        <div className={`text-[10px] ${isPreviewing ? 'text-emerald-400' : 'text-emerald-800'}`}>
          {isPreviewing ? '● on board' : 'click → preview'}
        </div>
      </div>
      <div className="text-sm text-emerald-200 font-medium">{display}</div>
    </button>
  )
}

function BestLineViewer({ uciList, fenBefore, onStepPreview, onExitPreview, onPreviewModeChange }) {
  const steps = decodeLine(fenBefore, uciList)
  const [activeIdx, setActiveIdx] = useState(null) // null = inactive
  const isActive = activeIdx !== null

  const activateStep = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, idx))
    setActiveIdx(clamped)
    onPreviewModeChange?.(true)
    onStepPreview?.(steps[clamped])
  }, [steps, onStepPreview, onPreviewModeChange])

  const exit = useCallback(() => {
    setActiveIdx(null)
    onPreviewModeChange?.(false)
    onExitPreview?.()
  }, [onExitPreview, onPreviewModeChange])

  // Keyboard: Down/Up to navigate, Escape to exit — capture phase beats Analysis.jsx's listener
  useEffect(() => {
    if (!isActive) return
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        const next = Math.min(steps.length - 1, activeIdx + 1)
        activateStep(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        const prev = Math.max(0, activeIdx - 1)
        activateStep(prev)
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        exit()
      }
    }
    window.addEventListener('keydown', handler, true) // capture phase
    return () => window.removeEventListener('keydown', handler, true)
  }, [activeIdx, isActive, steps.length, activateStep, exit])

  if (!steps.length) return null

  return (
    <div className={`rounded-lg border p-3 transition-colors ${
      isActive
        ? 'border-emerald-600/60 bg-gray-950/70 ring-1 ring-emerald-800/40'
        : 'border-gray-700 bg-gray-950/60'
    }`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          onClick={() => isActive ? exit() : activateStep(0)}
          className={`text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            isActive ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {isActive ? '▶ Previewing line' : '▶ Preview best line'}
          <span className="ml-1 font-normal normal-case">({steps.length} move{steps.length !== 1 ? 's' : ''})</span>
        </button>

        {isActive ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">{activeIdx + 1}/{steps.length}</span>
            <button
              onClick={() => activateStep(activeIdx - 1)}
              disabled={activeIdx === 0}
              className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-gray-400
                hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default"
              title="Previous step (↑)"
            >‹</button>
            <button
              onClick={() => activateStep(activeIdx + 1)}
              disabled={activeIdx === steps.length - 1}
              className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-gray-400
                hover:bg-gray-700 disabled:opacity-30 disabled:cursor-default"
              title="Next step (↓)"
            >›</button>
            <button
              onClick={exit}
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-gray-500
                hover:bg-gray-700 hover:text-gray-300"
              title="Exit preview (Esc)"
            >✕</button>
          </div>
        ) : (
          <span className="text-[10px] text-gray-600">click or ↓/↑ to step</span>
        )}
      </div>

      {/* Steps list */}
      <div className="flex flex-col gap-0.5">
        {steps.map((step, i) => {
          const isThisActive = isActive && activeIdx === i
          return (
            <button
              key={i}
              onClick={() => activateStep(i)}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 w-full text-left transition-colors ${
                isThisActive
                  ? 'bg-emerald-900/40 border border-emerald-700/50'
                  : 'hover:bg-gray-800/60 border border-transparent'
              }`}
            >
              <span className="text-[10px] text-gray-600 w-3 flex-shrink-0 text-right">{i + 1}.</span>
              <span className={`text-[10px] font-bold w-4 h-4 rounded flex-shrink-0 flex items-center justify-center
                ${step.color === 'white' ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200'}`}>
                {step.color === 'white' ? 'W' : 'B'}
              </span>
              <span className="text-base leading-none flex-shrink-0">{step.icon}</span>
              <span className={`text-xs flex-1 leading-snug ${isThisActive ? 'text-emerald-200' : 'text-gray-300'}`}>
                {step.description}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {step.isCapture && (
                  <span className="text-[10px] bg-orange-900/40 text-orange-400 px-1 rounded">×</span>
                )}
                {step.isCheck && (
                  <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1 rounded">+</span>
                )}
              </div>
              {isThisActive && (
                <span className="text-[10px] text-emerald-500 flex-shrink-0">●</span>
              )}
            </button>
          )
        })}
      </div>

      {isActive && (
        <div className="mt-2 text-[10px] text-gray-600 text-center">
          ↑ ↓ to navigate · Esc to exit
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

function AskCoachBox({ fen, playerColor, moveNumber }) {
  const [question, setQuestion] = useState('')
  const [candidateMove, setCandidateMove] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState(null)

  const handleAsk = async (e) => {
    e.preventDefault()
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await askCoach({
        fen,
        question: question.trim(),
        candidate_san: candidateMove.trim() || undefined,
        player_color: playerColor,
        move_number: moveNumber,
      })
      setAnswer(res.answer)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to get answer from coach')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-300 uppercase tracking-wide">
        <span>💬</span> Ask Coach
      </div>
      <form onSubmit={handleAsk} className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Candidate move (e.g. Nxd5, e4)... optional"
            value={candidateMove}
            onChange={(e) => setCandidateMove(e.target.value)}
            className="sm:w-1/3 bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Ask anything about this position..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
          >
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </form>

      {error && <div className="text-xs text-red-400">{error}</div>}
      {answer && (
        <div className="mt-2 p-2.5 rounded bg-gray-900/80 border border-blue-700/40 text-xs text-gray-200 leading-relaxed prose prose-invert prose-xs max-w-none">
          <ReactMarkdown>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CoachPanel({
  moveCoaching,
  currentIndex,
  currentMove,
  playerColor,
  loading,
  error,
  hasAnalysis,
  coachingProfile,
  onRequest,
  analyzing,
  onPreviewBestLineStep,
  onResetBestLinePreview,
  onPreviewModeChange,
}) {
  const hasAnyCoaching  = Object.keys(moveCoaching).length > 0
  const isPlayerMove    = currentMove?.color === playerColor
  const feedback        = currentIndex >= 0 ? moveCoaching[currentIndex] : null
  const cls             = currentMove?.classification
  const clsMeta         = cls ? CLASSIFICATION_META[cls] : null
  const hasEngineData   = !!currentMove?.classification
  const whyBadSummary   = isPlayerMove ? buildWhyBadSummary(currentMove, feedback, playerColor) : null
  const moveOwnerLabel  = isPlayerMove ? 'Your move' : "Opponent's move"
  const moveOwnerClass  = isPlayerMove
    ? 'bg-blue-900/40 text-blue-300 border-blue-700/60'
    : 'bg-violet-900/30 text-violet-300 border-violet-700/60'
  const profileTags = [
    coachingProfile?.main_time_control && `Time: ${prettifyProfileValue(coachingProfile.main_time_control)}`,
    coachingProfile?.improvement_goal && `Goal: ${prettifyProfileValue(coachingProfile.improvement_goal)}`,
    coachingProfile?.focus_area && `Focus: ${prettifyProfileValue(coachingProfile.focus_area)}`,
  ].filter(Boolean)

  // Track which preview is active: 'bestmove' | null
  const [bestMovePreviewIndex, setBestMovePreviewIndex] = useState(null)
  const bestMovePreviewOn = bestMovePreviewIndex === currentIndex

  const handleBestMovePreview = useCallback(() => {
    const uci = currentMove?.best_move_uci
    const fen = currentMove?.fen_before
    if (!uci || !fen) return
    setBestMovePreviewIndex(currentIndex)
    onPreviewBestLineStep?.({ fen, from: uci.slice(0, 2), to: uci.slice(2, 4) })
  }, [currentIndex, currentMove, onPreviewBestLineStep])

  const handleBestMoveExitPreview = useCallback(() => {
    setBestMovePreviewIndex(null)
    onResetBestLinePreview?.()
  }, [onResetBestLinePreview])

  const handleLineStepPreview = useCallback((step) => {
    setBestMovePreviewIndex(null)
    onPreviewBestLineStep?.({ fen: step.fenAfter, from: step.from, to: step.to })
  }, [onPreviewBestLineStep])

  const handleLineExitPreview = useCallback(() => {
    onResetBestLinePreview?.()
  }, [onResetBestLinePreview])

  const motifs = currentMove?.motifs || []

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎓</span>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">AI Coach</h3>
          {loading && (
            <span className="text-xs text-blue-400 animate-pulse font-normal normal-case">
              · Generating…
            </span>
          )}
        </div>
        {hasAnalysis && !hasAnyCoaching && !loading && !analyzing && (
          <button
            onClick={onRequest}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            {error ? 'Retry Coaching' : 'Get Coaching'}
          </button>
        )}
      </div>

      <div className="p-4 min-h-[80px] flex flex-col gap-3">
        {profileTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {profileTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2.5 py-1 text-[11px] font-medium text-cyan-200"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-400 text-xs font-medium mb-1">⚠ Coaching failed</p>
            <p className="text-red-300 text-xs opacity-80">{error}</p>
            <button
              onClick={onRequest}
              className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Skeleton ── */}
        {loading && !hasAnyCoaching && (
          <div className="flex flex-col gap-3 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-700 rounded w-5/6" />
          </div>
        )}

        {/* ── No analysis yet ── */}
        {!loading && !hasAnalysis && (
          <p className="text-gray-500 text-sm text-center py-2">
            Analyze a game to get AI coaching feedback.
          </p>
        )}

        {/* ── No move selected ── */}
        {!loading && hasAnalysis && currentIndex < 0 && (
          <p className="text-gray-500 text-sm text-center py-2">
            Navigate to a move to see coaching feedback.
          </p>
        )}

        {/* ── Engine + AI coaching ── */}
        {!loading && hasAnalysis && currentIndex >= 0 && hasEngineData && (
          <>
            {/* Classification + ownership + Findability */}
            <div className="flex items-center gap-2 flex-wrap">
              {clsMeta && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold
                  ${clsMeta.color} ${clsMeta.bg}`}>
                  {clsMeta.icon} {clsMeta.label}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${moveOwnerClass}`}>
                {moveOwnerLabel}
              </span>
              {currentMove?.findability_tier && cls !== 'best' && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                  currentMove.findability_tier === 'intuitive'
                    ? 'text-emerald-300 bg-emerald-950/60 border-emerald-700/60'
                    : currentMove.findability_tier === 'calculated'
                    ? 'text-yellow-300 bg-yellow-950/60 border-yellow-700/60'
                    : 'text-purple-300 bg-purple-950/60 border-purple-700/60'
                }`}>
                  <span>{currentMove.findability_tier === 'intuitive' ? '🟢' : currentMove.findability_tier === 'calculated' ? '🟡' : '🟣'}</span>
                  <span>{currentMove.findability_tier === 'intuitive' ? 'Standard Pattern' : currentMove.findability_tier === 'calculated' ? 'Calculated' : 'Computer Move'} ({Math.round(currentMove.findability_score || 0)}%)</span>
                </span>
              )}
            </div>

            {/* Tactical Motif Badges */}
            {motifs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {motifs.map((m, idx) => {
                  const b = formatMotifBadge(m)
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${b.color}`}
                    >
                      <span>{b.icon}</span>
                      <span>{b.label}</span>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Opponent Threat Warning */}
            {currentMove?.threat_summary && (
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/25 p-2.5 flex items-start gap-2">
                <span className="text-sm">⚠️</span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                    Immediate Opponent Threat
                  </div>
                  <div className="text-xs text-amber-200 mt-0.5">
                    {currentMove.threat_summary}
                  </div>
                </div>
              </div>
            )}

            {/* What you played */}
            {currentMove?.move_summary && (
              <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Played move
                </div>
                <div className="text-sm text-gray-200">
                  {currentMove.move_summary.charAt(0).toUpperCase() + currentMove.move_summary.slice(1)}
                </div>
              </div>
            )}

            {/* Evaluation swing */}
            {currentMove?.eval_before != null && currentMove?.eval_after != null && (
              <EvalSwing
                before={currentMove.eval_before}
                after={currentMove.eval_after}
                cpLoss={currentMove.cp_loss}
                isPlayerMove={isPlayerMove}
                playerColor={playerColor}
              />
            )}

            {/* Engine's best move */}
            {currentMove?.best_move_uci && cls !== 'best' && (
              <BestMoveCard
                uci={currentMove.best_move_uci}
                san={currentMove.best_move_san}
                summary={currentMove.best_move_summary}
                fenBefore={currentMove.fen_before}
                onPreview={handleBestMovePreview}
                onExitPreview={handleBestMoveExitPreview}
                isPreviewing={bestMovePreviewOn}
              />
            )}

            {/* Recommended Practical Human Alternative */}
            {currentMove?.practical_best_move_san && currentMove?.practical_best_move_san !== currentMove?.best_move_san && (
              <div className="rounded-lg border border-purple-700/50 bg-purple-950/30 p-2.5 flex items-start gap-2.5">
                <span className="text-sm">🧠</span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                    Recommended Human Alternative
                  </div>
                  <div className="text-xs text-purple-100 mt-0.5 font-medium">
                    Play <span className="font-mono font-bold text-white bg-purple-900/80 border border-purple-600/60 px-1.5 py-0.5 rounded">{currentMove.practical_best_move_san}</span> instead — natural, solid, and much easier to calculate than the computer line.
                  </div>
                </div>
              </div>
            )}

            {/* Human Model Intuition & Candidates */}
            {currentMove?.human_candidates?.length > 0 && (
              <div className="rounded-lg border border-purple-800/50 bg-purple-950/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-300 flex items-center gap-1.5">
                    <span>🧠</span> 1400–1800 Elo Human Intuition
                  </div>
                  {currentMove.human_move_prob != null && (
                    <span className="text-[11px] text-purple-400 font-medium">
                      Played move popularity: {currentMove.human_move_prob}%
                    </span>
                  )}
                </div>
                {currentMove.is_human_blindspot && (
                  <div className="mb-2 px-2 py-1 rounded bg-amber-950/60 border border-amber-600/50 text-[11px] text-amber-300 font-medium flex items-center gap-1">
                    <span>🎯</span> Common Human Blindspot (frequently chosen by humans but tactically punished)
                  </div>
                )}
                <div className="space-y-1.5">
                  {currentMove.human_candidates.map((cand, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-gray-200 w-12">{cand.move_san}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-purple-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(5, cand.probability))}%` }}
                        />
                      </div>
                      <span className="text-gray-400 text-[11px] w-10 text-right">{cand.probability}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Best continuation line */}
            {currentMove?.best_line_uci?.length > 1 && cls !== 'best' && (
              <BestLineViewer
                key={`line-${currentIndex}`}
                uciList={currentMove.best_line_uci}
                fenBefore={currentMove.fen_before}
                onStepPreview={handleLineStepPreview}
                onExitPreview={handleLineExitPreview}
                onPreviewModeChange={onPreviewModeChange}
              />
            )}

            {/* Why the move was bad */}
            {whyBadSummary && (
              <div className="rounded-lg border border-red-800/60 bg-red-950/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-red-300 mb-2">
                  Why this was bad
                </div>
                {whyBadSummary.headline && (
                  <p className="text-sm text-red-100 leading-relaxed">
                    {whyBadSummary.headline}
                  </p>
                )}
                {whyBadSummary.detail && (
                  <p className="mt-2 text-xs text-red-200/90 leading-relaxed">
                    {whyBadSummary.detail}
                  </p>
                )}
                {whyBadSummary.alternative && (
                  <p className="mt-2 text-xs text-emerald-200 leading-relaxed">
                    {whyBadSummary.alternative}
                  </p>
                )}
                {whyBadSummary.replyLine && (
                  <div className="mt-2 rounded-md border border-red-800/50 bg-gray-950/40 px-2.5 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-red-300/80 mb-1">
                      How the engine punishes it
                    </div>
                    <div className="text-xs text-gray-200">{whyBadSummary.replyLine}</div>
                  </div>
                )}
              </div>
            )}

            {/* AI coaching text */}
            {feedback ? (
              <div className="rounded-lg border border-gray-700 bg-gray-950/30 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Coach says
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-gray-300
                  prose-strong:text-gray-200 prose-p:my-1">
                  <ReactMarkdown>{feedback}</ReactMarkdown>
                </div>
              </div>
            ) : (
              !hasAnyCoaching && !analyzing && (
                <p className="text-xs text-gray-500 text-center">
                  Click <span className="text-blue-400">Get Coaching</span> for AI feedback on every move.
                </p>
              )
            )}

            {/* Interactive Ask Coach box */}
            <AskCoachBox
              fen={currentMove.fen_before || currentMove.fen_after}
              playerColor={playerColor}
              moveNumber={currentMove.move_number}
            />
          </>
        )}

        {/* ── Coaching generating ── */}
        {!loading && !hasAnyCoaching && analyzing && (
          <p className="text-gray-500 text-sm text-center py-2">
            Coaching will be generated automatically when analysis finishes.
          </p>
        )}
      </div>
    </div>
  )
}

