const CLASSIFICATION_COLORS = {
  best: 'text-emerald-400',
  excellent: 'text-green-400',
  good: 'text-lime-400',
  inaccuracy: 'text-yellow-400',
  mistake: 'text-orange-400',
  blunder: 'text-red-500',
}

const CLASSIFICATION_BG = {
  best: 'bg-emerald-900/40',
  excellent: 'bg-green-900/40',
  good: 'bg-lime-900/40',
  inaccuracy: 'bg-yellow-900/40',
  mistake: 'bg-orange-900/40',
  blunder: 'bg-red-900/50',
}

const CLASSIFICATION_ICONS = {
  best: '★',
  excellent: '✓✓',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

export default function MoveTable({ moves, currentIndex, playerColor, onMoveClick }) {
  if (!moves || moves.length === 0) return null

  // Pair moves into rows (white + black), tracking array indices explicitly
  const rows = []
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ white: moves[i], whiteIdx: i, black: moves[i + 1] || null, blackIdx: i + 1, moveNum: moves[i].move_number })
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Move Analysis</h3>
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800">
            <tr className="text-gray-400 text-xs uppercase">
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">White</th>
              <th className="px-3 py-2 text-left">Black</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ white: w, whiteIdx, black: b, blackIdx, moveNum }) => (
              <tr key={moveNum} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="px-3 py-1.5 text-gray-500 text-xs">{moveNum}</td>
                <td className="px-1 py-1">
                  <MoveCell move={w} index={whiteIdx} currentIndex={currentIndex} onMoveClick={onMoveClick} />
                </td>
                <td className="px-1 py-1">
                  <MoveCell move={b} index={b ? blackIdx : -1} currentIndex={currentIndex} onMoveClick={onMoveClick} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MoveCell({ move, index, currentIndex, onMoveClick }) {
  if (!move) return <span className="text-gray-600">—</span>

  const cls = move.classification
  const isActive = index === currentIndex
  const isPlayer = true

  return (
    <button
      onClick={() => onMoveClick(index)}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-left w-full transition-all
        ${isActive ? 'ring-1 ring-blue-400 ' + CLASSIFICATION_BG[cls] : 'hover:bg-gray-700/50'}
      `}
    >
      <span className={`text-xs font-bold w-5 ${CLASSIFICATION_COLORS[cls]}`}>
        {CLASSIFICATION_ICONS[cls]}
      </span>
      <span className={`font-mono font-medium ${isActive ? 'text-white' : 'text-gray-300'}`}>
        {move.move_san}
      </span>
      {move.cp_loss > 0 && (
        <span className="text-xs text-gray-500 ml-auto">
          -{Math.round(move.cp_loss)}
        </span>
      )}
    </button>
  )
}
