import type { ExplorerStats } from '../../../types/openings'

interface StatsCardProps {
  stats: ExplorerStats
}

export default function StatsCard({ stats }: StatsCardProps) {
  const total = stats.white + stats.draws + stats.black
  if (total === 0) return null

  const whitePct = Math.round((stats.white / total) * 100)
  const drawPct = Math.round((stats.draws / total) * 100)
  const blackPct = Math.round((stats.black / total) * 100)

  return (
    <div className="bg-gray-800/80 border border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
        <span className="font-semibold text-gray-100 flex items-center gap-2">
          <span>📊</span> Explorer Stats
        </span>
        <span className="text-xs text-gray-400">{total.toLocaleString()} games</span>
      </div>

      <div className="p-4">
        {/* Tri-color bar */}
        <div className="h-3 w-full flex rounded overflow-hidden mb-4">
          <div style={{ width: `${whitePct}%` }} className="bg-gray-100" title={`White wins: ${whitePct}%`} />
          <div style={{ width: `${drawPct}%` }} className="bg-gray-500" title={`Draws: ${drawPct}%`} />
          <div style={{ width: `${blackPct}%` }} className="bg-gray-900" title={`Black wins: ${blackPct}%`} />
        </div>

        <div className="space-y-2">
          {stats.moves.slice(0, 5).map((move, i) => {
            const moveTotal = move.white + move.draws + move.black
            const moveWhitePct = Math.round((move.white / moveTotal) * 100) || 0
            const moveDrawPct = Math.round((move.draws / moveTotal) * 100) || 0
            const moveBlackPct = Math.round((move.black / moveTotal) * 100) || 0

            return (
              <div key={i} className="flex items-center text-sm">
                <span className="w-12 font-mono text-gray-200">{move.san}</span>
                <span className="w-16 text-right text-gray-400 text-xs mr-3">{moveTotal.toLocaleString()}</span>
                <div className="flex-1 h-2 flex rounded overflow-hidden">
                  <div style={{ width: `${moveWhitePct}%` }} className="bg-gray-300" />
                  <div style={{ width: `${moveDrawPct}%` }} className="bg-gray-500" />
                  <div style={{ width: `${moveBlackPct}%` }} className="bg-gray-700" />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
