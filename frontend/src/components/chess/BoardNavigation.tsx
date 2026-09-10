import type { ChessMove, ParsedMove } from '../../types/chess'
import { uciToReadable } from '../../core/chess/fenTree'

export interface BoardNavigationProps {
  activeIndex: number
  maxNavigableIndex: number
  currentMove: ChessMove | ParsedMove | null
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
  onLast: () => void
}

export default function BoardNavigation({
  activeIndex,
  maxNavigableIndex,
  currentMove,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: BoardNavigationProps) {
  const atStart = activeIndex <= -1
  const atEnd = activeIndex >= maxNavigableIndex

  const label =
    activeIndex < 0
      ? 'Game Start'
      : currentMove
      ? `Move ${currentMove.move_number} (${
          currentMove.color === 'white' ? 'White' : 'Black'
        }): ${
          currentMove.move_san ||
          currentMove.san ||
          uciToReadable(currentMove.move_uci)
        }`
      : `Move ${activeIndex + 1}`

  return (
    <div className="flex flex-col gap-2 ml-7">
      <div className="flex items-center justify-between text-xs text-gray-400 px-1 font-mono">
        <span className="truncate">{label}</span>
        <span>
          {activeIndex + 1} / {maxNavigableIndex + 1}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-1 bg-gray-900 border border-gray-700 rounded-xl p-1.5 sm:p-1">
        <button
          type="button"
          onClick={onFirst}
          disabled={atStart}
          className="min-h-[40px] py-2 sm:py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-base sm:text-sm text-gray-200 transition-colors cursor-pointer flex items-center justify-center"
          title="Go to game start"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={atStart}
          className="min-h-[40px] py-2 sm:py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-base sm:text-sm text-gray-200 transition-colors cursor-pointer flex items-center justify-center"
          title="Previous move (Left arrow)"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={atEnd}
          className="min-h-[40px] py-2 sm:py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-base sm:text-sm text-gray-200 transition-colors cursor-pointer flex items-center justify-center"
          title="Next move (Right arrow)"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={onLast}
          disabled={atEnd}
          className="min-h-[40px] py-2 sm:py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-base sm:text-sm text-gray-200 transition-colors cursor-pointer flex items-center justify-center"
          title="Go to latest move"
        >
          ⏭
        </button>
      </div>
    </div>
  )
}
