import { useState, useCallback } from 'react'
import { CLASSIFICATION_META } from '../../core/chess/moveClassifier'
import { buildWhyBadSummary } from '../../core/coaching/swingSummarizer'
import { prettifyProfileValue } from '../../core/coaching/coachPlans'
import MotifBadges from './components/MotifBadges'
import EvalSwingCard from './components/EvalSwingCard'
import BestMoveCard from './components/BestMoveCard'
import WhyBadCard from './components/WhyBadCard'
import AskCoachBox from './components/AskCoachBox'
import LineStepViewer from '../../components/chess/LineStepViewer'
import type { ChessMove, LineStep, PlayerColor } from '../../types/chess'
import type { CoachProfile } from '../../types/coaching'

export interface CoachPanelProps {
  moveCoaching?: Record<number, string>
  currentIndex?: number
  currentMove?: ChessMove | null
  playerColor?: PlayerColor
  loading?: boolean
  error?: string | null
  hasAnalysis?: boolean
  coachingProfile?: CoachProfile | null
  onRequest?: () => void
  analyzing?: boolean
  onPreviewBestLineStep?: (preview: { fen: string; from: string; to: string }) => void
  onResetBestLinePreview?: () => void
  onPreviewModeChange?: (active: boolean) => void
}

export default function CoachPanel({
  moveCoaching = {},
  currentIndex = -1,
  currentMove = null,
  playerColor = 'white',
  loading = false,
  error = null,
  hasAnalysis = false,
  coachingProfile = null,
  onRequest,
  analyzing = false,
  onPreviewBestLineStep,
  onResetBestLinePreview,
  onPreviewModeChange,
}: CoachPanelProps) {
  const hasAnyCoaching = Object.keys(moveCoaching).length > 0
  const isPlayerMove = currentMove?.color === playerColor
  const feedback = currentIndex >= 0 ? moveCoaching[currentIndex] : null
  const cls = currentMove?.classification
  const clsMeta = cls ? CLASSIFICATION_META[cls] : null
  const hasEngineData = !!currentMove?.classification
  const whyBadSummary = isPlayerMove
    ? buildWhyBadSummary(currentMove, feedback, playerColor)
    : null
  const moveOwnerLabel = isPlayerMove ? 'Your move' : "Opponent's move"
  const moveOwnerClass = isPlayerMove
    ? 'bg-blue-900/40 text-blue-300 border-blue-700/60'
    : 'bg-violet-900/30 text-violet-300 border-violet-700/60'
  const profileTags = [
    coachingProfile?.main_time_control &&
      `Time: ${prettifyProfileValue(coachingProfile.main_time_control)}`,
    coachingProfile?.improvement_goal &&
      `Goal: ${prettifyProfileValue(coachingProfile.improvement_goal)}`,
    coachingProfile?.focus_area &&
      `Focus: ${prettifyProfileValue(coachingProfile.focus_area)}`,
  ].filter(Boolean)

  const [bestMovePreviewIndex, setBestMovePreviewIndex] = useState<number | null>(null)
  const bestMovePreviewOn = bestMovePreviewIndex === currentIndex

  const handleBestMovePreview = useCallback(() => {
    const uci = currentMove?.best_move_uci
    const fen = currentMove?.fen_before
    if (!uci || !fen) return
    setBestMovePreviewIndex(currentIndex)
    onPreviewBestLineStep?.({
      fen,
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
    })
  }, [currentIndex, currentMove, onPreviewBestLineStep])

  const handleBestMoveExitPreview = useCallback(() => {
    setBestMovePreviewIndex(null)
    onResetBestLinePreview?.()
  }, [onResetBestLinePreview])

  const handleLineStepPreview = useCallback(
    (step: LineStep) => {
      setBestMovePreviewIndex(null)
      onPreviewBestLineStep?.({
        fen: step.fenAfter,
        from: step.from,
        to: step.to,
      })
    },
    [onPreviewBestLineStep]
  )

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
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            AI Coach
          </h3>
          {loading && (
            <span className="text-xs text-blue-400 animate-pulse font-normal normal-case">
              · Generating…
            </span>
          )}
        </div>
        {hasAnalysis && !hasAnyCoaching && !loading && !analyzing && (
          <button
            type="button"
            onClick={onRequest}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer"
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
                key={tag as string}
                className="rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2.5 py-1 text-[11px] font-medium text-cyan-200"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-400 text-xs font-medium mb-1">
              ⚠ Coaching failed
            </p>
            <p className="text-red-300 text-xs opacity-80">{error}</p>
            <button
              type="button"
              onClick={onRequest}
              className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Skeleton */}
        {loading && !hasAnyCoaching && (
          <div className="flex flex-col gap-3 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-700 rounded w-5/6" />
          </div>
        )}

        {/* No analysis yet */}
        {!loading && !hasAnalysis && (
          <p className="text-gray-500 text-sm text-center py-2">
            Analyze a game to get AI coaching feedback.
          </p>
        )}

        {/* No move selected */}
        {!loading && hasAnalysis && currentIndex < 0 && (
          <p className="text-gray-500 text-sm text-center py-2">
            Navigate to a move to see coaching feedback.
          </p>
        )}

        {/* Engine + AI coaching */}
        {!loading && hasAnalysis && currentIndex >= 0 && hasEngineData && (
          <>
            {/* Classification + ownership + Findability */}
            <div className="flex items-center gap-2 flex-wrap">
              {clsMeta && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${clsMeta.color} ${clsMeta.bg}`}
                >
                  {clsMeta.icon} {clsMeta.label}
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${moveOwnerClass}`}
              >
                {moveOwnerLabel}
              </span>
              {currentMove?.findability_tier && cls !== 'best' && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                    currentMove.findability_tier === 'intuitive'
                      ? 'text-emerald-300 bg-emerald-950/60 border-emerald-700/60'
                      : currentMove.findability_tier === 'calculated'
                      ? 'text-yellow-300 bg-yellow-950/60 border-yellow-700/60'
                      : 'text-purple-300 bg-purple-950/60 border-purple-700/60'
                  }`}
                >
                  <span>
                    {currentMove.findability_tier === 'intuitive'
                      ? '🟢'
                      : currentMove.findability_tier === 'calculated'
                      ? '🟡'
                      : '🟣'}
                  </span>
                  <span>
                    {currentMove.findability_tier === 'intuitive'
                      ? 'Standard Pattern'
                      : currentMove.findability_tier === 'calculated'
                      ? 'Calculated'
                      : 'Computer Move'}{' '}
                    ({Math.round(currentMove.findability_score || 0)}%)
                  </span>
                </span>
              )}
            </div>

            {/* Tactical Motif Badges */}
            <MotifBadges motifs={motifs} />

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
                  {currentMove.move_summary.charAt(0).toUpperCase() +
                    currentMove.move_summary.slice(1)}
                </div>
              </div>
            )}

            {/* Why Bad Card */}
            <WhyBadCard whyBadSummary={whyBadSummary} />

            {/* Evaluation swing */}
            {currentMove?.eval_before !== null &&
              currentMove?.eval_before !== undefined &&
              currentMove?.eval_after !== null &&
              currentMove?.eval_after !== undefined && (
                <EvalSwingCard
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
            {currentMove?.practical_best_move_san &&
              currentMove?.practical_best_move_san !==
                currentMove?.best_move_san && (
                <div className="rounded-lg border border-purple-700/50 bg-purple-950/30 p-2.5 flex items-start gap-2.5">
                  <span className="text-sm">🧠</span>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                      Recommended Human Alternative
                    </div>
                    <div className="text-xs text-purple-100 mt-0.5 font-medium">
                      Play{' '}
                      <span className="font-mono font-bold text-white bg-purple-900/80 border border-purple-600/60 px-1.5 py-0.5 rounded">
                        {currentMove.practical_best_move_san}
                      </span>{' '}
                      instead — natural, solid, and easier to calculate than the
                      computer line.
                    </div>
                  </div>
                </div>
              )}

            {/* Best line previewer */}
            {currentMove?.best_line_uci &&
              currentMove.best_line_uci.length > 0 &&
              currentMove.fen_before &&
              cls !== 'best' && (
                <LineStepViewer
                  label="Preview best line"
                  uciList={currentMove.best_line_uci}
                  fenBefore={currentMove.fen_before}
                  onStepPreview={handleLineStepPreview}
                  onExitPreview={handleLineExitPreview}
                  onPreviewModeChange={onPreviewModeChange}
                />
              )}

            {/* Ask Coach Q&A */}
            {currentMove?.fen_before && (
              <AskCoachBox
                fen={currentMove.fen_before}
                playerColor={playerColor}
                moveNumber={currentMove.move_number}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
