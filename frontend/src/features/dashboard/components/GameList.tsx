import { formatDate, prettifyOpening } from '../../../core/chess/pgnParser'
import type { GameItem } from '../../../types/chess'

export interface GameListProps {
  games: GameItem[]
  loading: boolean
  selectedGame: GameItem | null
  onSelectGame: (game: GameItem) => void
  gamesSource: string | null
  username: string
  sortMode: string
  onSortChange: (mode: string) => void
  cacheStatus?: Record<string, boolean>
}

export default function GameList({
  games,
  loading,
  selectedGame,
  onSelectGame,
  gamesSource,
  username,
  sortMode,
  onSortChange,
  cacheStatus = {},
}: GameListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 bg-gray-900 rounded-xl border border-gray-800 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (!games || games.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 bg-gray-900/40 rounded-2xl border border-dashed border-gray-800">
        <div className="text-4xl mb-3">♟</div>
        <p className="font-semibold text-gray-300">No games loaded yet</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
          Fetch your recent games via the form above, or paste a PGN directly using
          the top button.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {gamesSource ? `Games from ${gamesSource}` : 'Loaded Games'}
          </span>
          <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded-full border border-gray-700 font-mono">
            {games.length}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 text-xs">
          <span className="text-gray-500 px-1 text-[11px]">Sort:</span>
          {[
            { id: 'date_desc', label: 'Newest' },
            { id: 'date_asc', label: 'Oldest' },
            { id: 'opponent', label: 'Opponent' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSortChange(s.id)}
              className={`px-2 py-0.5 rounded cursor-pointer ${
                sortMode === s.id
                  ? 'bg-gray-800 text-white font-medium shadow-xs'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {games.map((game, idx) => {
          const isWhite =
            username && game.white?.toLowerCase() === username.toLowerCase()
          const isBlack =
            username && game.black?.toLowerCase() === username.toLowerCase()
          const opponent = isWhite
            ? game.black
            : isBlack
            ? game.white
            : game.black

          let resultBadge = 'bg-gray-800 text-gray-400'
          let resultLabel = game.result || '*'
          if (game.result === '1-0') {
            resultBadge = isWhite
              ? 'bg-emerald-950/80 border border-emerald-700/60 text-emerald-300'
              : isBlack
              ? 'bg-red-950/80 border border-red-700/60 text-red-300'
              : 'bg-gray-800 text-gray-300'
            resultLabel = isWhite ? 'Won' : isBlack ? 'Lost' : '1-0'
          } else if (game.result === '0-1') {
            resultBadge = isBlack
              ? 'bg-emerald-950/80 border border-emerald-700/60 text-emerald-300'
              : isWhite
              ? 'bg-red-950/80 border border-red-700/60 text-red-300'
              : 'bg-gray-800 text-gray-300'
            resultLabel = isBlack ? 'Won' : isWhite ? 'Lost' : '0-1'
          } else if (game.result === '1/2-1/2') {
            resultBadge =
              'bg-yellow-950/80 border border-yellow-700/60 text-yellow-300'
            resultLabel = 'Draw'
          }

          const openingName = prettifyOpening(game.opening)
          const isCached = Boolean(game.pgn_hash && cacheStatus[game.pgn_hash])

          return (
            <button
              key={`${game.end_time || idx}-${game.white}-${game.black}`}
              type="button"
              onClick={() => onSelectGame(game)}
              className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5 cursor-pointer ${
                selectedGame === game
                  ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                  : 'bg-gray-900/90 border-gray-800 hover:border-gray-700 hover:bg-gray-850'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-3 h-3 rounded-full border ${
                      isWhite
                        ? 'bg-white border-gray-300'
                        : isBlack
                        ? 'bg-gray-900 border-gray-600'
                        : 'bg-gray-500 border-gray-400'
                    }`}
                    title={
                      isWhite
                        ? 'Played as White'
                        : isBlack
                        ? 'Played as Black'
                        : 'Game'
                    }
                  />
                  <span className="text-sm font-bold text-white truncate">
                    vs {opponent || 'Unknown Opponent'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${resultBadge}`}
                  >
                    {resultLabel}
                  </span>
                  {isCached && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 border border-emerald-700/60 text-emerald-400">
                      ✓ Cached
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400 w-full">
                <span className="truncate max-w-[200px]" title={openingName}>
                  {openingName || 'Standard Opening'}
                </span>
                <span>{game.time_control || 'Standard'}</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-800/80 w-full">
                <span>
                  {game.white_rating ? `W: ${game.white_rating}` : ''}
                  {game.white_rating && game.black_rating ? ' · ' : ''}
                  {game.black_rating ? `B: ${game.black_rating}` : ''}
                </span>
                <span>{formatDate(game.end_time)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
