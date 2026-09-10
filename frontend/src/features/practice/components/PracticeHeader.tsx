import type { ChessMove } from '../../../types/chess'

export interface PracticeHeaderProps {
  gameInfo?: { white?: string; black?: string }
  filtered: ChessMove[]
  results: ('correct' | 'wrong' | 'skipped')[]
  step: number
  streak: number
  filter: string
  allMistakesCount: number
  mineCount: number
  oppCount: number
  onFilterChange: (filter: string) => void
  onBack: () => void
}

export default function PracticeHeader({
  gameInfo,
  filtered,
  results,
  step,
  streak,
  filter,
  allMistakesCount,
  mineCount,
  oppCount,
  onFilterChange,
  onBack,
}: PracticeHeaderProps) {
  return (
    <header className="flex-shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 border-b border-gray-800/70 bg-gray-900/60 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      {/* Top line on mobile: Back, Title, Streak, Counter */}
      <div className="flex items-center justify-between sm:justify-start gap-2.5 flex-1">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="text-gray-500 hover:text-white text-sm transition-colors cursor-pointer flex items-center gap-1"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-gray-700" />

          {gameInfo?.white && gameInfo?.black && (
            <span className="text-xs text-gray-500 truncate max-w-[140px] sm:max-w-[180px]">
              {gameInfo.white} vs {gameInfo.black}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          {streak > 0 && (
            <div className="flex items-center gap-1 text-orange-400 font-bold text-xs animate-pulse">
              🔥 {streak}
            </div>
          )}
          <span className="text-xs text-gray-400 font-mono">
            {step + 1}/{filtered.length}
          </span>
        </div>
      </div>

      {/* Progress dots & Filter pills */}
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
        {/* Progress dots */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-[140px] sm:max-w-none">
          {filtered.map((_, i) => {
            const r = results[i]
            const isActive = i === step
            const isPast = i < step
            return (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 flex-shrink-0 ${
                  isActive
                    ? 'w-3 h-3 bg-white ring-2 ring-white/30'
                    : isPast && r === 'correct'
                    ? 'w-2 h-2 bg-emerald-500'
                    : isPast && r === 'wrong'
                    ? 'w-2 h-2 bg-red-500'
                    : isPast && r === 'skipped'
                    ? 'w-2 h-2 bg-gray-500'
                    : 'w-2 h-2 bg-gray-700'
                }`}
              />
            )
          })}
        </div>

        {streak > 0 && (
          <div className="hidden sm:flex items-center gap-1 text-orange-400 font-bold text-sm animate-pulse">
            🔥 {streak}
          </div>
        )}

        {/* Filter pills */}
        <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 border border-gray-700 flex-shrink-0">
          {[
            { key: 'all', label: `All (${allMistakesCount})` },
            { key: 'mine', label: `Mine (${mineCount})` },
            { key: 'opponent', label: `Opp (${oppCount})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key)}
              className={`px-2 py-1 text-[11px] sm:text-xs rounded-md transition-all font-medium cursor-pointer ${
                filter === key
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="hidden sm:inline-block text-xs text-gray-500 font-mono">
          {step + 1}/{filtered.length}
        </span>
      </div>
    </header>
  )
}
