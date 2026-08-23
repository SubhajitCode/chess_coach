import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchGames,
  computePgnHash,
  checkPgnCache,
  getPlayerProfile,
  savePlayerProfile,
} from '../api/chess'
import GameList from '../components/GameList'

const PROFILE_STORAGE_KEY = 'chess_profile_v1'
const LAST_SESSION_STORAGE_KEY = 'chess_last_analysis_v1'

const DEFAULT_PROFILE = {
  username: '',
  platform: 'chesscom',
  main_time_control: '',
  improvement_goal: '',
  focus_area: '',
}

const PLATFORMS = [
  { id: 'chesscom', label: 'Chess.com', icon: '♟' },
  { id: 'lichess', label: 'Lichess', icon: '♜' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const SORT_OPTIONS = [
  { id: 'date_desc', label: 'Date (Newest first)' },
  { id: 'date_asc', label: 'Date (Oldest first)' },
  { id: 'result', label: 'Result' },
  { id: 'opponent', label: 'Opponent (A-Z)' },
]

const TIME_CONTROL_OPTIONS = [
  { id: '', label: 'Choose your main time control' },
  { id: 'blitz', label: 'Blitz' },
  { id: 'rapid', label: 'Rapid' },
  { id: 'classical', label: 'Classical' },
  { id: 'daily', label: 'Daily / Correspondence' },
  { id: 'mixed', label: 'Mixed online play' },
]

const GOAL_OPTIONS = [
  { id: '', label: 'Choose your main improvement goal' },
  { id: 'blunder_reduction', label: 'Reduce blunders' },
  { id: 'tactical_awareness', label: 'Improve tactical awareness' },
  { id: 'opening_understanding', label: 'Understand my openings better' },
  { id: 'conversion', label: 'Convert winning positions' },
  { id: 'defense', label: 'Defend worse positions better' },
  { id: 'endgames', label: 'Improve endgames' },
]

const FOCUS_OPTIONS = [
  { id: '', label: 'Choose a current focus area (optional)' },
  { id: 'forcing_moves', label: 'Checking forcing moves first' },
  { id: 'calculation', label: 'Calculation and candidate moves' },
  { id: 'time_management', label: 'Time management' },
  { id: 'opening_plans', label: 'Opening plans and structures' },
  { id: 'conversion', label: 'Converting advantages' },
  { id: 'defense', label: 'Defensive technique' },
]

const COACH_PLANS = {
  blunder_reduction: {
    title: 'Reduce the one-move drops',
    summary: 'Pull recent losses first, then zoom in on the earliest large swing instead of reviewing every mistake equally.',
    checklist: [
      'Analyze the first decisive swing in each loss.',
      'Practice the missed tactic before moving to another game.',
      'Slow down in forcing positions and recaptures.',
    ],
  },
  tactical_awareness: {
    title: 'Train for forcing moves sooner',
    summary: 'Use recent sharp games as your source material so the coach can keep showing the motifs you missed in real play.',
    checklist: [
      'Prioritize games with sudden evaluation swings.',
      'Check captures, checks, and threats before quiet moves.',
      'Replay missed patterns until they feel familiar.',
    ],
  },
  opening_understanding: {
    title: 'Improve the positions after the opening',
    summary: 'Review recurring structures instead of memorizing long engine lines.',
    checklist: [
      'Look at the first position where you felt out of book.',
      'Note the plan you should remember next time.',
      'Use practice to rehearse the key setup or tactical trap.',
    ],
  },
  conversion: {
    title: 'Turn advantages into points',
    summary: 'Focus on the first moment your advantage started to slip and what practical plan would have kept control.',
    checklist: [
      'Analyze winning games that became messy.',
      'Prefer safe improving moves over flashy ones.',
      'Use the coach panel to compare your plan with the engine plan.',
    ],
  },
  defense: {
    title: 'Save more difficult positions',
    summary: 'Study losses where the position was still defensible so you can recognize resilient setups earlier.',
    checklist: [
      'Pick losses where the evaluation stayed playable for several moves.',
      'Look for defensive resources before counterattacking.',
      'Revisit the same defensive motif in practice.',
    ],
  },
  endgames: {
    title: 'Make endgames feel less random',
    summary: 'Use your own rook and pawn endings as the training set so the patterns come from positions you actually reach.',
    checklist: [
      'Import longer rapid or classical games.',
      'Analyze the transition into the endgame, not just the final blunder.',
      'Save recurring technical mistakes as your weekly review set.',
    ],
  },
  default: {
    title: 'Build a steady training loop',
    summary: 'Import a small batch of recent games, analyze one deeply, and only then move on to the next game.',
    checklist: [
      'Pick games from your main time control.',
      'Review the critical moment before the final blunder.',
      'Practice the idea you missed while it is still fresh.',
    ],
  },
}

function loadJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function normalizeProfile(profile) {
  return {
    ...DEFAULT_PROFILE,
    ...(profile || {}),
    username: (profile?.username || '').trim(),
    platform: profile?.platform || 'chesscom',
    main_time_control: profile?.main_time_control || '',
    improvement_goal: profile?.improvement_goal || '',
    focus_area: profile?.focus_area || '',
  }
}

function loadLocalProfile() {
  const stored = loadJsonStorage(PROFILE_STORAGE_KEY)
  if (stored) {
    return normalizeProfile(stored)
  }
  return normalizeProfile({
    username: localStorage.getItem('chess_username') || '',
    platform: localStorage.getItem('chess_platform') || 'chesscom',
  })
}

function persistLocalProfile(profile) {
  const normalized = normalizeProfile(profile)
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized))
  localStorage.setItem('chess_username', normalized.username)
  localStorage.setItem('chess_platform', normalized.platform)
}

function loadLastSession() {
  const stored = loadJsonStorage(LAST_SESSION_STORAGE_KEY)
  if (!stored?.game?.pgn) return null
  return stored
}

function formatDate(unixTs) {
  if (!unixTs) return null
  return new Date(unixTs * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatSavedAt(isoString) {
  if (!isoString) return null
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function prettifyOpening(raw) {
  if (!raw) return null
  if (raw.startsWith('http')) {
    const slug = raw.split('/').pop()
    return slug.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  }
  return raw
}

function sortGames(games, sortBy, username) {
  const sorted = [...games]
  switch (sortBy) {
    case 'date_asc':
      return sorted.sort((a, b) => (a.end_time ?? 0) - (b.end_time ?? 0))
    case 'result':
      return sorted.sort((a, b) => (a.result ?? '').localeCompare(b.result ?? ''))
    case 'opponent': {
      const getOpponent = (game) => {
        const player = (username || '').toLowerCase()
        return (game.white?.toLowerCase() === player ? game.black : game.white) ?? ''
      }
      return sorted.sort((a, b) => getOpponent(a).localeCompare(getOpponent(b)))
    }
    case 'date_desc':
    default:
      return sorted.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
  }
}

function getCoachPlan(profile) {
  return COACH_PLANS[profile.improvement_goal] || COACH_PLANS.default
}

export default function Dashboard() {
  const navigate = useNavigate()
  const now = new Date()
  const editedProfileRef = useRef(false)

  const [profile, setProfile] = useState(() => loadLocalProfile())
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileDirty, setProfileDirty] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [profileSavedAt, setProfileSavedAt] = useState(null)
  const [lastSession, setLastSession] = useState(() => loadLastSession())

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [games, setGames] = useState([])
  const [sortBy, setSortBy] = useState('date_desc')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cacheStatus, setCacheStatus] = useState({})

  const coachPlan = getCoachPlan(profile)
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)
  const selectedPlatform = PLATFORMS.find((item) => item.id === profile.platform) || PLATFORMS[0]
  const resumeGame = lastSession?.game || null
  const resumeDate = formatSavedAt(lastSession?.savedAt)
  const resumeOpening = prettifyOpening(resumeGame?.opening)
  const setupIncomplete = !profile.improvement_goal || !profile.main_time_control

  useEffect(() => {
    persistLocalProfile(profile)
  }, [profile])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await getPlayerProfile()
        const savedProfile = res.data?.profile
        if (cancelled || !savedProfile || editedProfileRef.current) return

        setProfile((current) => {
          const merged = normalizeProfile({
            username: savedProfile.username || current.username,
            platform: savedProfile.platform || current.platform,
            main_time_control: savedProfile.main_time_control || current.main_time_control,
            improvement_goal: savedProfile.improvement_goal || current.improvement_goal,
            focus_area: savedProfile.focus_area || current.focus_area,
          })
          persistLocalProfile(merged)
          return merged
        })
        setProfileSavedAt(savedProfile.updated_at || null)
      } catch (err) {
        if (!cancelled) {
          setProfileError(err.response?.data?.detail || 'Could not load your saved coach profile.')
        }
      } finally {
        if (!cancelled) {
          setProfileLoaded(true)
          setLastSession(loadLastSession())
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const updateProfileField = (field, value) => {
    editedProfileRef.current = true
    setProfileDirty(true)
    setProfile((current) => ({ ...current, [field]: value }))
  }

  const persistProfile = async (nextProfile, { silent = false } = {}) => {
    const normalizedProfile = normalizeProfile(nextProfile)
    setProfileSaving(true)
    if (!silent) {
      setProfileError(null)
    }

    try {
      const res = await savePlayerProfile(normalizedProfile)
      const savedProfile = normalizeProfile(res.data?.profile || normalizedProfile)
      editedProfileRef.current = false
      setProfile(savedProfile)
      setProfileDirty(false)
      setProfileSavedAt(res.data?.profile?.updated_at || new Date().toISOString())
      setProfileError(null)
      persistLocalProfile(savedProfile)
      return savedProfile
    } catch (err) {
      const detail = err.response?.data?.detail || 'Could not save your coach profile.'
      setProfileError(
        silent
          ? `${detail} Your local preferences were kept, so you can keep using the app.`
          : detail
      )
      throw err
    } finally {
      setProfileSaving(false)
    }
  }

  const handleFetch = async (e) => {
    e?.preventDefault()

    const trimmedUsername = profile.username.trim()
    if (!trimmedUsername) return

    const normalizedProfile = normalizeProfile({
      ...profile,
      username: trimmedUsername,
    })

    setProfile(normalizedProfile)
    if (profileDirty || !profileLoaded) {
      persistProfile(normalizedProfile, { silent: true }).catch(() => {})
    }

    setLoading(true)
    setError(null)
    setGames([])
    setCacheStatus({})

    try {
      const res = await fetchGames(normalizedProfile.platform, trimmedUsername, year, month)
      const fetchedGames = res.data.games
      setGames(fetchedGames)

      if (fetchedGames.length > 0) {
        try {
          const hashes = await Promise.all(fetchedGames.map((game) => computePgnHash(game.pgn)))
          const gamesWithHashes = fetchedGames.map((game, index) => ({
            ...game,
            pgn_hash: hashes[index],
          }))
          setGames(gamesWithHashes)

          const cacheRes = await checkPgnCache(fetchedGames.map((game) => game.pgn))
          setCacheStatus(cacheRes.data.cache_status || {})
        } catch (err) {
          console.error('Failed to check cache status:', err)
        }
      }

      if (fetchedGames.length === 0) {
        setError('No games found for this period.')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch games. Check your username.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    await persistProfile(profile)
  }

  const handleSelectGame = (game, playerColor) => {
    navigate('/analysis', {
      state: {
        game,
        playerColor,
        username: profile.username.trim(),
      },
    })
  }

  const handleResumeAnalysis = () => {
    if (!resumeGame?.pgn) return
    navigate('/analysis', {
      state: {
        game: resumeGame,
        playerColor: lastSession.playerColor || 'white',
        username: lastSession.username || profile.username.trim(),
      },
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">♛</span>
            <div>
              <h1 className="text-xl font-bold text-white">Chess Coach</h1>
              <p className="text-xs text-gray-400">Import games, diagnose leaks, and turn them into training.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/play')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold transition-all shadow-md hover:scale-105"
          >
            <span>⚔️</span> Spar with Human AI
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
          <section className="rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Current coaching focus</p>
                <h2 className="text-2xl font-semibold text-white">{coachPlan.title}</h2>
                <p className="mt-2 max-w-2xl text-sm text-gray-400">{coachPlan.summary}</p>
              </div>
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                <div className="font-semibold">{selectedPlatform.label}</div>
                <div className="text-blue-200/80">
                  {profile.main_time_control
                    ? `${profile.main_time_control} player`
                    : 'Set your main time control'}
                </div>
              </div>
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-3">
              {coachPlan.checklist.map((item) => (
                <div key={item} className="rounded-xl border border-gray-700 bg-gray-950/60 p-4 text-sm text-gray-300">
                  {item}
                </div>
              ))}
            </div>

            <form onSubmit={handleFetch} className="space-y-4">
              <div className="flex gap-3">
                {PLATFORMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => updateProfileField('platform', item.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                      profile.platform === item.id
                        ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                        : 'border-gray-600 text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">Username</label>
                <input
                  type="text"
                  value={profile.username}
                  onChange={(e) => updateProfileField('username', e.target.value)}
                  placeholder={`Your ${selectedPlatform.label} username`}
                  className="w-full rounded-xl border border-gray-600 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 transition-colors focus:border-blue-500 focus:outline-none"
                />
              </div>

              {profile.platform === 'chesscom' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">Month</label>
                    <select
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                      className="w-full rounded-xl border border-gray-600 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
                    >
                      {MONTHS.map((item, index) => (
                        <option key={item} value={index + 1}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">Year</label>
                    <select
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="w-full rounded-xl border border-gray-600 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
                    >
                      {years.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !profile.username.trim()}
                className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-all hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⟳</span> Fetching games...
                  </span>
                ) : 'Fetch Games'}
              </button>
            </form>
          </section>

          <aside className="space-y-6">
            {resumeGame?.pgn && (
              <section className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Continue where you left off</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      {resumeGame.white} vs {resumeGame.black}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleResumeAnalysis}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
                  >
                    Resume
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-emerald-100/80">
                  {resumeOpening && <span>{resumeOpening}</span>}
                  {resumeGame.time_control && <span>· {resumeGame.time_control}</span>}
                  {resumeGame.end_time && <span>· {formatDate(resumeGame.end_time)}</span>}
                  {resumeDate && <span>· Saved {resumeDate}</span>}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-gray-700 bg-gray-900 p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-400">Coach profile</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Tell the coach what you want to improve</h2>
                <p className="mt-2 text-sm text-gray-400">
                  These settings shape the guidance on the dashboard and keep your study loop centered on the part of your chess that matters most right now.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">Main time control</label>
                  <select
                    value={profile.main_time_control}
                    onChange={(e) => updateProfileField('main_time_control', e.target.value)}
                    className="w-full rounded-xl border border-gray-600 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    {TIME_CONTROL_OPTIONS.map((item) => (
                      <option key={item.id || 'empty'} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">Primary goal</label>
                  <select
                    value={profile.improvement_goal}
                    onChange={(e) => updateProfileField('improvement_goal', e.target.value)}
                    className="w-full rounded-xl border border-gray-600 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    {GOAL_OPTIONS.map((item) => (
                      <option key={item.id || 'empty'} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">Current focus</label>
                  <select
                    value={profile.focus_area}
                    onChange={(e) => updateProfileField('focus_area', e.target.value)}
                    className="w-full rounded-xl border border-gray-600 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    {FOCUS_OPTIONS.map((item) => (
                      <option key={item.id || 'empty'} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>

                {setupIncomplete && (
                  <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">
                    Add your main time control and goal to make the coach suggestions more specific.
                  </div>
                )}

                {profileError && (
                  <div className="rounded-xl border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">
                    {profileError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                  className="w-full rounded-xl border border-purple-500/40 bg-purple-500/10 py-2.5 text-sm font-semibold text-purple-200 transition-colors hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {profileSaving ? 'Saving coach profile...' : 'Save coach profile'}
                </button>

                <div className="text-xs text-gray-500">
                  {profileSavedAt
                    ? `Saved ${formatSavedAt(profileSavedAt)}`
                    : profileLoaded
                      ? 'Profile saved locally on this device until you store it.'
                      : 'Loading saved coach profile...'}
                </div>
              </div>
            </section>
          </aside>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-700 bg-red-900/30 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && games.length === 0 && !error && (
          <section className="mb-8 rounded-2xl border border-gray-700 bg-gray-900 p-6">
            <h2 className="mb-3 text-lg font-semibold text-gray-200">Your improvement loop</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-gray-700 bg-gray-950/60 p-4">
                <div className="mb-2 text-xl">1. 📥</div>
                <h3 className="mb-1 text-sm font-semibold text-gray-200">Import relevant games</h3>
                <p className="text-sm text-gray-400">
                  Start with recent {profile.main_time_control || 'main-control'} games so the patterns reflect how you are playing now.
                </p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-950/60 p-4">
                <div className="mb-2 text-xl">2. 🎓</div>
                <h3 className="mb-1 text-sm font-semibold text-gray-200">Study the turning point</h3>
                <p className="text-sm text-gray-400">
                  Use analysis to understand the moment that supports your goal: {coachPlan.title.toLowerCase()}.
                </p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-950/60 p-4">
                <div className="mb-2 text-xl">3. 🎯</div>
                <h3 className="mb-1 text-sm font-semibold text-gray-200">Practice the missed idea</h3>
                <p className="text-sm text-gray-400">
                  Finish the loop in Practice while the pattern is fresh so the next game feels different.
                </p>
              </div>
            </div>
          </section>
        )}

        {games.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-200">
                Games <span className="text-sm font-normal text-gray-500">({games.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Sort:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-lg border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <GameList
              games={sortGames(games, sortBy, profile.username)}
              username={profile.username}
              onSelectGame={handleSelectGame}
              cacheStatus={cacheStatus}
            />
          </section>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="animate-pulse rounded-xl bg-gray-800 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-gray-700" />
                    <div className="h-2 w-1/2 rounded bg-gray-700" />
                  </div>
                  <div className="h-4 w-10 rounded bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
