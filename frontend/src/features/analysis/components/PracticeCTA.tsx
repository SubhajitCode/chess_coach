import type { ChessMove, PlayerColor } from '../../../types/chess'

export interface PracticeCTAProps {
  moves?: ChessMove[]
  playerColor?: PlayerColor
  onOpen: () => void
}

export default function PracticeCTA({
  moves = [],
  playerColor = 'white',
  onOpen,
}: PracticeCTAProps) {
  const mistakes = moves.filter(
    (m) => m.classification === 'blunder' || m.classification === 'mistake'
  )
  const myMistakes = mistakes.filter((m) => m.color === playerColor)
  const theirMistakes = mistakes.filter((m) => m.color !== playerColor)

  if (mistakes.length === 0) return null

  return (
    <div className="bg-gray-900 rounded-xl border border-purple-800/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">🎯</span>
        <div>
          <h3 className="text-white font-semibold">Learn from Mistakes</h3>
          <p className="text-gray-400 text-xs">
            Practice finding the best moves from {mistakes.length} critical
            position{mistakes.length !== 1 ? 's' : ''} in this game
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 text-sm">
        {myMistakes.length > 0 && (
          <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5">
            <span className="text-red-400 font-bold text-xs">??</span>
            <span className="text-gray-300">
              Your mistakes:{' '}
              <span className="text-white font-semibold">
                {myMistakes.length}
              </span>
            </span>
          </div>
        )}
        {theirMistakes.length > 0 && (
          <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5">
            <span className="text-purple-400 font-bold text-xs">??</span>
            <span className="text-gray-300">
              Opponent's:{' '}
              <span className="text-white font-semibold">
                {theirMistakes.length}
              </span>
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="w-full py-2.5 bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        🎯 Start Mistake Practice
      </button>
    </div>
  )
}
