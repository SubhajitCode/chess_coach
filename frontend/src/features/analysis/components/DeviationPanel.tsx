import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { getDeviationCoaching } from '../../../api/chess'
import {
  CLASSIFICATION_META,
  evalLabel,
} from '../../../core/chess/moveClassifier'
import LineStepViewer from '../../../components/chess/LineStepViewer'
import type { LineStep, PlayerColor } from '../../../types/chess'
import type { ExploreMoveItem } from '../hooks/useDeviationExplorer'

export interface DeviationPanelProps {
  exploreStack?: ExploreMoveItem[]
  analyzing?: boolean
  playerColor?: PlayerColor
  gameMoveNumber?: number
  username?: string | null
  onPreviewStep?: (step: LineStep) => void
  onExitPreview?: () => void
  onPreviewModeChange?: (active: boolean) => void
  onUndo?: () => void
  onReset?: () => void
  onExit?: () => void
}

export default function DeviationPanel({
  exploreStack = [],
  analyzing = false,
  playerColor = 'white',
  gameMoveNumber,
  username,
  onPreviewStep,
  onExitPreview,
  onPreviewModeChange,
  onUndo,
  onReset,
  onExit,
}: DeviationPanelProps) {
  const [coaching, setCoaching] = useState<string | null>(null)
  const [coachLoading, setCoachLoading] = useState<boolean>(false)
  const [coachError, setCoachError] = useState<string | null>(null)

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
    } catch (err: any) {
      setCoachError(
        err?.extractedDetail ||
          err?.response?.data?.detail ||
          'Coaching request failed'
      )
    } finally {
      setCoachLoading(false)
    }
  }

  const clsMeta = latest?.classification
    ? CLASSIFICATION_META[latest.classification]
    : null
  const beforeL = latest ? evalLabel(latest.evalBefore, playerColor) : null
  const afterL = latest ? evalLabel(latest.evalAfter, playerColor) : null

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">🔍</span>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Explore Mode
          </h3>
          {analyzing && (
            <span className="text-xs text-blue-400 animate-pulse font-normal normal-case">
              · Analyzing…
            </span>
          )}
          {exploreStack.length > 0 && (
            <span className="text-xs text-gray-500 font-normal normal-case">
              {exploreStack.length} move{exploreStack.length !== 1 ? 's' : ''}{' '}
              deep
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {exploreStack.length > 0 && (
            <button
              type="button"
              onClick={onUndo}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors cursor-pointer"
              title="Undo last move"
            >
              ← Undo
            </button>
          )}
          {exploreStack.length > 1 && (
            <button
              type="button"
              onClick={onReset}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors cursor-pointer"
              title="Reset to game position"
            >
              ↺ Reset
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="px-2 py-1 text-xs text-red-400 hover:text-white bg-red-900/30 hover:bg-red-800/50 border border-red-800/50 rounded-lg transition-colors cursor-pointer"
            title="Exit explore mode"
          >
            ✕ Exit
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Empty state */}
        {exploreStack.length === 0 && !analyzing && (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🖱️</div>
            <p className="text-gray-400 text-sm font-medium mb-1">
              Drag a piece to explore
            </p>
            <p className="text-gray-500 text-xs">
              Try an alternative move — the engine will analyze it instantly.
            </p>
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
            <div className="flex items-center gap-2 flex-wrap">
              {clsMeta && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${clsMeta.color} ${clsMeta.bg}`}
                >
                  {clsMeta.icon} {clsMeta.label}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/50 text-blue-300 text-[11px] font-medium">
                Exploration move
              </span>
            </div>

            {latest.moveSummary && (
              <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  You tried
                </div>
                <div className="text-sm text-gray-200">
                  {latest.moveSummary.charAt(0).toUpperCase() +
                    latest.moveSummary.slice(1)}
                </div>
              </div>
            )}

            {latest.evalBefore !== undefined &&
              latest.evalAfter !== undefined &&
              beforeL &&
              afterL && (
                <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    Position change
                  </div>
                  <div className="flex items-stretch gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-500 mb-0.5">
                        Before
                      </div>
                      <div
                        className={`text-xs font-semibold truncate ${beforeL.color}`}
                      >
                        {beforeL.text}
                      </div>
                    </div>
                    <div className="flex items-center text-gray-600 text-lg font-light">
                      →
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-500 mb-0.5">
                        After
                      </div>
                      <div
                        className={`text-xs font-semibold truncate ${afterL.color}`}
                      >
                        {afterL.text}
                      </div>
                    </div>
                    {latest.cpLoss !== undefined && latest.cpLoss > 5 && (
                      <div className="flex-shrink-0 text-right">
                        <div className="text-[10px] text-gray-500 mb-0.5">
                          Lost
                        </div>
                        <div
                          className={`text-xs font-bold ${
                            latest.cpLoss > 100
                              ? 'text-red-400'
                              : latest.cpLoss > 50
                              ? 'text-orange-400'
                              : 'text-yellow-400'
                          }`}
                        >
                          −{Math.round(latest.cpLoss)} cp
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {latest.bestMoveSan && latest.classification !== 'best' && (
              <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                  ★ Engine's best instead
                </div>
                <div className="text-sm text-emerald-200 font-mono font-semibold">
                  {latest.bestMoveSan}
                </div>
              </div>
            )}

            {latest.bestLineUci &&
              latest.bestLineUci.length > 0 &&
              latest.classification !== 'best' && (
                <LineStepViewer
                  label="Best line from here"
                  uciList={latest.bestLineUci}
                  fenBefore={latest.fen}
                  onStepPreview={onPreviewStep}
                  onExitPreview={onExitPreview}
                  onPreviewModeChange={onPreviewModeChange}
                />
              )}

            {latest.deviationBestLineUci &&
              latest.deviationBestLineUci.length > 0 &&
              latest.fenAfter && (
                <LineStepViewer
                  label="Best follow-up after your move"
                  uciList={latest.deviationBestLineUci}
                  fenBefore={latest.fenAfter}
                  onStepPreview={onPreviewStep}
                  onExitPreview={onExitPreview}
                  onPreviewModeChange={onPreviewModeChange}
                />
              )}

            {!coaching && !coachLoading && (
              <button
                type="button"
                onClick={handleExplain}
                disabled={coachLoading}
                className="w-full py-2 text-sm font-semibold rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                🎓 Explain this deviation
              </button>
            )}

            {coachLoading && (
              <div className="flex flex-col gap-2 animate-pulse">
                <div className="h-3 bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-700 rounded w-full" />
                <div className="h-3 bg-gray-700 rounded w-5/6" />
              </div>
            )}

            {coachError && (
              <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
                <p className="text-red-400 text-xs font-medium mb-1">
                  ⚠ Coaching failed
                </p>
                <p className="text-red-300 text-xs opacity-80">{coachError}</p>
                <button
                  type="button"
                  onClick={handleExplain}
                  className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {coaching && (
              <div className="rounded-lg border border-purple-800/40 bg-purple-950/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-400 mb-2">
                  🎓 AI Analysis
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-gray-300 prose-strong:text-gray-200 prose-p:my-1">
                  <ReactMarkdown>{coaching}</ReactMarkdown>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCoaching(null)
                    setCoachError(null)
                  }}
                  className="mt-2 text-[10px] text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
                >
                  ↺ Refresh analysis
                </button>
              </div>
            )}
          </>
        )}

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
