import { useState, useRef, useEffect, useMemo } from 'react'
import type { TargetMoveItem } from '../../../types/openings'

interface NotationPanelProps {
  targetMoves?: TargetMoveItem[]
  moveHistory?: string[]
  currentIndex: number
  totalMoves: number
  isUserTurn: boolean
  isOpponentThinking: boolean
  trainAs: 'white' | 'black'
  pgn: string
  completed: boolean
  scenarioName?: string
  eco?: string
}

export default function NotationPanel({
  targetMoves,
  moveHistory = [],
  currentIndex,
  totalMoves,
  isUserTurn,
  isOpponentThinking,
  trainAs,
  pgn,
  completed,
  scenarioName,
  eco,
}: NotationPanelProps) {
  const [viewMode, setViewMode] = useState<'table' | 'pgn'>('table')
  const [copied, setCopied] = useState(false)
  const activeRowRef = useRef<HTMLDivElement | null>(null)

  // Fallback to parsing PGN if targetMoves is empty
  const movesToDisplay: TargetMoveItem[] = useMemo(() => {
    if (targetMoves && targetMoves.length > 0) {
      return targetMoves
    }
    if (!pgn) return []
    const tokens = pgn
      .split(/\s+/)
      .filter(t => !t.endsWith('.') && !/^\d+\./.test(t) && t.trim().length > 0)
    return tokens.map((san, idx) => ({
      index: idx,
      san,
      uci: '',
      side: (idx % 2 === 0 ? 'white' : 'black') as 'white' | 'black',
    }))
  }, [targetMoves, pgn])

  // Group into pairs (Move 1: White, Black; Move 2: White, Black...)
  const movePairs = useMemo(() => {
    const pairs: {
      moveNumber: number
      white?: TargetMoveItem
      black?: TargetMoveItem
    }[] = []

    for (let i = 0; i < movesToDisplay.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: movesToDisplay[i],
        black: movesToDisplay[i + 1],
      })
    }
    return pairs
  }, [movesToDisplay])

  // Auto-scroll to active row on move change
  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentIndex])

  const handleCopyPgn = () => {
    if (!pgn) return
    navigator.clipboard.writeText(pgn)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentMove = movesToDisplay[currentIndex]
  const isPlayerNext = currentMove && currentMove.side === trainAs && isUserTurn && !isOpponentThinking && !completed

  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-300">
      {/* Top Header with title and controls */}
      <div className="p-3.5 sm:p-4 bg-gray-800/50 border-b border-gray-800/80 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📜</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Chess Notation
              </h3>
              {eco && (
                <span className="bg-blue-900/40 border border-blue-700/50 text-blue-300 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {eco}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              {completed ? (
                <span className="text-emerald-400 font-medium">Full line completed ({totalMoves}/{totalMoves})</span>
              ) : (
                <span>
                  Move <strong className="text-white font-mono">{currentIndex}</strong> of{' '}
                  <span className="text-gray-300 font-mono">{totalMoves}</span> half-moves
                  {moveHistory.length > 0 && (
                    <span className="ml-1.5 text-gray-400">({moveHistory.length} played)</span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* View Mode & Copy Buttons */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-gray-950 p-0.5 rounded-lg border border-gray-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Paired Move Table"
            >
              📋 Moves
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pgn')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === 'pgn'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Inline PGN"
            >
              🔤 PGN
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyPgn}
            className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 hover:text-white rounded-lg text-xs font-medium border border-gray-700 transition-all flex items-center gap-1"
            title="Copy line PGN to clipboard"
          >
            {copied ? (
              <>
                <span className="text-emerald-400">✓</span>
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <span>📋</span>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Next Move Callout Spotlight */}
      <div className={`px-4 py-2.5 border-b text-xs flex items-center justify-between gap-2 transition-colors ${
        completed
          ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
          : isPlayerNext
          ? 'bg-blue-950/50 border-blue-800/70 text-blue-200'
          : 'bg-amber-950/40 border-amber-800/60 text-amber-200'
      }`}>
        <div className="flex items-center gap-2 font-medium">
          {completed ? (
            <>
              <span className="text-base">🎉</span>
              <span>All moves completed! Great execution.</span>
            </>
          ) : isPlayerNext ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span>
                👉 <strong className="text-white">Your turn:</strong> Play{' '}
                <span className="font-mono font-bold bg-blue-900/60 border border-blue-600/70 px-2 py-0.5 rounded text-blue-100 text-sm ml-1">
                  {Math.floor(currentIndex / 2) + 1}
                  {currentMove.side === 'white' ? '.' : '...'} {currentMove.san}
                </span>
              </span>
            </>
          ) : isOpponentThinking ? (
            <>
              <span className="animate-spin text-sm">⏳</span>
              <span>
                Opponent replying with{' '}
                <span className="font-mono font-bold bg-amber-900/60 border border-amber-700/60 px-2 py-0.5 rounded text-amber-100 text-sm ml-1">
                  {currentMove?.san}
                </span>
                ...
              </span>
            </>
          ) : (
            <>
              <span>♟️</span>
              <span>
                Next move:{' '}
                <span className="font-mono font-bold text-white">
                  {Math.floor(currentIndex / 2) + 1}
                  {currentMove?.side === 'white' ? '.' : '...'} {currentMove?.san}
                </span>
              </span>
            </>
          )}
        </div>

        <div className="text-[11px] opacity-80 font-mono hidden sm:block">
          {trainAs === 'white' ? '⚪ White (You)' : '⚫ Black (You)'}
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'table' ? (
        <div className="max-h-72 overflow-y-auto custom-scrollbar divide-y divide-gray-800/50">
          {/* Table Header */}
          <div className="grid grid-cols-12 px-3.5 py-2 bg-gray-950/60 text-[11px] font-semibold text-gray-400 uppercase tracking-wider sticky top-0 z-10 backdrop-blur border-b border-gray-800">
            <div className="col-span-2 text-center text-gray-500">#</div>
            <div className="col-span-5 flex items-center gap-1.5 pl-2">
              <span className="w-2 h-2 rounded-full bg-white inline-block shadow-sm" />
              <span>White {trainAs === 'white' && <span className="text-blue-400 text-[9px]">(You)</span>}</span>
            </div>
            <div className="col-span-5 flex items-center gap-1.5 pl-2">
              <span className="w-2 h-2 rounded-full bg-gray-900 border border-gray-600 inline-block shadow-sm" />
              <span>Black {trainAs === 'black' && <span className="text-blue-400 text-[9px]">(You)</span>}</span>
            </div>
          </div>

          {/* Move Rows */}
          {movePairs.map(pair => {
            const isWhiteActive = pair.white && pair.white.index === currentIndex && !completed
            const isBlackActive = pair.black && pair.black.index === currentIndex && !completed
            const isRowActive = isWhiteActive || isBlackActive

            const isWhitePlayed = pair.white && pair.white.index < currentIndex
            const isBlackPlayed = pair.black && pair.black.index < currentIndex

            return (
              <div
                key={pair.moveNumber}
                ref={isRowActive ? activeRowRef : null}
                className={`grid grid-cols-12 px-3.5 py-1.5 items-center text-xs font-mono transition-colors ${
                  isRowActive
                    ? 'bg-blue-950/30 ring-1 ring-inset ring-blue-500/40'
                    : pair.moveNumber % 2 === 0
                    ? 'bg-gray-900/30'
                    : 'bg-transparent hover:bg-gray-800/30'
                }`}
              >
                {/* Move Number */}
                <div className="col-span-2 text-center text-gray-500 font-semibold text-[11px]">
                  {pair.moveNumber}.
                </div>

                {/* White Move Cell */}
                <div className="col-span-5 pl-2 pr-1">
                  {pair.white ? (
                    <div
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                        isWhiteActive
                          ? trainAs === 'white'
                            ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/50 ring-2 ring-blue-400/60'
                            : 'bg-amber-600/90 text-white font-bold animate-pulse shadow-md shadow-amber-900/40'
                          : isWhitePlayed
                          ? 'text-gray-200 bg-gray-800/60 border border-gray-700/60 font-semibold'
                          : 'text-gray-400 hover:text-gray-300 font-normal'
                      }`}
                    >
                      {isWhitePlayed && (
                        <span className="text-emerald-400 text-[10px]">✓</span>
                      )}
                      {isWhiteActive && (
                        <span className="text-[10px]">👉</span>
                      )}
                      <span>{pair.white.san}</span>
                      {isWhiteActive && trainAs === 'white' && (
                        <span className="text-[9px] bg-blue-800 px-1 py-0.2 rounded uppercase font-bold tracking-wider">
                          Play
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>

                {/* Black Move Cell */}
                <div className="col-span-5 pl-2 pr-1">
                  {pair.black ? (
                    <div
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                        isBlackActive
                          ? trainAs === 'black'
                            ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/50 ring-2 ring-blue-400/60'
                            : 'bg-amber-600/90 text-white font-bold animate-pulse shadow-md shadow-amber-900/40'
                          : isBlackPlayed
                          ? 'text-gray-200 bg-gray-800/60 border border-gray-700/60 font-semibold'
                          : 'text-gray-400 hover:text-gray-300 font-normal'
                      }`}
                    >
                      {isBlackPlayed && (
                        <span className="text-emerald-400 text-[10px]">✓</span>
                      )}
                      {isBlackActive && (
                        <span className="text-[10px]">👉</span>
                      )}
                      <span>{pair.black.san}</span>
                      {isBlackActive && trainAs === 'black' && (
                        <span className="text-[9px] bg-blue-800 px-1 py-0.2 rounded uppercase font-bold tracking-wider">
                          Play
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* PGN Continuous Notation View */
        <div className="p-4 max-h-72 overflow-y-auto custom-scrollbar font-mono text-xs sm:text-sm leading-relaxed bg-gray-950/40">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {movePairs.map(pair => {
              const isWhiteActive = pair.white && pair.white.index === currentIndex && !completed
              const isBlackActive = pair.black && pair.black.index === currentIndex && !completed
              const isWhitePlayed = pair.white && pair.white.index < currentIndex
              const isBlackPlayed = pair.black && pair.black.index < currentIndex

              return (
                <span key={pair.moveNumber} className="inline-flex items-center gap-1">
                  <span className="text-gray-500 font-semibold">{pair.moveNumber}.</span>
                  {pair.white && (
                    <span
                      className={`px-1.5 py-0.5 rounded transition-all ${
                        isWhiteActive
                          ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-400/50'
                          : isWhitePlayed
                          ? 'text-emerald-400 font-medium'
                          : 'text-gray-400'
                      }`}
                    >
                      {pair.white.san}
                    </span>
                  )}
                  {pair.black && (
                    <span
                      className={`px-1.5 py-0.5 rounded transition-all ${
                        isBlackActive
                          ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-400/50'
                          : isBlackPlayed
                          ? 'text-emerald-400 font-medium'
                          : 'text-gray-400'
                      }`}
                    >
                      {pair.black.san}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="px-4 py-2 bg-gray-950/60 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">✓ Played</span>
          <span>•</span>
          <span className="text-blue-400 font-medium">👉 Active / Next</span>
          <span>•</span>
          <span className="text-gray-400">Upcoming</span>
        </div>
        <div className="font-mono text-[10px] text-gray-500">
          {scenarioName || 'Master Line'}
        </div>
      </div>
    </div>
  )
}
