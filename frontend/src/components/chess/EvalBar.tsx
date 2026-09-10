import type { PlayerColor } from '../../types/chess'

export interface EvalBarProps {
  evalScore?: number | null
  evalCp?: number | null
  playerColor?: PlayerColor
}

/**
 * EvalBar renders a vertical evaluation gauge for White vs Black in centipawns.
 * Supports both evalScore and evalCp props to maintain backward compatibility.
 */
export default function EvalBar({ evalScore, evalCp }: EvalBarProps) {
  const rawScore = evalScore !== undefined ? evalScore : evalCp
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v))

  let isMate = false
  let scoreText = '0.0'
  let whitePercent = 50

  if (rawScore !== null && rawScore !== undefined) {
    if (Math.abs(rawScore) >= 9000) {
      isMate = true
      const mateWinning = rawScore > 0
      scoreText = mateWinning ? 'M' : '-M'
      whitePercent = mateWinning ? 100 : 0
    } else {
      const pawns = rawScore / 100
      scoreText = (pawns >= 0 ? '+' : '') + pawns.toFixed(1)
      const clampedPawns = clamp(pawns, -10, 10)
      whitePercent = clamp(50 + (clampedPawns / 10) * 50, 0, 100)
    }
  }

  return (
    <div
      className="flex flex-col items-center select-none flex-shrink-0"
      style={{ width: 22, height: '100%', minHeight: 180 }}
    >
      <div className="relative w-full flex-1 rounded overflow-hidden bg-[#262421] border border-gray-700/80 shadow-inner flex flex-col justify-end">
        {/* White portion */}
        <div
          data-testid="eval-bar-white"
          className="w-full bg-[#f0d9b5] transition-all duration-300 ease-out"
          style={{ height: `${whitePercent}%` }}
        />

        {/* Numeric score badge */}
        <div
          className={`absolute left-0 right-0 text-center text-[10px] font-mono font-bold leading-none pointer-events-none transition-all duration-300 ${
            whitePercent > 50
              ? 'bottom-1 text-gray-900'
              : 'top-1 text-gray-100'
          } ${isMate ? 'text-amber-400 font-extrabold' : ''}`}
        >
          {scoreText}
        </div>
      </div>
    </div>
  )
}
