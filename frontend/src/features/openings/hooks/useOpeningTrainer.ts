import { useState, useCallback, useEffect, useRef } from 'react'
import { Chess } from 'chess.js'
import {
  startTraining,
  submitTrainingMove,
  getTrainingHint,
  completeTraining,
  switchTrainingScenario
} from '../../../api/openings'
import type {
  TrainingSession,
  MoveExplanation,
  ExplorerStats,
  ExplorerMoveStats,
  WrongMoveExplanation,
  ComfortLevel,
  OpeningScenario
} from '../../../types/openings'

interface TrainerHookState {
  eco: string
  openingName: string
  trainAs: string
  scenarioId?: string
  adaptive?: boolean
}

export function useOpeningTrainer({
  eco,
  openingName,
  trainAs,
  scenarioId: initialScenarioId,
  adaptive: initialAdaptive = false
}: TrainerHookState) {
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(initialScenarioId || null)
  const [isAdaptive, setIsAdaptive] = useState<boolean>(initialAdaptive)
  const [branchNotification, setBranchNotification] = useState<string | null>(null)
  const [isOpponentThinking, setIsOpponentThinking] = useState(false)

  const [chess] = useState(new Chess())
  const [fen, setFen] = useState(chess.fen())
  const [moveHistory, setMoveHistory] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [boardShake, setBoardShake] = useState(false)
  const [squaresToHighlight, setSquaresToHighlight] = useState<Record<string, React.CSSProperties>>({})
  
  // Feedback state
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackSubMessage, setFeedbackSubMessage] = useState('')
  const [wrongDetails, setWrongDetails] = useState<WrongMoveExplanation | null>(null)
  const [wrongAttempts, setWrongAttempts] = useState(0)
  
  // Data state
  const [explanation, setExplanation] = useState<MoveExplanation | null>(null)
  const [stats, setStats] = useState<ExplorerStats | null>(null)
  const [alternatives, setAlternatives] = useState<ExplorerMoveStats[] | null>(null)
  const [comfortLevel, setComfortLevel] = useState<ComfortLevel>('new')
  const [accuracy, setAccuracy] = useState(100)

  const opponentTimerRef = useRef<NodeJS.Timeout | null>(null)

  const initSession = useCallback(async (scId?: string, adaptiveMode?: boolean) => {
    try {
      setIsLoading(true)
      setError(null)
      setIsOpponentThinking(false)
      if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current)

      const targetScenario = scId !== undefined ? scId : (selectedScenarioId || undefined)
      const targetAdaptive = adaptiveMode !== undefined ? adaptiveMode : isAdaptive

      const newSession = await startTraining(eco, openingName, trainAs, targetScenario, targetAdaptive)
      setSession(newSession)
      
      if (newSession.state.scenario_id) {
        setSelectedScenarioId(newSession.state.scenario_id)
      }
      setIsAdaptive(Boolean(newSession.state.is_adaptive))

      // If training as Black, White has already made move 1 on the backend
      if (newSession.state.history_moves && newSession.state.history_moves.length > 0) {
        try {
          chess.load(newSession.state.fen)
        } catch {
          // fallback
        }
        setFen(newSession.state.fen)
        setMoveHistory(newSession.state.history_moves.map(m => m.san))
        const lastMove = newSession.state.history_moves[newSession.state.history_moves.length - 1]
        if (lastMove.uci && lastMove.uci.length >= 4) {
          const from = lastMove.uci.substring(0, 2)
          const to = lastMove.uci.substring(2, 4)
          setSquaresToHighlight({
            [from]: { backgroundColor: 'rgba(234, 179, 8, 0.4)' },
            [to]: { backgroundColor: 'rgba(234, 179, 8, 0.65)' },
          })
        }
      } else {
        chess.reset()
        setFen(chess.fen())
        setMoveHistory([])
        setSquaresToHighlight({})
      }

      setFeedbackType(null)
      setWrongAttempts(0)
      setWrongDetails(null)
      setExplanation(null)
      setStats(null)
      setBranchNotification(null)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to start training session')
    } finally {
      setIsLoading(false)
    }
  }, [eco, openingName, trainAs, selectedScenarioId, isAdaptive, chess])

  useEffect(() => {
    initSession(initialScenarioId, initialAdaptive)
    return () => {
      if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current)
    }
  }, [initSession, initialScenarioId, initialAdaptive])

  const triggerShake = () => {
    setBoardShake(true)
    setTimeout(() => setBoardShake(false), 500)
  }

  const handleCorrectMove = (uci: string, san: string, nextFen: string, respData: any) => {
    // 1. Immediately apply user's move to board
    try {
      chess.load(nextFen)
    } catch {
      // fallback
    }
    setFen(nextFen)
    setMoveHistory(prev => [...prev, san])
    setWrongAttempts(0)
    setWrongDetails(null)
    setFeedbackType('correct')
    setFeedbackMessage('Correct!')
    setFeedbackSubMessage(san)

    // Highlight user's played move in green
    if (uci && uci.length >= 4) {
      const from = uci.substring(0, 2)
      const to = uci.substring(2, 4)
      setSquaresToHighlight({
        [from]: { backgroundColor: 'rgba(16, 185, 129, 0.35)' },
        [to]: { backgroundColor: 'rgba(16, 185, 129, 0.6)' },
      })
    }

    if (respData.move_explanation) setExplanation(respData.move_explanation)
    if (respData.result.stats) setStats(respData.result.stats)
    if (respData.result.alternatives) setAlternatives(respData.result.alternatives)

    if (respData.result.branch_note || respData.state?.branch_note) {
      const note = respData.result.branch_note || respData.state?.branch_note
      setBranchNotification(note)
      setTimeout(() => setBranchNotification(null), 5000)
    }

    const oppMove = respData.result.opponent_move

    if (oppMove) {
      // Opponent automatically responds after brief natural delay (550ms)
      setIsOpponentThinking(true)
      if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current)

      opponentTimerRef.current = setTimeout(() => {
        try {
          chess.load(oppMove.fen_after)
        } catch {
          // fallback
        }
        setFen(oppMove.fen_after)
        setMoveHistory(prev => [...prev, oppMove.san])

        // Highlight opponent's move in amber/gold
        if (oppMove.uci && oppMove.uci.length >= 4) {
          const from = oppMove.uci.substring(0, 2)
          const to = oppMove.uci.substring(2, 4)
          setSquaresToHighlight({
            [from]: { backgroundColor: 'rgba(234, 179, 8, 0.4)' },
            [to]: { backgroundColor: 'rgba(234, 179, 8, 0.65)' },
          })
        }

        setIsOpponentThinking(false)
        setSession(prev => prev ? { ...prev, state: respData.state } : null)

        if (respData.state.completed) {
          handleComplete()
        }
      }, 550)
    } else {
      setSession(prev => prev ? { ...prev, state: respData.state } : null)
      if (respData.state.completed) {
        handleComplete()
      }
    }
  }

  const handleComplete = async () => {
    if (!session) return
    try {
      const data = await completeTraining(session.session_id)
      setComfortLevel(data.progress?.comfort_level || 'new')
      setAccuracy(Math.round(data.accuracy * 100) || 100)
    } catch (err) {
      console.error('Error completing training', err)
    }
  }

  const submitMove = useCallback(async (uci: string, isAutoPlay: boolean = false) => {
    if (!session || isOpponentThinking) return false

    try {
      const resp = await submitTrainingMove(session.session_id, uci)
      const { result, state } = resp

      if (result.correct || !state.is_user_turn || isAutoPlay) {
        handleCorrectMove(result.played_uci || uci, result.played_san || '', result.fen_after, resp)
        return true
      } else {
        // Wrong move
        triggerShake()
        setFeedbackType('wrong')
        setFeedbackMessage('Wrong move')
        
        const newAttempts = wrongAttempts + 1
        setWrongAttempts(newAttempts)

        let details: WrongMoveExplanation | null = null
        let textMsg = 'Try again.'

        if (typeof result.explanation === 'object' && result.explanation !== null) {
          details = result.explanation as WrongMoveExplanation
          textMsg = details.why_wrong || 'Suboptimal move in this opening line.'
        } else if (typeof result.explanation === 'string') {
          textMsg = result.explanation
        }

        if (newAttempts >= 3) {
          textMsg += ` The correct move is ${result.expected_san}.`
          // Auto reveal via highlight
          const from = result.expected_uci.substring(0, 2)
          const to = result.expected_uci.substring(2, 4)
          setSquaresToHighlight({
            [from]: { backgroundColor: 'rgba(59, 130, 246, 0.5)' },
            [to]: { backgroundColor: 'rgba(59, 130, 246, 0.5)' }
          })
        }
        setFeedbackSubMessage(textMsg)
        setWrongDetails(details)
        return false
      }
    } catch (err) {
      console.error('Error submitting move', err)
      return false
    }
  }, [session, wrongAttempts, isOpponentThinking])

  const handlePieceDrop = (args: any, targetSquareArg?: string, pieceArg?: string) => {
    if (!session || !session.state.is_user_turn || isOpponentThinking || session.state.completed) {
      return false
    }

    let sourceSquare: string
    let targetSquare: string
    let piece: string | undefined
    if (typeof args === 'object' && args !== null && 'sourceSquare' in args) {
      sourceSquare = args.sourceSquare
      targetSquare = args.targetSquare
      const p = args.piece
      piece = typeof p === 'string' ? p : p?.pieceType || ''
    } else {
      sourceSquare = args
      targetSquare = targetSquareArg as string
      piece = pieceArg
    }

    if (!sourceSquare || !targetSquare) return false

    const isPromotion = (piece && (piece.includes('P') || piece.includes('p')) && (targetSquare[1] === '8' || targetSquare[1] === '1'))
    let uci = sourceSquare + targetSquare
    if (isPromotion) uci += 'q' // default to queen for simplicity in training

    submitMove(uci)
    return false // We handle the board state ourselves
  }

  const handleHint = async () => {
    if (!session || session.state.completed || isOpponentThinking) return
    try {
      const resp = await getTrainingHint(session.session_id)
      const newHighlights: Record<string, React.CSSProperties> = {}
      if (resp.from_square) newHighlights[resp.from_square] = { backgroundColor: 'rgba(59, 130, 246, 0.5)' }
      if (resp.target_square) newHighlights[resp.target_square] = { backgroundColor: 'rgba(16, 185, 129, 0.5)' }
      
      setSquaresToHighlight(newHighlights)
      setFeedbackType('wrong')
      setFeedbackMessage('Hint')
      setFeedbackSubMessage(resp.hint_text || `Try moving the piece on ${resp.from_square}`)
    } catch (err) {
      console.error('Failed to get hint', err)
    }
  }

  const handleSkip = () => {
    if (!session || session.state.completed || isOpponentThinking) return
    submitMove('skip', true)
  }

  const handleReset = () => {
    initSession(selectedScenarioId || undefined, isAdaptive)
  }

  const handleSelectScenario = async (scenarioId: string) => {
    setSelectedScenarioId(scenarioId)
    setIsAdaptive(false)
    if (session) {
      try {
        setIsLoading(true)
        if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current)
        setIsOpponentThinking(false)

        const updated = await switchTrainingScenario(session.session_id, scenarioId)
        setSession(updated)

        if (updated.state.history_moves && updated.state.history_moves.length > 0) {
          try {
            chess.load(updated.state.fen)
          } catch {}
          setFen(updated.state.fen)
          setMoveHistory(updated.state.history_moves.map(m => m.san))
          const lastMove = updated.state.history_moves[updated.state.history_moves.length - 1]
          if (lastMove.uci && lastMove.uci.length >= 4) {
            const from = lastMove.uci.substring(0, 2)
            const to = lastMove.uci.substring(2, 4)
            setSquaresToHighlight({
              [from]: { backgroundColor: 'rgba(234, 179, 8, 0.4)' },
              [to]: { backgroundColor: 'rgba(234, 179, 8, 0.65)' },
            })
          }
        } else {
          chess.reset()
          setFen(chess.fen())
          setMoveHistory([])
          setSquaresToHighlight({})
        }

        setFeedbackType(null)
        setWrongAttempts(0)
        setWrongDetails(null)
        setExplanation(null)
        setStats(null)
        setBranchNotification(null)
      } catch (err) {
        console.error('Failed to switch scenario', err)
        await initSession(scenarioId, false)
      } finally {
        setIsLoading(false)
      }
    } else {
      await initSession(scenarioId, false)
    }
  }

  const handleToggleAdaptive = async (enable: boolean) => {
    setIsAdaptive(enable)
    await initSession(selectedScenarioId || undefined, enable)
  }

  const availableScenarios: OpeningScenario[] = session?.state?.available_scenarios || []
  const activeScenario: OpeningScenario | undefined = availableScenarios.find(
    s => s.id === session?.state?.scenario_id
  )

  return {
    session,
    fen,
    moveHistory,
    isLoading,
    error,
    boardShake,
    squaresToHighlight,
    feedbackType,
    feedbackMessage,
    feedbackSubMessage,
    wrongDetails,
    explanation,
    stats,
    alternatives,
    comfortLevel,
    accuracy,
    isAdaptive,
    isOpponentThinking,
    branchNotification,
    availableScenarios,
    activeScenario,
    handlePieceDrop,
    handleHint,
    handleSkip,
    handleReset,
    handleSelectScenario,
    handleToggleAdaptive,
  }
}
