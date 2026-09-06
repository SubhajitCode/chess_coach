import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { analyzePosition, getDeviationCoaching } from '../../../api/chess'
import {
  buildFensBefore,
  buildFensAfter,
  decodeLine,
  uciToReadable,
} from '../../../core/chess/fenTree'
import type {
  ChessMove,
  LineStep,
  PlayerColor,
  ArrowItem,
} from '../../../types/chess'

export const MAX_ATTEMPTS = 3
export const DEPTH_DEEP = 22
export const PV_LENGTH = 6

export interface PracticeExplanation {
  loading: boolean
  error: string | null
  text: string | null
  depth: number
  bestLineSan?: string[]
  bestLineUci?: string[]
  deviationBestLineSan?: string[]
  deviationBestLineUci?: string[]
  fenAfter?: string | null
}

export interface PracticeMoveItem extends ChessMove {
  originalIdx: number
  fenBefore: string
}

export function usePracticeSession() {
  const rawLocation = useLocation()
  const navigate = useNavigate()

  const state =
    rawLocation.state ??
    (() => {
      try {
        const s = new URLSearchParams(window.location.search).get('state')
        if (!s) return null
        return JSON.parse(decodeURIComponent(s))
      } catch {
        return null
      }
    })()

  const moves: ChessMove[] = useMemo(() => state?.moves ?? [], [state])
  const playerColor: PlayerColor = state?.playerColor || 'white'
  const gameInfo = state?.gameInfo || {}

  const defaultFilter = useMemo(() => {
    const mine = moves.filter(
      (m) =>
        (m.classification === 'blunder' || m.classification === 'mistake') &&
        m.color === playerColor
    ).length
    return mine > 0 ? 'mine' : 'all'
  }, [moves, playerColor])

  const [filter, setFilter] = useState<string>(defaultFilter)
  const [step, setStep] = useState<number>(0)
  const [phase, setPhase] = useState<'playing' | 'correct' | 'revealed'>('playing')
  const [attempts, setAttempts] = useState<number>(0)
  const [hintsUsed, setHintsUsed] = useState<number>(0)
  const [streak, setStreak] = useState<number>(0)
  const [maxStreak, setMaxStreak] = useState<number>(0)
  const [solvedCount, setSolvedCount] = useState<number>(0)
  const [done, setDone] = useState<boolean>(false)
  const [attemptedUci, setAttemptedUci] = useState<string | null>(null)
  const [results, setResults] = useState<('correct' | 'wrong' | 'skipped')[]>([])
  const [shake, setShake] = useState<boolean>(false)
  const [reviewOffset, setReviewOffset] = useState<number>(0)

  const fensBefore = useMemo(() => buildFensBefore(moves), [moves])
  const fensAfter = useMemo(() => buildFensAfter(moves), [moves])

  const [explanations, setExplanations] = useState<Record<number, PracticeExplanation>>({})
  const [bestLinePreview, setBestLinePreview] = useState<{ fen: string; from: string; to: string } | null>(null)
  const [bestLineSteps, setBestLineSteps] = useState<LineStep[]>([])
  const [bestLineIdx, setBestLineIdx] = useState<number | null>(null)
  const [devLineSteps, setDevLineSteps] = useState<LineStep[]>([])
  const [devLineIdx, setDevLineIdx] = useState<number | null>(null)
  const [arrowMode, setArrowMode] = useState<'original' | 'preview' | 'both'>('original')
  const [evalCache, setEvalCache] = useState<Record<number, { eval_before?: number; eval_after?: number }>>({})

  const allMistakes: PracticeMoveItem[] = useMemo(
    () =>
      moves
        .map((m, idx) => ({ ...m, originalIdx: idx, fenBefore: fensBefore[idx] }))
        .filter(
          (m): m is PracticeMoveItem =>
            m.classification === 'blunder' || m.classification === 'mistake'
        ),
    [moves, fensBefore]
  )

  const filtered = useMemo(() => {
    if (filter === 'mine') return allMistakes.filter((m) => m.color === playerColor)
    if (filter === 'opponent')
      return allMistakes.filter((m) => m.color !== playerColor)
    return allMistakes
  }, [allMistakes, filter, playerColor])

  const resetPuzzleState = useCallback(() => {
    setStep(0)
    setPhase('playing')
    setAttempts(0)
    setHintsUsed(0)
    setSolvedCount(0)
    setStreak(0)
    setDone(false)
    setAttemptedUci(null)
    setResults([])
    setReviewOffset(0)
    setBestLinePreview(null)
    setBestLineIdx(null)
    setBestLineSteps([])
    setDevLineIdx(null)
    setDevLineSteps([])
  }, [])

  const handleFilterChange = useCallback((nextFilter: string) => {
    setFilter(nextFilter)
    setStep(0)
    setPhase('playing')
    setAttempts(0)
    setHintsUsed(0)
    setSolvedCount(0)
    setStreak(0)
    setDone(false)
    setAttemptedUci(null)
    setResults([])
    setReviewOffset(0)
    setBestLinePreview(null)
  }, [])

  const current = filtered[step] as PracticeMoveItem | undefined
  const showAnswer = phase === 'correct' || phase === 'revealed'
  const puzzlePositionIndex = current ? current.originalIdx - 1 : -1
  const reviewIndex = Math.max(
    -1,
    Math.min(moves.length - 1, puzzlePositionIndex + reviewOffset)
  )
  const reviewMove = reviewIndex >= 0 ? moves[reviewIndex] : null
  const isPuzzlePosition = reviewIndex === puzzlePositionIndex
  const reviewFen =
    reviewIndex < 0
      ? 'start'
      : fensAfter[reviewIndex] || current?.fenBefore || 'start'

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
      if (phase !== 'playing' || !current) return false
      const uci = sourceSquare + targetSquare
      const bestUci = current.best_move_uci
      const isCorrect =
        bestUci && (uci === bestUci || uci === bestUci.slice(0, 4))
      setAttemptedUci(uci)

      if (isCorrect) {
        setPhase('correct')
        setSolvedCount((s) => s + 1)
        setStreak((s) => {
          const ns = s + 1
          setMaxStreak((m) => Math.max(m, ns))
          return ns
        })
        setResults((r) => [...r, 'correct'])
      } else {
        const next = attempts + 1
        setAttempts(next)
        setShake(true)
        setTimeout(() => setShake(false), 500)
        if (next >= MAX_ATTEMPTS) {
          setPhase('revealed')
          setStreak(0)
          setResults((r) => [...r, 'wrong'])
        }
      }
      return true
    },
    [phase, current, attempts]
  )

  const handleHint = useCallback(
    () => setHintsUsed((h) => Math.min(h + 1, 2)),
    []
  )

  const handleSkip = useCallback(() => {
    setPhase('revealed')
    setStreak(0)
    setResults((r) => [...r, 'skipped'])
  }, [])

  const handleExplain = useCallback(async () => {
    if (!current) return
    const key = current.originalIdx
    setExplanations((prev) => ({
      ...prev,
      [key]: { loading: true, error: null, text: null, depth: DEPTH_DEEP },
    }))
    try {
      const res = await analyzePosition(
        current.fenBefore,
        current.move_uci,
        DEPTH_DEEP,
        PV_LENGTH
      )
      const d = res.data
      const payload = {
        fen_before: current.fenBefore,
        move_uci: current.move_uci,
        move_san: d.move_san || current.move_san || '',
        move_summary: d.move_summary || current.move_summary || '',
        player_color: playerColor,
        eval_before: d.eval_before,
        eval_after: d.eval_after,
        cp_loss: d.cp_loss,
        classification: d.classification,
        best_move_san: d.best_move_san || current.best_move_san || '',
        best_line_san: d.best_line_san || [],
        deviation_best_line_san: d.deviation_best_line_san || [],
        game_move_number: current.move_number,
      }
      const coachRes = await getDeviationCoaching(payload)
      const coachingText = coachRes?.data?.coaching ?? ''
      setExplanations((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: null,
          text: coachingText,
          depth: DEPTH_DEEP,
          bestLineSan: d.best_line_san || [],
          bestLineUci: d.best_line_uci || [],
          deviationBestLineSan: d.deviation_best_line_san || [],
          deviationBestLineUci: d.deviation_best_line_uci || [],
          fenAfter: d.fen_after || null,
        },
      }))
    } catch (err: any) {
      const msg =
        err?.extractedDetail ||
        err?.response?.data?.detail ||
        err?.message ||
        'Explanation failed'
      setExplanations((prev) => ({
        ...prev,
        [key]: { loading: false, error: msg, text: null, depth: DEPTH_DEEP },
      }))
    }
  }, [current, playerColor])

  const handleNext = useCallback(() => {
    if (step + 1 >= filtered.length) {
      setDone(true)
    } else {
      setStep((s) => s + 1)
      setPhase('playing')
      setAttempts(0)
      setHintsUsed(0)
      setAttemptedUci(null)
      setReviewOffset(0)
      setBestLinePreview(null)
    }
  }, [step, filtered.length])

  const handleReviewPrev = useCallback(() => {
    setReviewOffset((offset) => {
      const nextIndex = Math.max(
        -1,
        Math.min(moves.length - 1, puzzlePositionIndex + offset - 1)
      )
      return nextIndex - puzzlePositionIndex
    })
  }, [moves.length, puzzlePositionIndex])

  const handleReviewNext = useCallback(() => {
    setReviewOffset((offset) => {
      const nextIndex = Math.max(
        -1,
        Math.min(moves.length - 1, puzzlePositionIndex + offset + 1)
      )
      return nextIndex - puzzlePositionIndex
    })
  }, [moves.length, puzzlePositionIndex])

  const handleResetToPuzzlePosition = useCallback(() => {
    setReviewOffset(0)
  }, [])

  // Cache shallow eval for review move
  useEffect(() => {
    if (bestLineIdx !== null || devLineIdx !== null) return
    if (reviewIndex < 0 || !reviewMove) return
    if (evalCache[reviewIndex]) return

    let cancelled = false
    const DEPTH_PREVIEW = 12
    ;(async () => {
      try {
        const res = await analyzePosition(
          reviewFen,
          reviewMove.move_uci,
          DEPTH_PREVIEW,
          0
        )
        if (cancelled) return
        setEvalCache((prev) => ({
          ...prev,
          [reviewIndex]: {
            eval_before: res.data.eval_before,
            eval_after: res.data.eval_after,
          },
        }))
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [reviewIndex, reviewMove, reviewFen, bestLineIdx, devLineIdx, evalCache])

  const squareStyles = useMemo(() => {
    if (!current) return {}
    const s: Record<string, React.CSSProperties> = {}
    if (hintsUsed >= 1 && current.best_move_uci && phase === 'playing') {
      s[current.best_move_uci.slice(0, 2)] = {
        backgroundColor: 'rgba(234,179,8,0.55)',
        borderRadius: '4px',
      }
    }
    if (hintsUsed >= 2 && current.best_move_uci && phase === 'playing') {
      s[current.best_move_uci.slice(2, 4)] = {
        backgroundColor: 'rgba(234,179,8,0.35)',
        borderRadius: '4px',
      }
    }
    if (phase === 'correct' && current.best_move_uci && isPuzzlePosition) {
      s[current.best_move_uci.slice(0, 2)] = {
        backgroundColor: 'rgba(34,197,94,0.6)',
      }
      s[current.best_move_uci.slice(2, 4)] = {
        backgroundColor: 'rgba(34,197,94,0.6)',
      }
    }
    if (phase === 'revealed' && isPuzzlePosition) {
      if (attemptedUci) {
        s[attemptedUci.slice(0, 2)] = {
          backgroundColor: 'rgba(239,68,68,0.4)',
        }
        s[attemptedUci.slice(2, 4)] = {
          backgroundColor: 'rgba(239,68,68,0.4)',
        }
      }
      if (current.best_move_uci) {
        s[current.best_move_uci.slice(0, 2)] = {
          backgroundColor: 'rgba(34,197,94,0.6)',
        }
        s[current.best_move_uci.slice(2, 4)] = {
          backgroundColor: 'rgba(34,197,94,0.6)',
        }
      }
    }
    return s
  }, [phase, current, attemptedUci, hintsUsed, isPuzzlePosition])

  const arrows = useMemo(() => {
    if (!current) return []
    const items: ArrowItem[] = []

    let origUci: string | null = null
    let origColor = '#ef4444'
    if (isPuzzlePosition && current.move_uci && current.move_uci.length >= 4) {
      origUci = current.move_uci
      origColor = '#ef4444'
    } else if (reviewMove?.move_uci && reviewMove.move_uci.length >= 4) {
      origUci = reviewMove.move_uci
      origColor =
        reviewIndex === current.originalIdx
          ? '#ef4444'
          : 'rgba(148, 163, 184, 0.9)'
    }

    if (bestLinePreview) {
      if (arrowMode === 'preview' || arrowMode === 'both') {
        items.push({
          startSquare: bestLinePreview.from,
          endSquare: bestLinePreview.to,
          color: '#16a34a',
        })
      }
      if ((arrowMode === 'original' || arrowMode === 'both') && origUci) {
        items.push({
          startSquare: origUci.slice(0, 2),
          endSquare: origUci.slice(2, 4),
          color: origColor,
        })
      }
      return items
    }

    if (arrowMode !== 'preview' && origUci) {
      items.push({
        startSquare: origUci.slice(0, 2),
        endSquare: origUci.slice(2, 4),
        color: origColor,
      })
    }

    if (
      showAnswer &&
      isPuzzlePosition &&
      current.best_move_uci &&
      current.best_move_uci.length >= 4
    ) {
      items.push({
        startSquare: current.best_move_uci.slice(0, 2),
        endSquare: current.best_move_uci.slice(2, 4),
        color: '#22c55e',
      })
    }

    return items
  }, [
    showAnswer,
    current,
    isPuzzlePosition,
    reviewMove,
    reviewIndex,
    bestLinePreview,
    arrowMode,
  ])

  const reviewLabel = useMemo(() => {
    if (!current) return ''
    if (reviewIndex < 0) return 'Game start'
    if (isPuzzlePosition) return 'Before the mistake'
    if (!reviewMove?.move_uci)
      return `Move ${reviewMove?.move_number ?? reviewIndex + 1}`
    const sideLabel =
      reviewMove.color === playerColor ? 'You played' : 'Opponent played'
    const mistakeLabel =
      reviewIndex === current.originalIdx ? ' · Mistake move' : ''
    return `${sideLabel} ${
      reviewMove.san ||
      reviewMove.move_summary ||
      uciToReadable(reviewMove.move_uci)
    }${mistakeLabel}`
  }, [current, reviewIndex, isPuzzlePosition, reviewMove, playerColor])

  const currentEvalScore = useMemo(() => {
    if (bestLineIdx !== null && bestLineSteps?.[bestLineIdx]?.evalAfter !== undefined)
      return bestLineSteps[bestLineIdx].evalAfter
    if (devLineIdx !== null && devLineSteps?.[devLineIdx]?.evalAfter !== undefined)
      return devLineSteps[devLineIdx].evalAfter
    const cached = evalCache?.[reviewIndex]
    if (cached?.eval_after !== undefined) return cached.eval_after
    if (cached?.eval_before !== undefined) return cached.eval_before
    if (reviewMove?.eval_after !== undefined) return reviewMove.eval_after
    if (reviewMove?.eval_before !== undefined) return reviewMove.eval_before
    if (current?.eval_after !== undefined) return current.eval_after
    if (current?.eval_before !== undefined) return current.eval_before
    return null
  }, [
    bestLineIdx,
    bestLineSteps,
    devLineIdx,
    devLineSteps,
    evalCache,
    reviewIndex,
    reviewMove,
    current,
  ])

  const mineCount = allMistakes.filter((m) => m.color === playerColor).length
  const oppCount = allMistakes.filter((m) => m.color !== playerColor).length

  return {
    state,
    moves,
    playerColor,
    gameInfo,
    filter,
    step,
    phase,
    attempts,
    hintsUsed,
    streak,
    maxStreak,
    solvedCount,
    done,
    results,
    shake,
    reviewOffset,
    current,
    showAnswer,
    filtered,
    isPuzzlePosition,
    reviewFen,
    reviewIndex,
    reviewLabel,
    allMistakes,
    mineCount,
    oppCount,
    squareStyles,
    arrows,
    arrowMode,
    setArrowMode,
    currentEvalScore,
    explanations,
    bestLinePreview,
    setBestLinePreview,
    bestLineSteps,
    setBestLineSteps,
    bestLineIdx,
    setBestLineIdx,
    devLineSteps,
    setDevLineSteps,
    devLineIdx,
    setDevLineIdx,
    handlePieceDrop,
    handleHint,
    handleSkip,
    handleExplain,
    handleNext,
    handleReviewPrev,
    handleReviewNext,
    handleResetToPuzzlePosition,
    handleFilterChange,
    resetPuzzleState,
    navigate,
    decodeLine,
  }
}
