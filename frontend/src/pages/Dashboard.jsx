import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchGames, computePgnHash, checkPgnCache } from '../api/chess'
import GameList from '../components/GameList'

const PLATFORMS = [
  { id: 'chesscom', label: 'Chess.com', icon: '♟' },
  { id: 'lichess', label: 'Lichess', icon: '♜' },
]

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

const SORT_OPTIONS = [
  { id: 'date_desc', label: 'Date (Newest first)' },
  { id: 'date_asc', label: 'Date (Oldest first)' },
  { id: 'result', label: 'Result' },
  { id: 'opponent', label: 'Opponent (A–Z)' },
]

function sortGames(games, sortBy, username) {
  const sorted = [...games]
  switch (sortBy) {
    case 'date_asc':
      return sorted.sort((a, b) => (a.end_time ?? 0) - (b.end_time ?? 0))
    case 'result':
      return sorted.sort((a, b) => (a.result ?? '').localeCompare(b.result ?? ''))
    case 'opponent': {
      const getOpponent = g => {
        const u = (username || '').toLowerCase()
        return (g.white?.toLowerCase() === u ? g.black : g.white) ?? ''
      }
      return sorted.sort((a, b) => getOpponent(a).localeCompare(getOpponent(b)))
    }
    case 'date_desc':
    default:
      return sorted.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const now = new Date()

  const [username, setUsername] = useState(() => localStorage.getItem('chess_username') || '')
  const [platform, setPlatform] = useState(() => localStorage.getItem('chess_platform') || 'chesscom')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [games, setGames] = useState([])
  const [sortBy, setSortBy] = useState('date_desc')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cacheStatus, setCacheStatus] = useState({})

  const handleFetch = async (e) => {
    e?.preventDefault()
    if (!username.trim()) return
    localStorage.setItem('chess_username', username.trim())
    localStorage.setItem('chess_platform', platform)
    setLoading(true)
    setError(null)
    setGames([])
    setCacheStatus({})
    try {
      const res = await fetchGames(platform, username.trim(), year, month)
      const fetchedGames = res.data.games
      setGames(fetchedGames)
      
      // Compute PGN hashes and check cache status
      if (fetchedGames.length > 0) {
        try {
          const pgns = fetchedGames.map(g => g.pgn)
          const hashes = await Promise.all(pgns.map(pgn => computePgnHash(pgn)))
          
          // Attach hashes to games
          const gamesWithHashes = fetchedGames.map((game, idx) => ({
            ...game,
            pgn_hash: hashes[idx]
          }))
          setGames(gamesWithHashes)
          
          // Check cache status
          const cacheRes = await checkPgnCache(pgns)
          setCacheStatus(cacheRes.data.cache_status || {})
        } catch (err) {
          console.error('Failed to check cache status:', err)
          // Continue even if cache check fails
        }
      }
      
      if (fetchedGames.length === 0) setError('No games found for this period.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch games. Check your username.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectGame = (game, playerColor) => {
    navigate('/analysis', { state: { game, playerColor, username: username.trim() } })
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <span className="text-3xl">♛</span>
          <div>
            <h1 className="text-xl font-bold text-white">Chess Analyzer</h1>
            <p className="text-xs text-gray-400">Your personal AI chess coach</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Search Form */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Fetch Your Games</h2>
          <form onSubmit={handleFetch} className="space-y-4">
            {/* Platform Selector */}
            <div className="flex gap-3">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`flex-1 py-2.5 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2
                    ${platform === p.id
                      ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                      : 'border-gray-600 text-gray-400 hover:border-gray-400'
                    }`}
                >
                  <span className="text-lg">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Username */}
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={`Your ${PLATFORMS.find(p=>p.id===platform)?.label} username`}
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-gray-100 placeholder-gray-500
                  focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Month/Year (Chess.com only) */}
            {platform === 'chesscom' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Month</label>
                  <select
                    value={month}
                    onChange={e => setMonth(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2.5 text-gray-100 focus:outline-none focus:border-blue-500"
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Year</label>
                  <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2.5 text-gray-100 focus:outline-none focus:border-blue-500"
                  >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500
                text-white font-semibold rounded-xl transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⟳</span> Fetching games...
                </span>
              ) : 'Fetch Games'}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Game List */}
        {games.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-200">
                Games <span className="text-gray-500 text-sm font-normal">({games.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Sort:</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <GameList games={sortGames(games, sortBy, username)} username={username} onSelectGame={handleSelectGame} cacheStatus={cacheStatus} />
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="bg-gray-800 rounded-xl px-4 py-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-700 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-700 rounded w-1/3" />
                    <div className="h-2 bg-gray-700 rounded w-1/2" />
                  </div>
                  <div className="w-10 h-4 bg-gray-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
