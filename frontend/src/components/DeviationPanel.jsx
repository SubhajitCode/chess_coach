import { useState, useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Chess } from 'chess.js'
import { getDeviationCoaching } from '../api/chess'

// ─── Shared with CoachPanel ──────────────────────────────────────────────────

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

function evalLabel(cp, playerColor) {
  if (cp == null) return { text: '—', color: 'text-gray-400' }
  const sign = playerColor === 'black' ? -1 : 1
  const adjusted = cp * sign
  if (adjusted >= 9000) return { text: 'Checkmate threat', color: 'text-emerald-400' }
  if (adjusted <= -9000) return { text: 'Getting mated',   color: 'text-red-400' }
  const v = adjusted / 100
  if (v >= 3)   return { text: `Winning (+${v.toFixed(1)})`,            color: 'text-emerald-400' }
  if (v >= 1)   return { text: `Clearly better (+${v.toFixed(1)})`,     color: 'text-green-400' }
  if (v >= 0.3) return { text: `Slight edge (+${v.toFixed(1)})`,        color: 'text-lime-400' }
  if (v > -0.3) return { text: `Equal (${v === 0 ? '0.0' : v.toFixed(1)})`, color: 'text-gray-300' }
  if (v > -1)   return { text: `Slight disadvantage (${v.toFixed(1)})`, color: 'text-yellow-400' }
  if (v > -3)   return { text: `Worse (${v.toFixed(1)})`,               color: 'text-orange-400' }
  return          { text: `Losing (${v.toFixed(1)})`,                   color: 'text-red-400' }
}

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

      const isCheck  = chess.inCheck()
      const isMate   = chess.isCheckmate()
      const isCastle = result.flags?.includes('k') || result.flags?.includes('q')

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

// ─── LineViewer ──────────────────────────────────────────────────────────────

function LineViewer({ label, uciList, fenBefore, onStepPreview, onExitPreview, onPreviewModeChange }) {
  const steps = decodeLine(fenBefore, uciList)
  const [activeIdx, setActiveIdx] = useState(null)
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

  useEffect(() => {
    if (!isActive) return
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        activateStep(Math.min(steps.length - 1, activeIdx + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        activateStep(Math.max(0, activeIdx - 1))
      } else if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        exit()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [activeIdx, isActive, steps.length, activateStep, exit])

  if (!steps.length) return null

  return (
    <div className={`rounded-lg border p-3 transition-colors ${
      isActive ? 'border-emerald-600/60 bg-gray-950/70 ring-1 ring-emerald-800/40' : 'border-gray-700 bg-gray-950/60'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => isActive ? exit() : activateStep(0)}
          className={`text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            isActive ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {isActive ? '▶ Previewing' : `▶ ${label}`}
          <span className="ml-1 font-normal normal-case">({steps.length} move{steps.length !== 1 ? 's' : ''})</span>
        </button>
        {isActive ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">{activeIdx + 1}/{steps.length}</span>
            <button onClick={() => activateStep(activeIdx - 1)} disabled={activeIdx === 0}
              className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-gray-400 hover:bg-gray-700 disabled:opacity-30">‹</button>
            <button onClick={() => activateStep(activeIdx + 1)} disabled={activeIdx === steps.length - 1}
              className="w-5 h-5 flex items-center justify-center rounded text-[11px] text-gray-400 hover:bg-gray-700 disabled:opacity-30">›</button>
            <button onClick={exit}
              className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-gray-500 hover:bg-gray-700 hover:text-gray-300">✕</button>
          </div>
        ) : (
          <span className="text-[10px] text-gray-600">click or ↓/↑</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {steps.map((step, i) => {
          const active = isActive && activeIdx === i
          return (
            <button key={i} onClick={() => activateStep(i)}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 w-full text-left transition-colors ${
                active ? 'bg-emerald-900/40 border border-emerald-700/50' : 'hover:bg-gray-800/60 border border-transparent'
              }`}
            >
              <span className="text-[10px] text-gray-600 w-3 flex-shrink-0 text-right">{i + 1}.</span>
              <span className={`text-[10px] font-bold w-4 h-4 rounded flex-shrink-0 flex items-center justify-center
                ${step.color === 'white' ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200'}`}>
                {step.color === 'white' ? 'W' : 'B'}
              </span>
              <span className="text-base leading-none flex-shrink-0">{step.icon}</span>
              <span className={`text-xs flex-1 leading-snug ${active ? 'text-emerald-200' : 'text-gray-300'}`}>
                {step.description}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {step.isCapture && <span className="text-[10px] bg-orange-900/40 text-orange-400 px-1 rounded">×</span>}
                {step.isCheck  && <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1 rounded">+</span>}
              </div>
              {active && <span className="text-[10px] text-emerald-500 flex-shrink-0">●</span>}
            </button>
          )
        })}
      </div>
      {isActive && (
        <div className="mt-2 text-[10px] text-gray-600 text-center">↑ ↓ to navigate · Esc to exit</div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * Props:
 * - exploreStack: [{fen, moveUci, moveSan, moveSummary, color, evalBefore, evalAfter, cpLoss, classification,
 *                   bestMoveUci, bestMoveSan, bestLineSan, bestLineUci,
 *                   deviationBestLineSan, deviationBestLineUci, fenAfter}]
 * - analyzing: bool — Stockfish is running for the latest move
 * - playerColor: 'white' | 'black'
 * - gameMoveNumber: int — current game move number (for phase context)
 * - username: string
 * - onPreviewStep: ({fen, from, to}) => void
 * - onExitPreview: () => void
 * - onPreviewModeChange: (bool) => void
 * - onUndo: () => void
 * - onReset: () => void
 * - onExit: () => void
 */
export default function DeviationPanel({
  exploreStack,
  analyzing,
  playerColor,
  gameMoveNumber,
  username,
  onPreviewStep,
  onExitPreview,
  onPreviewModeChange,
  onUndo,
  onReset,
  onExit,
}) {
  const [coaching, setCoaching] = useState(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState(null)

  const latest = exploreStack[exploreStack.length - 1] ?? null

  const handleExplain = async () => {
    if (!latest) return
    setCoachLoading(true)
    setCoachError(null)
    try {
      const res = await getDeviationCoaching({
        fen_before: latest.fen,
        move_uci: latest.moveUci,
        move_san: latest.moveSan,
        move_summary: latest.moveSummary,
        player_color: playerColor,
        eval_before: latest.evalBefore,
        eval_after: latest.evalAfter,
        cp_loss: latest.cpLoss,
        classification: latest.classification,
        best_move_san: latest.bestMoveSan,
        best_line_san: latest.bestLineSan || [],
        deviation_best_line_san: latest.deviationBestLineSan || [],
        game_move_number: gameMoveNumber,
        username,
      })
      setCoaching(res.data.coaching)
    } catch (err) {
      setCoachError(err?.response?.data?.detail || err?.message || 'Coaching request failed')
    } finally {
      setCoachLoading(false)
    }
  }

  const clsMeta = latest?.classification ? CLASSIFICATION_META[latest.classification] : null
  const beforeL = latest ? evalLabel(latest.evalBefore, playerColor) : null
  const afterL  = latest ? evalLabel(latest.evalAfter,  playerColor) : null

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">🔍</span>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Explore Mode</h3>
          {analyzing && (
            <span className="text-xs text-blue-400 animate-pulse font-normal normal-case">· Analyzing…</span>
          )}
          {exploreStack.length > 0 && (
            <span className="text-xs text-gray-500 font-normal normal-case">
              {exploreStack.length} move{exploreStack.length !== 1 ? 's' : ''} deep
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {exploreStack.length > 0 && (
            <button
              onClick={onUndo}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="Undo last move"
            >← Undo</button>
          )}
          {exploreStack.length > 1 && (
            <button
              onClick={onReset}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="Reset to game position"
            >↺ Reset</button>
          )}
          <button
            onClick={onExit}
            className="px-2 py-1 text-xs text-red-400 hover:text-white bg-red-900/30 hover:bg-red-800/50 border border-red-800/50 rounded-lg transition-colors"
            title="Exit explore mode"
          >✕ Exit</button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">

        {/* Empty state */}
        {exploreStack.length === 0 && !analyzing && (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🖱️</div>
            <p className="text-gray-400 text-sm font-medium mb-1">Drag a piece to explore</p>
            <p className="text-gray-500 text-xs">Try an alternative move — the engine will analyze it instantly.</p>
          </div>
        )}

        {/* Analyzing skeleton */}
        {analyzing && exploreStack.length === 0 && (
          <div className="flex flex-col gap-2 animate-pulse py-2">
            <div className="h-3 bg-gray-700 rounded w-2/3" />
            <div className="h-3 bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-700 rounded w-1/2" />
          </div>
        )}

        {/* Latest deviation result */}
        {latest && (
          <>
            {/* Classification + move played */}
            <div className="flex items-center gap-2 flex-wrap">
              {clsMeta && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${clsMeta.color} ${clsMeta.bg}`}>
                  {clsMeta.icon} {clsMeta.label}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/50 text-blue-300 text-[11px] font-medium">
                Exploration move
              </span>
            </div>

            {/* What was played */}
            {latest.moveSummary && (
              <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">You tried</div>
                <div className="text-sm text-gray-200">
                  {latest.moveSummary.charAt(0).toUpperCase() + latest.moveSummary.slice(1)}
                </div>
              </div>
            )}

            {/* Eval swing */}
            {latest.evalBefore != null && latest.evalAfter != null && beforeL && afterL && (
              <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Position change
                </div>
                <div className="flex items-stretch gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-500 mb-0.5">Before</div>
                    <div className={`text-xs font-semibold truncate ${beforeL.color}`}>{beforeL.text}</div>
                  </div>
                  <div className="flex items-center text-gray-600 text-lg font-light">→</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-500 mb-0.5">After</div>
                    <div className={`text-xs font-semibold truncate ${afterL.color}`}>{afterL.text}</div>
                  </div>
                  {latest.cpLoss != null && latest.cpLoss > 5 && (
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[10px] text-gray-500 mb-0.5">Lost</div>
                      <div className={`text-xs font-bold ${latest.cpLoss > 100 ? 'text-red-400' : latest.cpLoss > 50 ? 'text-orange-400' : 'text-yellow-400'}`}>
                        −{Math.round(latest.cpLoss)} cp
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Engine's best move at this position (to compare) */}
            {latest.bestMoveSan && latest.classification !== 'best' && (
              <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                  ★ Engine's best instead
                </div>
                <div className="text-sm text-emerald-200 font-mono font-semibold">{latest.bestMoveSan}</div>
              </div>
            )}

            {/* Best line from starting position */}
            {latest.bestLineUci?.length > 0 && latest.classification !== 'best' && (
              <LineViewer
                key={`best-${latest.fen}-${latest.moveUci}`}
                label="Best line from here"
                uciList={latest.bestLineUci}
                fenBefore={latest.fen}
                onStepPreview={onPreviewStep}
                onExitPreview={onExitPreview}
                onPreviewModeChange={onPreviewModeChange}
              />
            )}

            {/* Best continuation from the deviation position */}
            {latest.deviationBestLineUci?.length > 0 && latest.fenAfter && (
              <LineViewer
                key={`dev-${latest.fenAfter}`}
                label="Best follow-up after your move"
                uciList={latest.deviationBestLineUci}
                fenBefore={latest.fenAfter}
                onStepPreview={onPreviewStep}
                onExitPreview={onExitPreview}
                onPreviewModeChange={onPreviewModeChange}
              />
            )}

            {/* AI Explain button */}
            {!coaching && !coachLoading && (
              <button
                onClick={handleExplain}
                disabled={coachLoading}
                className="w-full py-2 text-sm font-semibold rounded-xl bg-purple-700 hover:bg-purple-600
                  disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
              >
                🎓 Explain this deviation
              </button>
            )}

            {/* Coach loading */}
            {coachLoading && (
              <div className="flex flex-col gap-2 animate-pulse">
                <div className="h-3 bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-700 rounded w-full" />
                <div className="h-3 bg-gray-700 rounded w-5/6" />
              </div>
            )}

            {/* Coach error */}
            {coachError && (
              <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
                <p className="text-red-400 text-xs font-medium mb-1">⚠ Coaching failed</p>
                <p className="text-red-300 text-xs opacity-80">{coachError}</p>
                <button onClick={handleExplain} className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors">
                  Retry
                </button>
              </div>
            )}

            {/* AI coaching text */}
            {coaching && (
              <div className="rounded-lg border border-purple-800/40 bg-purple-950/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-400 mb-2">
                  🎓 AI Analysis
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-gray-300 prose-strong:text-gray-200 prose-p:my-1">
                  <ReactMarkdown>{coaching}</ReactMarkdown>
                </div>
                <button
                  onClick={() => { setCoaching(null); setCoachError(null) }}
                  className="mt-2 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  ↺ Refresh analysis
                </button>
              </div>
            )}
          </>
        )}

        {/* Analyzing new step */}
        {analyzing && latest && (
          <div className="flex flex-col gap-2 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-2/3" />
            <div className="h-3 bg-gray-700 rounded w-full" />
          </div>
        )}
      </div>
    </div>
  )
}
