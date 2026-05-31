export default function EvalBar({ evalScore }) {
  // evalScore is in centipawns from White's perspective
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

  let whitePercent = 50
  if (evalScore !== null && evalScore !== undefined) {
    // Map cp to percentage: ±500cp = near 100%/0%
    // Use sigmoid-like mapping
    const normalized = clamp(evalScore, -1000, 1000)
    whitePercent = 50 + (normalized / 1000) * 45
    whitePercent = clamp(whitePercent, 2, 98)
  }

  const blackPercent = 100 - whitePercent

  const displayEval = () => {
    if (evalScore === null || evalScore === undefined) return '0.0'
    if (Math.abs(evalScore) >= 9000) {
      return evalScore > 0 ? 'M' : '-M'
    }
    const pawns = evalScore / 100
    return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1)
  }

  return (
    <div className="flex flex-col items-center gap-1.5 h-[520px]">
      <div className="text-xs text-gray-300 font-mono font-semibold">{displayEval()}</div>
      <div className="w-5 flex-1 rounded-full overflow-hidden border border-gray-600 flex flex-col">
        {/* Black portion (top) */}
        <div
          className="bg-gray-700 transition-all duration-500"
          style={{ height: `${blackPercent}%` }}
        />
        {/* White portion (bottom) */}
        <div
          className="bg-gray-100 transition-all duration-500"
          style={{ height: `${whitePercent}%` }}
        />
      </div>
    </div>
  )
}
