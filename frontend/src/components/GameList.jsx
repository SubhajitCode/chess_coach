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

        return (
          <button
            key={i}
            onClick={() => onSelectGame(game, playerColor)}
            className="w-full text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-500 rounded-xl px-4 py-3 transition-all group"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0
                  ${playerColor === 'white' ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-100'}`}>
                  {playerColor === 'white' ? '♙' : '♟'}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-200 truncate">
                    vs <span className="text-white">{opponent}</span>
                    {opponentRating && <span className="text-gray-400 text-sm ml-1">({opponentRating})</span>}
                  </div>
                  <div className="text-xs text-gray-500 flex gap-2 mt-0.5">
                    {game.time_control && <span>⏱ {game.time_control}</span>}
                    {game.opening && <span className="truncate">📖 {game.opening}</span>}
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className={`font-bold text-sm ${resultColor}`}>{resultLabel}</div>
                <div className="text-xs text-gray-500">{game.source}</div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
