import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts'

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload
    const raw = d.rawEval ?? payload[0].value
    const pawns = raw >= 9000 ? 'Mate for White' : raw <= -9000 ? 'Mate for Black' : `${(raw / 100).toFixed(2)}`
    return (
      <div className="bg-gray-800/95 border border-gray-600 rounded-lg px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
        <div className="text-gray-300 flex items-center gap-1.5">
          <span>{d.color === 'white' ? '♙' : '♟'}</span>
          <span>Move {d.moveNumber}{d.color === 'white' ? '.' : '...'}:</span>
          <span className="font-mono text-white font-bold">{d.san}</span>
        </div>
        <div className={`font-bold mt-1 ${raw >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          Eval: {raw > 0 ? `+${pawns}` : pawns}
        </div>
        {d.classification && (
          <div className="text-gray-400 capitalize text-[11px] mt-0.5">{d.classification}</div>
        )}
      </div>
    )
  }
  return null
}

export default function EvalChart({ moves, currentIndex, onMoveClick }) {
  if (!moves || moves.length === 0) return null

  const data = moves.map((m, i) => ({
    index: i,
    moveNumber: m.move_number,
    san: m.move_san,
    color: m.color,
    eval: Math.min(1000, Math.max(-1000, m.eval_after ?? 0)),
    rawEval: m.eval_after,
    classification: m.classification,
  }))

  const handleChartClick = (e) => {
    if (!onMoveClick) return
    if (e?.activePayload?.[0]?.payload?.index !== undefined) {
      onMoveClick(e.activePayload[0].payload.index)
    } else if (e?.activeTooltipIndex !== undefined && e.activeTooltipIndex !== null) {
      onMoveClick(Number(e.activeTooltipIndex))
    }
  }

  const hasActiveMove = currentIndex !== null && currentIndex !== undefined && currentIndex >= 0 && currentIndex < data.length
  const activeEval = hasActiveMove ? data[currentIndex].eval : null

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Evaluation Chart</h3>
        {hasActiveMove && (
          <div className="text-[11px] font-mono text-gray-400">
            <span>{data[currentIndex].color === 'white' ? '♙' : '♟'} {data[currentIndex].moveNumber}{data[currentIndex].color === 'white' ? '.' : '...'} {data[currentIndex].san}</span>
            <span className={`ml-2 font-bold ${data[currentIndex].eval >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {(data[currentIndex].eval / 100).toFixed(2)}
            </span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} onClick={handleChartClick}>
          <XAxis
            dataKey="index"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickFormatter={(idx) => {
              const item = data[idx]
              if (!item) return ''
              return item.color === 'white' ? `${item.moveNumber}` : ''
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[-1000, 1000]}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickFormatter={v => `${(v / 100).toFixed(0)}`}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
          {hasActiveMove && (
            <ReferenceLine x={currentIndex} stroke="#3b82f6" strokeWidth={2} />
          )}
          {hasActiveMove && activeEval !== null && (
            <ReferenceDot
              x={currentIndex}
              y={activeEval}
              r={4.5}
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth={2}
            />
          )}
          <Line
            type="monotone"
            dataKey="eval"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#60a5fa' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
