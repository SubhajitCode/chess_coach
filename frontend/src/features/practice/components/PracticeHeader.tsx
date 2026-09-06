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
    <header className="flex-shrink-0 px-5 py-2.5 flex items-center gap-3 border-b border-gray-800/70 bg-gray-900/60">
      <button
        type="button"
        onClick={onBack}
        className="text-gray-500 hover:text-white text-sm transition-colors cursor-pointer"
      >
        ← Back
      </button>
      <div className="w-px h-4 bg-gray-700" />

      {gameInfo?.white && gameInfo?.black && (
        <span className="text-xs text-gray-500 truncate hidden sm:block max-w-[180px]">
          {gameInfo.white} vs {gameInfo.black}
        </span>
      )}

      {/* Progress dots */}
      <div className="flex items-center gap-1.5 flex-1 justify-center">
        {filtered.map((_, i) => {
          const r = results[i]
          const isActive = i === step
          const isPast = i < step
          return (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
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
        <div className="flex items-center gap-1 text-orange-400 font-bold text-sm animate-pulse">
          🔥 {streak}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 border border-gray-700">
        {[
          { key: 'all', label: `All (${allMistakesCount})` },
          { key: 'mine', label: `Mine (${mineCount})` },
          { key: 'opponent', label: `Opp (${oppCount})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={`px-2.5 py-1 text-xs rounded-md transition-all font-medium cursor-pointer ${
              filter === key
                ? 'bg-gray-600 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="text-xs text-gray-600 font-mono">
        {step + 1}/{filtered.length}
      </span>
    </header>
  )
}
