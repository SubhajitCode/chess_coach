import type { GameOverState } from '../hooks/useSparringSession'
import type { PlayerColor } from '../../../types/chess'

export interface GameOverBannerProps {
  gameOver: GameOverState | null
  playerColor: PlayerColor
  aiColor: PlayerColor
  onNewGame: () => void
  onAnalyzeMyPlay: (playerColor: PlayerColor) => void
  onAnalyzeAiPlay: (aiColor: PlayerColor) => void
}

export default function GameOverBanner({
  gameOver,
  playerColor,
  aiColor,
  onNewGame,
  onAnalyzeMyPlay,
  onAnalyzeAiPlay,
}: GameOverBannerProps) {
  if (!gameOver) return null

  return (
    <div className="w-full max-w-[500px] p-4 rounded-xl bg-gradient-to-r from-purple-950/80 to-blue-950/80 border border-purple-600/50 shadow-xl flex flex-col items-center text-center gap-2 animate-fade-in">
      <div className="text-base font-bold text-white">🏆 Game Concluded</div>
      <div className="text-xs text-purple-200">{gameOver.reason}</div>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-1 w-full">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow cursor-pointer min-h-[36px] flex items-center justify-center"
        >
          Play Again
        </button>
        <button
          type="button"
          onClick={() => onAnalyzeMyPlay(playerColor)}
          className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow cursor-pointer min-h-[36px] flex items-center justify-center"
        >
          👤 Analyze My Play
        </button>
        <button
          type="button"
          onClick={() => onAnalyzeAiPlay(aiColor)}
          className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow border border-purple-400/30 cursor-pointer min-h-[36px] flex items-center justify-center"
        >
          🤖 Audit AI with Stockfish
        </button>
      </div>
    </div>
  )
}
