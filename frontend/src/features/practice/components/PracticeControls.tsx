export interface PracticeControlsProps {
  phase: 'playing' | 'correct' | 'revealed'
  hintsUsed: number
  onHint: () => void
  onSkip: () => void
  onNext: () => void
}

export default function PracticeControls({
  phase,
  hintsUsed,
  onHint,
  onSkip,
  onNext,
}: PracticeControlsProps) {
  return (
    <div className="w-full space-y-2 mt-auto">
      {phase === 'playing' ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onHint}
            disabled={hintsUsed >= 2}
            className="flex-1 py-2.5 rounded-xl border border-yellow-600/40 bg-yellow-950/20 text-yellow-300 hover:bg-yellow-900/30 text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
          >
            💡 {hintsUsed === 0 ? 'Hint (Piece)' : hintsUsed === 1 ? 'Hint (Square)' : 'No more hints'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2.5 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition cursor-pointer"
          >
            Show Answer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-md cursor-pointer"
        >
          Next Puzzle →
        </button>
      )}
    </div>
  )
}
