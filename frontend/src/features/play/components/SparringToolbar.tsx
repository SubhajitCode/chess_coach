import type { GameOverState } from '../hooks/useSparringSession'
import type { PlayerColor } from '../../../types/chess'

export interface SparringToolbarProps {
  historyLength: number
  aiThinking: boolean
  gameOver: GameOverState | null
  playerColor: PlayerColor
  aiColor: PlayerColor
  onNewGame: () => void
  onTakeback: () => void
  onResign: () => void
  onAnalyzeAi: (color: PlayerColor) => void
  onAnalyzePlayer: (color: PlayerColor) => void
}

export default function SparringToolbar({
  historyLength,
  aiThinking,
  gameOver,
  playerColor,
  aiColor,
  onNewGame,
  onTakeback,
  onResign,
  onAnalyzeAi,
  onAnalyzePlayer,
}: SparringToolbarProps) {
  return (
    <div className="w-full max-w-[500px] flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition border border-gray-700 cursor-pointer"
        >
          🔄 New Game
        </button>
        <button
          type="button"
          onClick={onTakeback}
          disabled={historyLength === 0 || aiThinking}
          className="flex-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 text-xs font-semibold transition border border-gray-700 cursor-pointer disabled:cursor-not-allowed"
        >
          ⏪ Takeback
        </button>
        <button
          type="button"
          onClick={onResign}
          disabled={!!gameOver}
          className="flex-1 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 disabled:opacity-40 text-red-300 text-xs font-semibold transition border border-red-800/60 cursor-pointer disabled:cursor-not-allowed"
        >
          🏳️ Resign
        </button>
      </div>

      {/* Quick Stockfish Analyze Row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAnalyzeAi(aiColor)}
          disabled={historyLength === 0}
          className="py-2 px-3 rounded-xl bg-purple-900/40 hover:bg-purple-800/60 border border-purple-600/50 disabled:opacity-30 disabled:cursor-not-allowed text-purple-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow cursor-pointer"
        >
          🤖 Analyze AI with Stockfish
        </button>
        <button
          type="button"
          onClick={() => onAnalyzePlayer(playerColor)}
          disabled={historyLength === 0}
          className="py-2 px-3 rounded-xl bg-blue-900/40 hover:bg-blue-800/60 border border-blue-600/50 disabled:opacity-30 disabled:cursor-not-allowed text-blue-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow cursor-pointer"
        >
          👤 Analyze My Play
        </button>
      </div>
    </div>
  )
}
