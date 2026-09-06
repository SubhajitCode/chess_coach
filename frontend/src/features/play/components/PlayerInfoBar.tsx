import type { PlayerColor } from '../../../types/chess'

export interface PlayerInfoBarProps {
  isOpponent: boolean
  engine?: string
  playerColor?: PlayerColor
  isPlayerTurn?: boolean
  aiThinking?: boolean
  onFlipBoard?: () => void
}

export default function PlayerInfoBar({
  isOpponent,
  engine,
  playerColor = 'white',
  isPlayerTurn,
  aiThinking,
  onFlipBoard,
}: PlayerInfoBarProps) {
  if (isOpponent) {
    return (
      <div className="w-full max-w-[500px] flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900 border border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-purple-950 border border-purple-700 flex items-center justify-center text-sm shadow">
            {engine === 'human_model' ? '🧠' : '⚡'}
          </div>
          <div>
            <div className="text-xs font-bold text-gray-200">
              {engine === 'human_model' ? 'Human AI Model' : 'Stockfish 16'}
            </div>
            <div className="text-[10px] text-gray-400">
              {engine === 'human_model'
                ? '1400–1800 Elo Dual-Head Policy'
                : 'Classical Search Depth 12'}
            </div>
          </div>
        </div>
        {aiThinking && (
          <span className="text-xs text-purple-400 font-medium animate-pulse flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
            Thinking…
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-[500px] flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900 border border-gray-800">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-blue-950 border border-blue-700 flex items-center justify-center text-sm shadow">
          👤
        </div>
        <div>
          <div className="text-xs font-bold text-gray-200">
            You ({playerColor.toUpperCase()})
          </div>
          <div className="text-[10px] text-gray-400">
            {isPlayerTurn
              ? 'Your Turn (drag or click to move)'
              : 'Waiting for AI…'}
          </div>
        </div>
      </div>
      {onFlipBoard && (
        <button
          type="button"
          onClick={onFlipBoard}
          title="Flip Board Orientation"
          className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition cursor-pointer"
        >
          🔄 Flip
        </button>
      )}
    </div>
  )
}
