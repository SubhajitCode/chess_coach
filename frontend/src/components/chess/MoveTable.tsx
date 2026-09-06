import React, { useRef, useEffect } from 'react'
import type { ChessMove } from '../../types/chess'
import { CLASSIFICATION_META } from '../../core/chess/moveClassifier'

export interface MoveTableProps {
  moves: ChessMove[]
  currentIndex: number
  onMoveClick: (index: number) => void
}

export default function MoveTable({
  moves,
  currentIndex,
  onMoveClick,
}: MoveTableProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentIndex])

  const pairs: {
    num: number
    whiteIndex: number
    whiteMove: ChessMove
    blackIndex: number
    blackMove?: ChessMove
  }[] = []

  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      whiteIndex: i,
      whiteMove: moves[i],
      blackIndex: i + 1,
      blackMove: moves[i + 1],
    })
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden flex flex-col h-72">
      <div className="px-4 py-2.5 bg-gray-800 border-b border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Move Notation
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {pairs.map((p) => (
          <div key={p.num} className="grid grid-cols-12 items-center text-xs font-mono py-0.5 px-2 rounded hover:bg-gray-800/60">
            <span className="col-span-2 text-gray-500">{p.num}.</span>

            {/* White Move */}
            <div className="col-span-5">
              <MoveButton
                move={p.whiteMove}
                index={p.whiteIndex}
                isActive={currentIndex === p.whiteIndex}
                onClick={() => onMoveClick(p.whiteIndex)}
                btnRef={currentIndex === p.whiteIndex ? activeRef : null}
              />
            </div>

            {/* Black Move */}
            <div className="col-span-5">
              {p.blackMove && (
                <MoveButton
                  move={p.blackMove}
                  index={p.blackIndex}
                  isActive={currentIndex === p.blackIndex}
                  onClick={() => onMoveClick(p.blackIndex)}
                  btnRef={currentIndex === p.blackIndex ? activeRef : null}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoveButton({
  move,
  isActive,
  onClick,
  btnRef,
}: {
  move: ChessMove
  index: number
  isActive: boolean
  onClick: () => void
  btnRef: React.RefObject<HTMLButtonElement | null> | null
}) {
  const cls = move.classification ? CLASSIFICATION_META[move.classification] : null

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center justify-between cursor-pointer ${
        isActive
          ? 'bg-blue-600 text-white font-bold'
          : 'text-gray-200 hover:bg-gray-700/60'
      }`}
    >
      <span>{move.move_san || move.san || move.move_uci}</span>
      {cls && (
        <span
          className={`text-[10px] font-bold ml-1 ${
            isActive ? 'text-white' : cls.color
          }`}
          title={cls.label}
        >
          {cls.symbol}
        </span>
      )}
    </button>
  )
}
