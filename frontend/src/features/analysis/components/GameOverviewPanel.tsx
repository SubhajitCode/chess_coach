import type { GameOverviewResponse } from '../../../types/coaching'

export interface GameOverviewPanelProps {
  overview?: GameOverviewResponse | null
  loading?: boolean
  error?: string | null
  onRetry: () => void
}

export default function GameOverviewPanel({
  overview,
  loading = false,
  error = null,
  onRetry,
}: GameOverviewPanelProps) {
  const keyMoments = overview?.key_moments || []
  const hasOverview = !!overview?.overview

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          AI Game Overview
        </h3>
        {loading && (
          <span className="text-xs text-blue-400 animate-pulse">
            Generating…
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400 text-xs font-medium mb-1">
            Could not generate overview
          </p>
          <p className="text-red-300 text-xs opacity-90">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {!error && loading && !hasOverview && (
        <div className="flex flex-col gap-2 animate-pulse">
          <div className="h-3 bg-gray-700 rounded w-full" />
          <div className="h-3 bg-gray-700 rounded w-5/6" />
          <div className="h-3 bg-gray-700 rounded w-4/6" />
        </div>
      )}

      {hasOverview && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-200 leading-relaxed">
            {overview.overview}
          </p>
          {keyMoments.length > 0 && (
            <div className="rounded-lg border border-gray-700 bg-gray-950/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Step by step
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-300">
                {keyMoments.map((item, idx) => (
                  <li
                    key={`${idx}-${item.slice(0, 24)}`}
                    className="leading-relaxed"
                  >
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
