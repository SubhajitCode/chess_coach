import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchChessComGames,
  fetchLichessGames,
  checkCacheBatch,
  fetchProfile,
  saveProfile,
} from '../../../api/chess'
import {
  PLATFORMS,
  getCoachPlan,
} from '../../../core/coaching/coachPlans'
import { sortGames } from '../../../core/chess/pgnParser'
import {
  loadLocalProfile,
  persistLocalProfile,
  loadLastSession,
  type AnalysisSessionRecord,
} from '../../../core/storage/profileStorage'
import type { CoachProfile } from '../../../types/coaching'
import type { GameItem, PlayerColor } from '../../../types/chess'

export function useDashboard() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const initialProfile = useMemo(() => loadLocalProfile(), [])
  const [profile, setProfile] = useState<CoachProfile>(initialProfile)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSavedAt, setProfileSavedAt] = useState<number | string | null>(
    initialProfile.updated_at || null
  )
  const [profileNotice, setProfileNotice] = useState<string | null>(null)

  const [year, setYear] = useState<number>(currentYear)
  const [month, setMonth] = useState<number>(currentMonth)
  const [games, setGames] = useState<GameItem[]>([])
  const [sortBy, setSortBy] = useState<string>('date_desc')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [cacheStatus, setCacheStatus] = useState<Record<string, boolean>>({})

  const [gamesSource, setGamesSource] = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState<GameItem | null>(null)
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white')
  const [customPgn, setCustomPgn] = useState<string>('')
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false)
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false)

  const lastSession: AnalysisSessionRecord | null = useMemo(
    () => loadLastSession(),
    []
  )
  const resumeGame = lastSession?.game || null

  const coachPlan = useMemo(() => getCoachPlan(profile), [profile])
  const setupIncomplete =
    !profile.main_time_control || !profile.improvement_goal

  const selectedPlatform = useMemo(
    () =>
      PLATFORMS.find((p) => p.id === profile.platform) || PLATFORMS[0],
    [profile.platform]
  )

  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - i),
    [currentYear]
  )

  // Fetch saved profile from backend on mount
  useEffect(() => {
    if (!profile.username) {
      setProfileLoaded(true)
      return
    }
    let cancelled = false
    fetchProfile(profile.username, profile.platform)
      .then((serverProfile) => {
        if (cancelled || !serverProfile) return
        setProfile((prev) => {
          const merged: CoachProfile = {
            ...prev,
            ...serverProfile,
            username: prev.username || serverProfile.username,
            platform: prev.platform || serverProfile.platform,
          }
          persistLocalProfile(merged)
          return merged
        })
        setProfileSavedAt(serverProfile.updated_at || null)
      })
      .catch(() => {
        // Fallback to local profile
      })
      .finally(() => {
        if (!cancelled) setProfileLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [profile.username, profile.platform])

  const updateProfileField = useCallback(
    (field: keyof CoachProfile, value: string) => {
      setProfile((prev) => {
        const next = { ...prev, [field]: value }
        persistLocalProfile(next)
        return next
      })
    },
    []
  )

  const handleFetch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!profile.username.trim()) return

      setLoading(true)
      setError(null)
      setGames([])
      setCacheStatus({})

      try {
        let result: { games: GameItem[] }
        if (profile.platform === 'chesscom') {
          result = await fetchChessComGames(profile.username.trim(), year, month)
          setGamesSource(`Chess.com (${profile.username.trim()})`)
        } else {
          result = await fetchLichessGames(profile.username.trim(), 30)
          setGamesSource(`Lichess (${profile.username.trim()})`)
        }

        const fetchedGames = result.games || []
        setGames(fetchedGames)

        const hashes = fetchedGames
          .map((g) => g.pgn_hash)
          .filter((h): h is string => Boolean(h))

        if (hashes.length > 0) {
          checkCacheBatch(hashes)
            .then(setCacheStatus)
            .catch(() => {})
        }
      } catch (err: any) {
        setError(
          err?.extractedDetail ||
            err?.response?.data?.detail ||
            err?.message ||
            'Failed to fetch games'
        )
      } finally {
        setLoading(false)
      }
    },
    [profile.username, profile.platform, year, month]
  )

  const handleSaveProfile = useCallback(
    async (updatedProfile?: CoachProfile) => {
      const target = updatedProfile || profile
      if (!target.username.trim()) {
        setProfileError('Enter a username first so we can save your profile.')
        return
      }
      setProfileSaving(true)
      setProfileError(null)
      setProfileNotice(null)
      try {
        const saved = await saveProfile(target)
        setProfile(saved)
        setProfileSavedAt(saved.updated_at || new Date().toISOString())
        persistLocalProfile(saved)
        setProfileNotice('Profile saved successfully!')
        setTimeout(() => setProfileNotice(null), 3500)
      } catch (err: any) {
        setProfileError(
          err?.extractedDetail ||
            err?.response?.data?.detail ||
            'Failed to save coach profile to server'
        )
      } finally {
        setProfileSaving(false)
      }
    },
    [profile]
  )

  const handleSelectGame = useCallback(
    (game: GameItem, playerColorOverride?: PlayerColor) => {
      setSelectedGame(game)
      const determinedColor: PlayerColor =
        playerColorOverride ||
        (profile.username &&
        game.black?.toLowerCase() === profile.username.toLowerCase()
          ? 'black'
          : 'white')
      navigate('/analysis', {
        state: {
          game,
          playerColor: determinedColor,
          username: profile.username,
        },
      })
    },
    [navigate, profile.username]
  )

  const handleResumeAnalysis = useCallback(() => {
    if (!lastSession?.game) return
    navigate('/analysis', {
      state: {
        game: lastSession.game,
        playerColor: lastSession.playerColor,
        username: lastSession.username || profile.username,
      },
    })
  }, [lastSession, navigate, profile.username])

  const handleAnalyzeCustomPgn = useCallback(() => {
    if (!customPgn.trim()) return
    const customGame: GameItem = {
      pgn: customPgn.trim(),
      white: playerColor === 'white' ? (profile.username || 'You') : 'Opponent',
      black: playerColor === 'black' ? (profile.username || 'You') : 'Opponent',
      end_time: Date.now(),
      source: 'custom_pgn',
    }
    setGamesSource('Custom PGN')
    setShowPasteModal(false)
    navigate('/analysis', {
      state: {
        game: customGame,
        playerColor,
        username: profile.username,
      },
    })
  }, [customPgn, playerColor, profile.username, navigate])

  const sortedGames = useMemo(
    () => sortGames(games, sortBy, profile.username),
    [games, sortBy, profile.username]
  )

  return {
    profile,
    profileLoaded,
    profileSaving,
    profileError,
    profileSavedAt,
    profileNotice,
    coachPlan,
    activePlan: coachPlan,
    planProfile: profile,
    setupIncomplete,
    selectedPlatform,
    years,
    year,
    setYear,
    month,
    setMonth,
    games: sortedGames,
    rawGamesCount: games.length,
    sortBy,
    setSortBy,
    sortMode: sortBy,
    setSortMode: setSortBy,
    loading,
    error,
    cacheStatus,
    gamesSource,
    setGamesSource,
    selectedGame,
    setSelectedGame,
    playerColor,
    setPlayerColor,
    customPgn,
    setCustomPgn,
    showPasteModal,
    setShowPasteModal,
    profileModalOpen,
    setProfileModalOpen,
    lastSession,
    resumeGame,
    updateProfileField,
    handleFetch,
    handleFetchGames: handleFetch,
    handleSaveProfile,
    handleSelectGame,
    handleResumeAnalysis,
    handleResumeSession: handleResumeAnalysis,
    handleAnalyzeCustomPgn,
    navigate,
  }
}
