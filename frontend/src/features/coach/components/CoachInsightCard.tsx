import type { ChessMove, PlayerColor } from '../../../types/chess'

export interface CoachInsightCardProps {
  move: ChessMove
  feedback?: string | null
  isPlayerMove: boolean
  playerColor?: PlayerColor
}

export default function CoachInsightCard({
  move,
  feedback,
  isPlayerMove,
}: CoachInsightCardProps) {
  const cls = move.classification

  // Opponent move analysis card
  if (!isPlayerMove) {
    if (!feedback) return null
    return (
      <div className="rounded-lg border border-violet-800/50 bg-violet-950/20 p-3.5 flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-400 flex items-center gap-1.5">
          <span>⚔</span>
          <span>Opponent Move Analysis</span>
        </div>
        <p className="text-sm text-violet-100 leading-relaxed">{feedback}</p>
      </div>
    )
  }

  // Book move
  if (cls === 'book') {
    const hasCandidates = Boolean(move.book_candidates && move.book_candidates.length > 0)
    return (
      <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3.5 flex flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span>📖</span>
            <span>Opening Book / Coach Insight</span>
          </div>
          {move.book_weight !== undefined && move.book_weight !== null && move.book_weight > 0 && (
            <span className="text-[10px] text-amber-300/80 font-normal font-mono normal-case">
              {move.book_weight.toLocaleString()} master games
            </span>
          )}
        </div>
        {feedback ? (
          <p className="text-sm text-amber-100 leading-relaxed">{feedback}</p>
        ) : (
          <p className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-white font-mono">{move.move_san}</span>{' '}
            follows standard chess opening book theory. Classical development establishing early board control.
          </p>
        )}

        {hasCandidates && (
          <div className="mt-1 pt-2 border-t border-amber-800/30 flex flex-col gap-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">
              Master Database Choices
            </div>
            <div className="flex flex-wrap gap-1.5">
              {move.book_candidates!.map((cand) => {
                const isPlayed = cand.san === move.move_san || cand.uci === move.move_uci
                return (
                  <span
                    key={cand.uci}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                      isPlayed
                        ? 'bg-amber-500/25 text-amber-100 border border-amber-500/50 font-semibold'
                        : 'bg-amber-950/40 text-amber-300/80 border border-amber-800/40'
                    }`}
                  >
                    <span>{cand.san}</span>
                    {cand.percentage !== undefined && (
                      <span className="text-[10px] opacity-75">({cand.percentage}%)</span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Best move
  if (cls === 'best') {
    return (
      <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-3.5 flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400 flex items-center gap-1.5">
          <span>★</span>
          <span>Best Move / Coach Insight</span>
        </div>
        {feedback ? (
          <p className="text-sm text-emerald-100 leading-relaxed">{feedback}</p>
        ) : (
          <p className="text-xs text-emerald-200/90 leading-relaxed">
            <span className="font-semibold text-white font-mono">{move.move_san}</span>{' '}
            is the engine's top choice. Precise, accurate play.
          </p>
        )}
      </div>
    )
  }

  // Excellent or Good move
  if (cls === 'excellent' || cls === 'good') {
    return (
      <div className="rounded-lg border border-lime-800/50 bg-lime-950/20 p-3.5 flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-lime-400 flex items-center gap-1.5">
          <span>✓</span>
          <span>Solid Move / Coach Insight</span>
        </div>
        {feedback ? (
          <p className="text-sm text-lime-100 leading-relaxed">{feedback}</p>
        ) : (
          <p className="text-xs text-lime-200/90 leading-relaxed">
            <span className="font-semibold text-white font-mono">{move.move_san}</span>{' '}
            is a strong, solid move that maintains your position.
          </p>
        )}
      </div>
    )
  }

  // Forced move
  if (cls === 'forced') {
    return (
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/40 p-3.5 flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
          <span>□</span>
          <span>Forced Move</span>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed">
          {feedback || `${move.move_san} was the only viable response in this position.`}
        </p>
      </div>
    )
  }

  // Any other move with coach feedback
  if (feedback) {
    return (
      <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-3.5 flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-400 flex items-center gap-1.5">
          <span>💡</span>
          <span>Coach Commentary</span>
        </div>
        <p className="text-sm text-blue-100 leading-relaxed">{feedback}</p>
      </div>
    )
  }

  return null
}
