import { useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Chess } from 'chess.js'

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function evalLabel(cp) {
  if (cp == null) return { text: '—', color: 'text-gray-400' }
  if (cp >= 9000)  return { text: 'Checkmate', color: 'text-emerald-400' }
  if (cp <= -9000) return { text: 'Getting mated', color: 'text-red-400' }
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

function EvalSwing({ before, after, cpLoss, isPlayerMove }) {
  const beforeL = evalLabel(before)
  const afterL  = evalLabel(after)
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

function BestMoveCard({ uci, san, summary, fenBefore, onHover, onLeave }) {
  if (!san || !uci) return null

  // Decode the best move into plain English from UCI + FEN
  let display = summary || san
  let icon = '?'
  try {
    const chess = new Chess(fenBefore)
    const from  = uci.slice(0, 2)
    const to    = uci.slice(2, 4)
    const piece  = chess.get(from)
    const target = chess.get(to)
    if (piece) {
      icon = PIECE_ICONS[piece.color][piece.type]
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

  return (
    <div
      className="rounded-lg border border-emerald-800/50 bg-emerald-950/25 p-3 cursor-default transition-colors
        hover:border-emerald-700/70 hover:bg-emerald-950/40"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
          ★ Engine's best move
        </div>
        {onHover && (
          <div className="text-[10px] text-emerald-800">hover → preview on board</div>
        )}
      </div>
      <div className="text-sm text-emerald-200 font-medium">{display}</div>
    </div>
  )
}

function BestLineViewer({ uciList, fenBefore, onStepHover, onStepLeave }) {
  const steps = decodeLine(fenBefore, uciList)
  if (!steps.length) return null

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Best continuation ({steps.length} move{steps.length !== 1 ? 's' : ''})
        </div>
        {onStepHover && (
          <div className="text-[10px] text-gray-600">hover each move → board preview</div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {steps.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-default transition-colors
              hover:bg-gray-800/60 group"
            onMouseEnter={() => onStepHover?.(step)}
            onMouseLeave={onStepLeave}
          >
            {/* Step number */}
            <span className="text-[10px] text-gray-600 w-3 flex-shrink-0 text-right">{i + 1}.</span>

            {/* W / B badge */}
            <span className={`text-[10px] font-bold w-4 h-4 rounded flex-shrink-0 flex items-center justify-center
              ${step.color === 'white' ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200'}`}>
              {step.color === 'white' ? 'W' : 'B'}
            </span>

            {/* Piece icon */}
            <span className="text-base leading-none flex-shrink-0">{step.icon}</span>

            {/* Plain English description */}
            <span className="text-xs text-gray-300 flex-1 leading-snug">{step.description}</span>

            {/* Capture / check badges */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {step.isCapture && (
                <span className="text-[10px] bg-orange-900/40 text-orange-400 px-1 rounded">×</span>
              )}
              {step.isCheck && (
                <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1 rounded">+</span>
              )}
            </div>

            {/* Hover cue */}
            <span className="text-[10px] text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              ←
            </span>
          </div>
        ))}
      </div>
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
  onRequest,
  analyzing,
  onPreviewBestLineStep,
  onResetBestLinePreview,
}) {
  const hasAnyCoaching  = Object.keys(moveCoaching).length > 0
  const isPlayerMove    = currentMove?.color === playerColor
  const feedback        = currentIndex >= 0 ? moveCoaching[currentIndex] : null
  const cls             = currentMove?.classification
  const clsMeta         = cls ? CLASSIFICATION_META[cls] : null
  const hasEngineData   = !!currentMove?.classification
  const moveOwnerLabel  = isPlayerMove ? 'Your move' : "Opponent's move"
  const moveOwnerClass  = isPlayerMove
    ? 'bg-blue-900/40 text-blue-300 border-blue-700/60'
    : 'bg-violet-900/30 text-violet-300 border-violet-700/60'

  const handleBestMoveHover = useCallback(() => {
    const uci = currentMove?.best_move_uci
    const fen = currentMove?.fen_before
    if (!uci || !fen) return
    onPreviewBestLineStep?.({ fen, from: uci.slice(0, 2), to: uci.slice(2, 4) })
  }, [currentMove, onPreviewBestLineStep])

  const handleStepHover = useCallback((step) => {
    onPreviewBestLineStep?.({ fen: step.fenAfter, from: step.from, to: step.to })
  }, [onPreviewBestLineStep])

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
            {/* Classification + ownership */}
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
            </div>

            {/* What you played */}
            {currentMove?.move_summary && (
              <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  You played
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
              />
            )}

            {/* Engine's best move */}
            {currentMove?.best_move_uci && cls !== 'best' && (
              <BestMoveCard
                uci={currentMove.best_move_uci}
                san={currentMove.best_move_san}
                summary={currentMove.best_move_summary}
                fenBefore={currentMove.fen_before}
                onHover={onPreviewBestLineStep ? handleBestMoveHover : undefined}
                onLeave={onResetBestLinePreview}
              />
            )}

            {/* Best continuation line */}
            {currentMove?.best_line_uci?.length > 1 && cls !== 'best' && (
              <BestLineViewer
                uciList={currentMove.best_line_uci}
                fenBefore={currentMove.fen_before}
                onStepHover={onPreviewBestLineStep ? handleStepHover : undefined}
                onStepLeave={onResetBestLinePreview}
              />
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
