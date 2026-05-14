import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload
    const val = payload[0].value
    const pawns = val >= 9000 ? 'Mate' : val <= -9000 ? '-Mate' : `${(val / 100).toFixed(2)}`
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs">
        <div className="text-gray-400">{d.color === 'white' ? '♙' : '♟'} Move {d.moveNumber}: <span className="font-mono text-white">{d.san}</span></div>
        <div className={`font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Eval: {pawns}</div>
        {d.classification && (
          <div className="text-gray-400 capitalize">{d.classification}</div>
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
    classification: m.classification,
  }))

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Evaluation Chart</h3>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} onClick={(e) => e?.activePayload && onMoveClick(e.activePayload[0].payload.index)}>
          <XAxis dataKey="moveNumber" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
          <YAxis domain={[-1000, 1000]} tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `${(v/100).toFixed(0)}`} width={30} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
          {currentIndex !== null && currentIndex >= 0 && (
            <ReferenceLine x={data[currentIndex]?.moveNumber} stroke="#3b82f6" strokeWidth={1.5} />
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
