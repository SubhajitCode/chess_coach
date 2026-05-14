const RESULT_COLORS = {
  '1-0': { white: 'text-emerald-400', black: 'text-red-400' },
  '0-1': { white: 'text-red-400', black: 'text-emerald-400' },
  '1/2-1/2': { white: 'text-yellow-400', black: 'text-yellow-400' },
}

const RESULT_LABELS = {
  '1-0': { white: 'Win', black: 'Loss' },
  '0-1': { white: 'Loss', black: 'Win' },
  '1/2-1/2': { white: 'Draw', black: 'Draw' },
}

const RESULT_BG = {
  Win: 'bg-emerald-900/30 border-emerald-700/50',
  Loss: 'bg-red-900/30 border-red-700/50',
  Draw: 'bg-yellow-900/20 border-yellow-700/50',
}

function formatDate(unixTs) {
  if (!unixTs) return null
  const d = new Date(unixTs * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function prettifyOpening(raw) {
  if (!raw) return null
  if (raw.startsWith('http')) {
    const slug = raw.split('/').pop()
    return slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
  }
  return raw
}

export default function GameList({ games, username, onSelectGame }) {
  if (!games || games.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No games found. Try a different month or username.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {games.map((game, i) => {
        const isWhite = game.white?.toLowerCase() === username?.toLowerCase()
        const playerColor = isWhite ? 'white' : 'black'
        const opponent = isWhite ? game.black : game.white
        const opponentRating = isWhite ? game.black_rating : game.white_rating
        const result = game.result || '*'
        const resultColor = RESULT_COLORS[result]?.[playerColor] || 'text-gray-400'
        const resultLabel = RESULT_LABELS[result]?.[playerColor] || result
        const resultBg = RESULT_BG[resultLabel] || 'bg-gray-800 border-gray-700'
        const opening = prettifyOpening(game.opening)
        const date = formatDate(game.end_time)

        return (
          <button
            key={i}
            onClick={() => onSelectGame(game, playerColor)}
            className="w-full text-left bg-gray-800/60 hover:bg-gray-700/80 border border-gray-700 hover:border-gray-500 rounded-xl px-4 py-3 transition-all group"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0
                  ${playerColor === 'white' ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-100 border border-gray-600'}`}>
                  {playerColor === 'white' ? '♙' : '♟'}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-100 truncate">
                    vs <span className="text-white">{opponent}</span>
                    {opponentRating && <span className="text-gray-400 font-normal text-sm ml-1.5">({opponentRating})</span>}
                  </div>
                  <div className="text-xs text-gray-500 flex gap-2 mt-0.5 items-center flex-wrap">
                    {game.time_control && <span className="flex items-center gap-0.5">⏱ {game.time_control}</span>}
                    {date && <span className="text-gray-600">·</span>}
                    {date && <span>{date}</span>}
                    {opening && <span className="text-gray-600">·</span>}
                    {opening && <span className="truncate max-w-[200px] text-gray-400">{opening}</span>}
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 text-right flex flex-col items-end gap-1">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${resultBg} ${resultColor}`}>
                  {resultLabel}
                </span>
                <div className="text-xs text-gray-600">{game.source}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
