export interface EmptyStateProps {
  filter: string
  mineCount: number
  oppCount: number
  setFilter: (f: string) => void
  onBack: () => void
}

export default function EmptyState({
  filter,
  mineCount,
  oppCount,
  setFilter,
  onBack,
}: EmptyStateProps) {
  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-xl font-bold text-white mb-2">No mistakes to practice!</h2>
      <p className="text-gray-400 text-sm max-w-md mb-6">
        {filter === 'mine' &&
          (mineCount === 0
            ? 'Great game! You played without any major blunders or mistakes.'
            : '')}
        {filter === 'opponent' &&
          (oppCount === 0
            ? 'Your opponent played accurately with no major mistakes.'
            : '')}
        {filter === 'all' && 'No blunders or mistakes found in this game.'}
      </p>
      <div className="flex gap-3">
        {filter !== 'all' && (
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-semibold transition cursor-pointer"
          >
            Show all mistakes
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition cursor-pointer"
        >
          Return to Analysis
        </button>
      </div>
    </div>
  )
}
