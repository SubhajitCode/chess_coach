import ReactMarkdown from 'react-markdown'

const CLASSIFICATION_LABEL = {
  best: { icon: '★', label: 'Best Move', color: 'text-emerald-400' },
  excellent: { icon: '✓✓', label: 'Excellent Move', color: 'text-green-400' },
  good: { icon: '✓', label: 'Good Move', color: 'text-lime-400' },
  inaccuracy: { icon: '?!', label: 'Inaccuracy', color: 'text-yellow-400' },
  mistake: { icon: '?', label: 'Mistake', color: 'text-orange-400' },
  blunder: { icon: '??', label: 'Blunder', color: 'text-red-400' },
}

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
}) {
  const hasAnyCoaching = Object.keys(moveCoaching).length > 0
  const isPlayerMove = currentMove?.color === playerColor
  const feedback = currentIndex >= 0 ? moveCoaching[currentIndex] : null
  const cls = currentMove?.classification
  const moveOwnerLabel = isPlayerMove ? 'Your move' : "Opponent's move"
  const moveOwnerClass = isPlayerMove
    ? 'bg-blue-900/40 text-blue-300 border-blue-700/60'
    : 'bg-violet-900/30 text-violet-300 border-violet-700/60'

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎓</span>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">AI Coach</h3>
          {loading && (
            <span className="text-xs text-blue-400 animate-pulse font-normal normal-case">
              · Generating coaching…
            </span>
          )}
        </div>
        {/* Show button only if analysis exists but no coaching yet and not loading */}
        {hasAnalysis && !hasAnyCoaching && !loading && !analyzing && (
          <button
            onClick={onRequest}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            {error ? 'Retry Coaching' : 'Get Coaching'}
          </button>
        )}
        {hasAnalysis && error && hasAnyCoaching === false && !loading && (
          <button
            onClick={onRequest}
            className="px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      <div className="p-4 min-h-[80px]">
        {/* Error state */}
        {error && (
          <div className="mb-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
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

        {/* Skeleton while LLM is running */}
        {loading && !hasAnyCoaching && (
          <div className="flex flex-col gap-3 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-700 rounded w-5/6" />
            <div className="h-3 bg-gray-700 rounded w-2/3" />
          </div>
        )}

        {/* No analysis yet */}
        {!loading && !hasAnalysis && (
          <p className="text-gray-500 text-sm text-center py-2">
            Analyze a game to get AI coaching feedback.
          </p>
        )}

        {/* Coaching ready — show per-move feedback */}
        {!loading && hasAnyCoaching && (
          <>
            {currentIndex < 0 && (
              <p className="text-gray-500 text-sm text-center py-2">
                Navigate to a move to see coaching feedback.
              </p>
            )}

            {currentIndex >= 0 && feedback && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {cls && CLASSIFICATION_LABEL[cls] && (
                    <>
                      <span className={`text-sm font-bold ${CLASSIFICATION_LABEL[cls].color}`}>
                        {CLASSIFICATION_LABEL[cls].icon}
                      </span>
                      <span className={`text-xs font-semibold uppercase tracking-wide ${CLASSIFICATION_LABEL[cls].color}`}>
                        {CLASSIFICATION_LABEL[cls].label}
                      </span>
                    </>
                  )}
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${moveOwnerClass}`}>
                    {moveOwnerLabel}
                  </span>
                  <span className="text-gray-500 text-xs font-mono ml-1">
                    {currentMove?.move_san}
                  </span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-gray-300
                  prose-strong:text-gray-200 prose-p:my-1">
                  <ReactMarkdown>{feedback}</ReactMarkdown>
                </div>
              </div>
            )}

            {currentIndex >= 0 && !feedback && (
              <p className="text-gray-500 text-sm text-center py-2">
                No coaching data for this move yet.
              </p>
            )}
          </>
        )}

        {/* Coaching not yet available but analysis is done */}
        {!loading && !hasAnyCoaching && hasAnalysis && !analyzing && (
          <p className="text-gray-500 text-sm text-center py-2">
            Click <span className="text-blue-400">Get Coaching</span> to generate AI feedback for every move.
          </p>
        )}

        {/* Coaching will auto-generate after analysis completes */}
        {!loading && !hasAnyCoaching && analyzing && (
          <p className="text-gray-500 text-sm text-center py-2">
            Coaching will be generated automatically for every move when analysis finishes.
          </p>
        )}
      </div>
    </div>
  )
}
