import { useEffect, useState } from 'react'
import type { WrongMoveExplanation } from '../../../types/openings'

interface FeedbackBannerProps {
  type: 'correct' | 'wrong' | null
  message: string
  subMessage?: string | WrongMoveExplanation | null
  wrongDetails?: WrongMoveExplanation | null
}

export default function FeedbackBanner({
  type,
  message,
  subMessage,
  wrongDetails,
}: FeedbackBannerProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (type) {
      setShow(true)
    } else {
      setShow(false)
    }
  }, [type, message, subMessage, wrongDetails])

  if (!type || !show) return null

  const isCorrect = type === 'correct'
  const bgColor = isCorrect ? 'bg-emerald-950/60' : 'bg-red-950/60'
  const borderColor = isCorrect ? 'border-emerald-500/60' : 'border-red-500/60'
  const iconColor = isCorrect ? 'text-emerald-400' : 'text-red-400'
  const icon = isCorrect ? '✓' : '✗'

  // Normalize details defensively if an object was passed as subMessage
  const details: WrongMoveExplanation | null =
    wrongDetails ||
    (typeof subMessage === 'object' && subMessage !== null
      ? (subMessage as WrongMoveExplanation)
      : null)

  const textMessage: string | null =
    typeof subMessage === 'string'
      ? subMessage
      : details?.why_wrong
      ? details.why_wrong
      : null

  return (
    <div
      className={`${bgColor} border ${borderColor} rounded-xl p-4 sm:p-5 shadow-lg animate-in fade-in duration-300 space-y-3`}
    >
      <div className="flex items-start gap-3">
        <span className={`text-xl font-bold ${iconColor} mt-0.5`}>{icon}</span>
        <div className="flex-1">
          <h3 className={`font-semibold text-base ${isCorrect ? 'text-emerald-200' : 'text-red-200'}`}>
            {message}
          </h3>
          {textMessage && (
            <p className={`mt-1 text-sm ${isCorrect ? 'text-emerald-100/90' : 'text-red-100/90'}`}>
              {textMessage}
            </p>
          )}
        </div>
      </div>

      {/* Rich coach explanation for wrong moves */}
      {details && (
        <div className="mt-3 pt-3 border-t border-red-800/40 space-y-2.5 text-xs">
          {details.what_opponent_can_do && (
            <div className="bg-red-900/30 rounded-lg p-2.5 border border-red-800/50">
              <span className="font-semibold text-red-300 flex items-center gap-1">
                <span>🎯</span> Opponent's Exploitation:
              </span>
              <p className="text-red-100/80 mt-1 leading-relaxed">{details.what_opponent_can_do}</p>
            </div>
          )}

          {details.why_correct && (
            <div className="bg-emerald-950/40 rounded-lg p-2.5 border border-emerald-800/50">
              <span className="font-semibold text-emerald-300 flex items-center gap-1">
                <span>💡</span> What the Correct Move Achieves:
              </span>
              <p className="text-emerald-100/80 mt-1 leading-relaxed">{details.why_correct}</p>
            </div>
          )}

          {details.tip && (
            <div className="bg-blue-950/40 rounded-lg p-2.5 border border-blue-800/50">
              <span className="font-semibold text-blue-300 flex items-center gap-1">
                <span>🧠</span> Master Tip:
              </span>
              <p className="text-blue-100/80 mt-1 leading-relaxed">{details.tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
