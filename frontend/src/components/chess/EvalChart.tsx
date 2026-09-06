import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { ChessMove } from '../../types/chess'

export interface EvalChartProps {
  moves?: ChessMove[]
  currentIndex?: number
  onMoveClick?: (index: number) => void
}

export default function EvalChart({
  moves = [],
  currentIndex = -1,
  onMoveClick,
}: EvalChartProps) {
  if (!moves || moves.length === 0) return null

  const data = moves.map((m, idx) => {
    let evalVal = 0
    if (m.eval_after !== null && m.eval_after !== undefined) {
      if (m.eval_after >= 9000) evalVal = 10
      else if (m.eval_after <= -9000) evalVal = -10
      else evalVal = Math.max(-10, Math.min(10, m.eval_after / 100))
    }
    return {
      index: idx,
      moveNumber: m.move_number,
      san: m.move_san || m.san,
      color: m.color,
      eval: evalVal,
      display:
        m.eval_after !== null && m.eval_after !== undefined
          ? (m.eval_after / 100).toFixed(1)
          : '0.0',
    }
  })

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Advantage Evaluation Graph
      </div>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            onClick={(e) => {
              if (!e || !onMoveClick || e.activeTooltipIndex === null || e.activeTooltipIndex === undefined) return
              if (typeof e.activeTooltipIndex === 'number') {
                onMoveClick(e.activeTooltipIndex)
              } else if (typeof e.activeTooltipIndex === 'string') {
                const parsed = parseInt(e.activeTooltipIndex, 10)
                if (!Number.isNaN(parsed)) {
                  onMoveClick(parsed)
                }
              }
            }}
          >
            <XAxis dataKey="moveNumber" hide />
            <YAxis domain={[-10, 10]} hide />
            <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload
                  return (
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-2 text-xs shadow-lg font-mono">
                      <div className="text-gray-300 font-bold">
                        {d.moveNumber}. {d.color === 'white' ? '' : '...'}{' '}
                        {d.san}
                      </div>
                      <div
                        className={
                          d.eval >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }
                      >
                        Eval: {d.display}
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Area
              type="monotone"
              dataKey="eval"
              stroke="#3b82f6"
              fill="#1d4ed8"
              fillOpacity={0.2}
              strokeWidth={1.5}
            />
            {currentIndex >= 0 && (
              <ReferenceLine
                x={currentIndex}
                stroke="#f59e0b"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
