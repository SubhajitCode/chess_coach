export interface DoneSummaryProps {
  solved: number
  total: number
  maxStreak: number
  onRetry: () => void
  onBack: () => void
}

export default function DoneSummary({
  solved,
  total,
  maxStreak,
  onRetry,
  onBack,
}: DoneSummaryProps) {
  const percent = total > 0 ? Math.round((solved / total) * 100) : 0

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/80 p-8 shadow-2xl space-y-6">
        <div className="text-5xl mb-2">🏆</div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Session Complete!</h2>
          <p className="text-gray-400 text-sm">
            You solved <span className="text-emerald-400 font-bold">{solved}</span> of{' '}
            <span className="text-white font-bold">{total}</span> critical positions ({percent}%)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-gray-800/80 border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">Best Streak</div>
            <div className="text-2xl font-bold text-orange-400 mt-0.5">🔥 {maxStreak}</div>
          </div>
          <div className="p-3 rounded-xl bg-gray-800/80 border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">Success Rate</div>
            <div className="text-2xl font-bold text-blue-400 mt-0.5">{percent}%</div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 py-3 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 font-semibold text-sm transition cursor-pointer"
          >
            🔄 Practice Again
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition cursor-pointer"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  )
}
