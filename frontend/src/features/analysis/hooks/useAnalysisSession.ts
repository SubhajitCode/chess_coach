import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  analyzeGameStream,
  getPerMoveCoaching,
  getCachedPerMoveCoaching,
  getCachedAnalysis,
  getGameOverview,
  fetchEngines,
} from '../../../api/chess'
import { computePgnHash } from '../../../core/chess/hash'
import {
  extractPgnHeaders,
  parsePgnMoves,
} from '../../../core/chess/pgnParser'
import { computeFenForMoveIndex, START_FEN } from '../../../core/chess/fenTree'
import { estimateElo } from '../../../core/chess/eloCalculator'
import { persistLastSession } from '../../../core/storage/profileStorage'
import { useDeviationExplorer } from './useDeviationExplorer'
import type {
  ChessMove,
  EngineOption,
  GameItem,
  GameSummary,
  PlayerColor,
  ArrowItem,
} from '../../../types/chess'
import type { CoachProfile, GameOverviewResponse } from '../../../types/coaching'
import type { AnalyzeStreamMeta } from '../../../types/api'

export function useAnalysisSession() {
  const { state } = useLocation()
  const navigate = useNavigate()

  const game: GameItem | undefined = state?.game
  const username: string | null = state?.username || null
  const initialPlayerColor: PlayerColor =
    state?.playerColor ||
    (username && game?.black?.toLowerCase() === username.toLowerCase()
      ? 'black'
      : 'white')

  const [playerColor, setPlayerColor] = useState<PlayerColor>(initialPlayerColor)
  const [streamedMoves, setStreamedMoves] = useState<ChessMove[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)
  const [summary, setSummary] = useState<GameSummary | null>(null)
  const [gameMeta, setGameMeta] = useState<AnalyzeStreamMeta | null>(null)
  const [analyzing, setAnalyzing] = useState<boolean>(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [analyzedCount, setAnalyzedCount] = useState<number>(0)

  // Engine selection state
  const [selectedEngine, setSelectedEngine] = useState<string>('stockfish')
  const [availableEngines, setAvailableEngines] = useState<EngineOption[]>([])

  // Coaching state
  const [moveCoaching, setMoveCoaching] = useState<Record<number, string>>({})
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null)
  const [coachLoading, setCoachLoading] = useState<boolean>(false)
  const [coachError, setCoachError] = useState<string | null>(null)
  const [gameOverview, setGameOverview] = useState<GameOverviewResponse | null>(null)
  const [overviewLoading, setOverviewLoading] = useState<boolean>(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [pgnHash, setPgnHash] = useState<string | null>(null)

  const [depth, setDepth] = useState<number>(18)
  const [showArrows, setShowArrows] = useState<boolean>(true)
  const [trackLatest, setTrackLatest] = useState<boolean>(true)
  const [fromCache, setFromCache] = useState<boolean>(false)
  const [bestLinePreview, setBestLinePreview] = useState<{ fen: string; from: string; to: string } | null>(null)
  const [rightTab, setRightTab] = useState<string>('moves')

  const abortRef = useRef<{ abort: () => void } | null>(null)
  const previewActiveRef = useRef<boolean>(false)
  const trackLatestRef = useRef<boolean>(true)

  const clearPreviewState = useCallback(() => {
    setBestLinePreview(null)
    previewActiveRef.current = false
  }, [])

  const switchRightTab = useCallback(
    (tab: string) => {
      clearPreviewState()
      setRightTab(tab)
    },
    [clearPreviewState]
  )

  const setTrackLatestState = useCallback((value: boolean) => {
    trackLatestRef.current = value
    setTrackLatest(value)
  }, [])

  useEffect(() => {
    if (!game?.pgn) {
      navigate('/', { replace: true })
    }
  }, [game?.pgn, navigate])

  // Persist session to local storage
  useEffect(() => {
    if (!game?.pgn) return
    persistLastSession({
      game: {
        pgn: game.pgn,
        white: game.white,
        black: game.black,
        result: game.result,
        opening: game.opening,
        time_control: game.time_control,
        end_time: game.end_time,
        source: game.source,
        white_rating: game.white_rating,
        black_rating: game.black_rating,
        pgn_hash: pgnHash || game.pgn_hash || undefined,
      },
      playerColor,
      username: username || null,
    })
  }, [game, pgnHash, playerColor, username])

  // Bootstrap cached analysis
  useEffect(() => {
    if (!game?.pgn) return
    let cancelled = false
    ;(async () => {
      try {
        const hash = await computePgnHash(game.pgn)
        if (cancelled) return
        setPgnHash(hash)
        const cached = await getCachedAnalysis(hash)
        if (cancelled || !cached) return
        setStreamedMoves(cached.moves || [])

        let cachedSummary: GameSummary | null = cached.summary || null
        if (cachedSummary) {
          const playerMoves = (cached.moves || []).filter(
            (m) => m.color === playerColor
          )
          if (playerMoves.length > 0) {
            const avgCpLoss =
              playerMoves.reduce((acc, m) => acc + (m.cp_loss || 0), 0) /
              playerMoves.length
            cachedSummary = {
              ...cachedSummary,
              estimated_elo: estimateElo(avgCpLoss) || undefined,
            }
          }
        }
        setSummary(cachedSummary)

        const pgnHeaders = extractPgnHeaders(game.pgn)
        const openingFromPgn =
          pgnHeaders.Opening || pgnHeaders.ECOUrl || null
        if (openingFromPgn)
          setGameMeta((prev) => ({ ...(prev || {}), opening: openingFromPgn }))
        const analysisForOverview = {
          opening: openingFromPgn || game.opening || null,
          time_control: game.time_control || null,
          white: game.white,
          black: game.black,
          result: game.result,
          moves: cached.moves || [],
          summary: cachedSummary || null,
        }

        setFromCache(true)
        setTrackLatestState(false)
        setCurrentIndex(-1)

        const coachRes = await getCachedPerMoveCoaching(hash)
        if (!cancelled) {
          setCoachProfile(coachRes?.profile_used || null)
        }
        if (!cancelled && coachRes?.coaching?.length) {
          const coaching = coachRes.coaching
          if (coaching.length >= (cached.moves || []).length) {
            const map: Record<number, string> = {}
            coaching.forEach((c) => {
              map[c.move_index] = c.feedback
            })
            setMoveCoaching(map)
            switchRightTab('coach')
          }
        }

        if (!cancelled && (cached.moves || []).length > 0) {
          setOverviewLoading(true)
          setOverviewError(null)
          try {
            const overviewRes = await getGameOverview(
              hash,
              analysisForOverview,
              playerColor,
              username
            )
            if (!cancelled) {
              setGameOverview(overviewRes?.data || null)
            }
          } catch (err: any) {
            if (!cancelled) {
              setOverviewError(
                err?.extractedDetail ||
                  err?.response?.data?.detail ||
                  'Game overview failed'
              )
            }
          } finally {
            if (!cancelled) setOverviewLoading(false)
          }
        }
      } catch {
        // Keep page usable
      }
    })()
    return () => {
      cancelled = true
    }
  }, [game, playerColor, setTrackLatestState, switchRightTab, username])

  const parsedGameMoves = useMemo(() => parsePgnMoves(game?.pgn), [game?.pgn])
  const boardMoves = streamedMoves.length > 0 ? streamedMoves : parsedGameMoves
  const totalMoves = gameMeta?.total_moves ?? parsedGameMoves.length
  const maxNavigableIndex = Math.max(-1, boardMoves.length - 1)
  const activeIndex =
    currentIndex > maxNavigableIndex ? maxNavigableIndex : currentIndex

  const currentFen = useMemo(
    () => computeFenForMoveIndex(boardMoves, activeIndex),
    [boardMoves, activeIndex]
  )

  const {
    exploreMode,
    exploreStack,
    exploreAnalyzing,
    exploreBoardFen,
    handleEnterExplore,
    handleExitExplore,
    handleExploreUndo,
    handleExploreReset,
    handleExplorePieceDrop,
  } = useDeviationExplorer({
    currentFen,
    onExitCallback: () => {
      clearPreviewState()
      setRightTab(Object.keys(moveCoaching).length > 0 ? 'coach' : 'moves')
    },
  })

  const displayFen = bestLinePreview?.fen ?? currentFen
  const boardPosition = displayFen.split(' ')[0] || START_FEN

  const analysisArrows = useMemo(() => {
    if (bestLinePreview) {
      return [
        {
          startSquare: bestLinePreview.from,
          endSquare: bestLinePreview.to,
          color: 'rgba(16, 185, 129, 0.9)',
        },
      ]
    }

    if (!showArrows) return []

    const activeMove = (activeIndex >= 0
      ? boardMoves[activeIndex]
      : boardMoves[0]) as ChessMove | undefined
    if (!activeMove) return []

    const arrows: ArrowItem[] = []

    if (activeMove.best_move_uci && activeMove.best_move_uci.length >= 4) {
      arrows.push({
        startSquare: activeMove.best_move_uci.slice(0, 2),
        endSquare: activeMove.best_move_uci.slice(2, 4),
        color: 'rgba(16, 185, 129, 0.8)',
      })
    }

    const isMistake =
      activeMove.classification === 'mistake' ||
      activeMove.classification === 'blunder'
    if (
      isMistake &&
      activeIndex >= 0 &&
      activeMove.move_uci &&
      activeMove.move_uci.length >= 4
    ) {
      arrows.push({
        startSquare: activeMove.move_uci.slice(0, 2),
        endSquare: activeMove.move_uci.slice(2, 4),
        color: 'rgba(239, 68, 68, 0.8)',
      })
    }

    return arrows
  }, [bestLinePreview, showArrows, activeIndex, boardMoves])

  const currentMove =
    streamedMoves[activeIndex] || parsedGameMoves[activeIndex] || null
  const currentEval = currentMove?.eval_after ?? null
  const hasMoveCoaching = Object.keys(moveCoaching).length > 0

  const highlightSquares = useMemo(() => {
    if (!currentMove?.move_uci || currentMove.move_uci.length < 4) return {}
    return {
      [currentMove.move_uci.slice(0, 2)]: {
        backgroundColor: 'rgba(255, 255, 100, 0.4)',
      },
      [currentMove.move_uci.slice(2, 4)]: {
        backgroundColor: 'rgba(255, 255, 100, 0.4)',
      },
    }
  }, [currentMove])

  useEffect(() => {
    fetchEngines()
      .then((data) => setAvailableEngines(data.engines || []))
      .catch(() => {})
  }, [])

  const fullAnalysis = useMemo(
    () =>
      game && summary && streamedMoves.length > 0
        ? {
            ...(gameMeta || {}),
            white: game.white,
            black: game.black,
            result: game.result,
            moves: streamedMoves,
            summary,
          }
        : null,
    [summary, streamedMoves, gameMeta, game]
  )

  const handleAnalyze = useCallback(() => {
    if (!game?.pgn) return
    abortRef.current?.abort()

    clearPreviewState()
    setAnalyzing(true)
    setAnalyzeError(null)
    setStreamedMoves([])
    setSummary(null)
    setGameMeta(null)
    setMoveCoaching({})
    setCoachProfile(null)
    setCoachLoading(false)
    setCoachError(null)
    setGameOverview(null)
    setOverviewLoading(false)
    setOverviewError(null)
    setAnalyzedCount(0)
    setTrackLatestState(true)
    setCurrentIndex(-1)
    setFromCache(false)
    handleExitExplore()
    setRightTab('moves')

    const collectedMovesRef: { current: ChessMove[] } = { current: [] }
    const collectedSummaryRef: { current: GameSummary | null } = { current: null }
    const collectedMetaRef: { current: AnalyzeStreamMeta | null } = { current: null }

    abortRef.current = analyzeGameStream({
      pgn: game.pgn,
      depth,
      playerColor,
      engine: selectedEngine,
      onMeta: (meta) => {
        setGameMeta(meta)
        collectedMetaRef.current = meta
      },
      onMove: (move) => {
        let nextLength = 0
        setStreamedMoves((prev) => {
          const updated = [...prev, move]
          collectedMovesRef.current = updated
          nextLength = updated.length
          return updated
        })
        if (trackLatestRef.current) {
          setCurrentIndex(nextLength - 1)
        }
        setAnalyzedCount((c) => c + 1)
      },
      onSummary: (s) => {
        setSummary(s)
        collectedSummaryRef.current = s
      },
      onDone: async () => {
        setAnalyzing(false)
        setTrackLatestState(false)

        const moves = collectedMovesRef.current
        const summ = collectedSummaryRef.current
        if (moves.length > 0 && pgnHash) {
          const analysis = {
            ...(collectedMetaRef.current || {}),
            white: game.white,
            black: game.black,
            result: game.result,
            moves,
            summary: summ,
          }
          setCoachLoading(true)
          setOverviewLoading(true)
          setOverviewError(null)

          const [perMoveResult, overviewResult] = await Promise.allSettled([
            getPerMoveCoaching(pgnHash, analysis, playerColor, username),
            getGameOverview(pgnHash, analysis, playerColor, username),
          ])

          if (perMoveResult.status === 'fulfilled') {
            const map: Record<number, string> = {}
            perMoveResult.value?.data?.coaching?.forEach((c) => {
              map[c.move_index] = c.feedback
            })
            setMoveCoaching(map)
            setCoachProfile(perMoveResult.value?.data?.profile_used || null)
            setCoachError(null)
            switchRightTab('coach')
          } else {
            const err = perMoveResult.reason
            setCoachError(
              err?.extractedDetail ||
                err?.response?.data?.detail ||
                'Coaching failed'
            )
          }

          if (overviewResult.status === 'fulfilled') {
            setGameOverview(overviewResult.value?.data || null)
            setOverviewError(null)
          } else {
            const err = overviewResult.reason
            setOverviewError(
              err?.extractedDetail ||
                err?.response?.data?.detail ||
                'Game overview failed'
            )
          }

          setCoachLoading(false)
          setOverviewLoading(false)
        }
      },
      onError: (msg) => {
        setAnalyzeError(msg)
        setAnalyzing(false)
        setTrackLatestState(false)
      },
    })
  }, [
    clearPreviewState,
    setTrackLatestState,
    handleExitExplore,
    game,
    depth,
    playerColor,
    selectedEngine,
    pgnHash,
    username,
    switchRightTab,
  ])

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleMoveClick = useCallback(
    (index: number) => {
      setTrackLatestState(false)
      clearPreviewState()
      setCurrentIndex(index)
    },
    [clearPreviewState, setTrackLatestState]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') return
      if (previewActiveRef.current) return
      if (e.key === 'ArrowLeft') {
        setTrackLatestState(false)
        clearPreviewState()
        setCurrentIndex((i) => Math.max(-1, i - 1))
      } else if (e.key === 'ArrowRight') {
        setTrackLatestState(false)
        clearPreviewState()
        setCurrentIndex((i) => Math.min(maxNavigableIndex, i + 1))
      }
    },
    [clearPreviewState, maxNavigableIndex, setTrackLatestState]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleRequestOverview = useCallback(async () => {
    if (!fullAnalysis || !pgnHash) return
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const res = await getGameOverview(
        pgnHash,
        fullAnalysis,
        playerColor,
        username
      )
      setGameOverview(res?.data || null)
    } catch (err: any) {
      setOverviewError(
        err?.extractedDetail ||
          err?.response?.data?.detail ||
          'Game overview failed'
      )
    } finally {
      setOverviewLoading(false)
    }
  }, [fullAnalysis, pgnHash, playerColor, username])

  const handleRequestCoaching = useCallback(async () => {
    if (!fullAnalysis || !pgnHash) return
    setCoachLoading(true)
    setCoachError(null)
    try {
      const res = await getPerMoveCoaching(
        pgnHash,
        fullAnalysis,
        playerColor,
        username
      )
      const map: Record<number, string> = {}
      res.data.coaching.forEach((c) => {
        map[c.move_index] = c.feedback
      })
      setMoveCoaching(map)
      setCoachProfile(res.data.profile_used || null)
      switchRightTab('coach')
    } catch (err: any) {
      setCoachError(
        err?.extractedDetail ||
          err?.response?.data?.detail ||
          'Coaching failed'
      )
    } finally {
      setCoachLoading(false)
    }
  }, [fullAnalysis, pgnHash, playerColor, username, switchRightTab])

  const onEnterExploreMode = useCallback(() => {
    clearPreviewState()
    handleEnterExplore()
    setRightTab('explore')
  }, [clearPreviewState, handleEnterExplore])

  return {
    game,
    username,
    playerColor,
    setPlayerColor,
    streamedMoves,
    boardMoves,
    totalMoves,
    currentIndex: activeIndex,
    setCurrentIndex,
    summary,
    gameMeta,
    analyzing,
    analyzeError,
    analyzedCount,
    selectedEngine,
    setSelectedEngine,
    availableEngines,
    moveCoaching,
    coachProfile,
    coachLoading,
    coachError,
    gameOverview,
    overviewLoading,
    overviewError,
    depth,
    setDepth,
    showArrows,
    setShowArrows,
    trackLatest,
    setTrackLatestState,
    fromCache,
    bestLinePreview,
    setBestLinePreview,
    clearPreviewState,
    previewActiveRef,
    rightTab,
    switchRightTab,
    exploreMode,
    exploreStack,
    exploreAnalyzing,
    exploreBoardFen,
    boardPosition,
    analysisArrows,
    highlightSquares,
    currentMove,
    currentEval,
    hasMoveCoaching,
    fullAnalysis,
    maxNavigableIndex,
    handleAnalyze,
    handleMoveClick,
    handleRequestOverview,
    handleRequestCoaching,
    handleEnterExplore: onEnterExploreMode,
    handleExitExplore,
    handleExploreUndo,
    handleExploreReset,
    handleExplorePieceDrop,
    navigate,
  }
}
