import { useState, useCallback } from 'react'
import { askCoach } from '../../../api/chess'
import type { PlayerColor } from '../../../types/chess'

export interface UseCoachQnAProps {
  fen: string
  playerColor?: PlayerColor
  moveNumber?: number
}

export function useCoachQnA({ fen, playerColor, moveNumber }: UseCoachQnAProps) {
  const [question, setQuestion] = useState('')
  const [candidateMove, setCandidateMove] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAsk = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!question.trim()) return

      setLoading(true)
      setError(null)
      setAnswer(null)
      try {
        const res = await askCoach({
          fen,
          question: question.trim(),
          candidate_san: candidateMove.trim() || undefined,
          player_color: playerColor,
          move_number: moveNumber,
        })
        setAnswer(res.answer)
      } catch (err: any) {
        setError(
          err?.extractedDetail ||
            err?.response?.data?.detail ||
            err?.message ||
            'Failed to get answer from coach'
        )
      } finally {
        setLoading(false)
      }
    },
    [fen, question, candidateMove, playerColor, moveNumber]
  )

  const resetQnA = useCallback(() => {
    setQuestion('')
    setCandidateMove('')
    setAnswer(null)
    setError(null)
  }, [])

  return {
    question,
    setQuestion,
    candidateMove,
    setCandidateMove,
    loading,
    answer,
    error,
    handleAsk,
    resetQnA,
  }
}
