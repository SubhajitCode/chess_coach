import ReactMarkdown from 'react-markdown'
import { MAX_ATTEMPTS, type PracticeExplanation, type PracticeMoveItem } from '../hooks/usePracticeSession'
import { CLASSIFICATION_META } from '../../../core/chess/moveClassifier'

export interface PracticePromptCardProps {
  current?: PracticeMoveItem
  phase: 'playing' | 'correct' | 'revealed'
  attempts: number
  isMyMistake: boolean
  isPuzzlePosition: boolean
  showAnswer: boolean
  explanation?: PracticeExplanation
  onExplain: () => void
}

export default function PracticePromptCard({
  current,
  phase,
  attempts,
  isMyMistake,
  isPuzzlePosition,
  showAnswer,
  explanation,
  onExplain,
}: PracticePromptCardProps) {
  if (!current) return null
  const cls = (current.classification && CLASSIFICATION_META[current.classification]) || CLASSIFICATION_META.mistake

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Classification + context */}
      <div className={`px-4 py-3 rounded-xl border ${cls.bg}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-2xl font-black leading-none ${cls.color}`}>
            {cls.icon}
          </span>
          <span className={`font-bold text-base ${cls.color}`}>{cls.label}</span>
          <span className="ml-auto text-xs text-gray-500 capitalize">
            {isMyMistake ? 'Your mistake' : 'Opponent mistake'}
          </span>
        </div>
        <p className="text-gray-400 text-xs">
          Move {current.move_number} ·{' '}
          {current.color === 'white' ? 'White' : 'Black'} to play
          {current.cp_loss !== undefined && current.cp_loss > 0 && (
            <>
              {' '}
              ·{' '}
              <span className="text-red-400">
                ~{Math.round(current.cp_loss)} cp lost
              </span>
            </>
          )}
        </p>
      </div>

      {/* Puzzle prompt / feedback */}
      {phase === 'playing' && (
        <div className="space-y-3">
          <p className="text-lg font-semibold text-white leading-snug">
            {attempts === 0
              ? 'What was the best move here?'
              : attempts === 1
              ? 'Not quite — try again!'
              : 'Last chance — find the best move!'}
          </p>
          <p className="text-sm text-gray-400 leading-relaxed">
            The red arrow shows the move that was actually played. Use the board
            navigation to step backward or forward and see how the position
            changed.
          </p>
          {/* Attempt pips */}
          <div className="flex gap-1.5">
            {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  i < attempts ? 'bg-red-500' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600">
            {isPuzzlePosition
              ? 'Drag a piece on the board to make your move.'
              : 'Return to Puzzle position to try your move.'}
          </p>
        </div>
      )}

      {phase === 'correct' && (
        <div className="px-4 py-4 bg-emerald-950/50 border border-emerald-700/60 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl text-emerald-400">✓</span>
            <span className="font-bold text-emerald-300">Excellent find!</span>
          </div>
          <p className="text-sm text-gray-300">
            You found the best move:{' '}
            <span className="font-mono font-bold text-white">
              {current.best_move_san}
            </span>
          </p>
        </div>
      )}

      {phase === 'revealed' && (
        <div className="px-4 py-4 bg-red-950/40 border border-red-800/60 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl text-red-400">✗</span>
            <span className="font-bold text-red-300">Here's the idea:</span>
          </div>
          <p className="text-sm text-gray-300">
            The best move was{' '}
            <span className="font-mono font-bold text-emerald-400">
              {current.best_move_san}
            </span>
            {current.best_move_summary && ` (${current.best_move_summary})`}
          </p>
        </div>
      )}

      {/* AI Deep Explanation */}
      {showAnswer && (
        <div className="rounded-xl border border-gray-700 bg-gray-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
              🎓 Deep Explanation
            </span>
            {!explanation?.text && !explanation?.loading && (
              <button
                type="button"
                onClick={onExplain}
                className="text-xs text-purple-400 hover:text-purple-300 underline cursor-pointer"
              >
                Explain with Coach AI
              </button>
            )}
          </div>

          {explanation?.loading && (
            <div className="flex flex-col gap-2 animate-pulse py-1">
              <div className="h-3 bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-700 rounded w-full" />
              <div className="h-3 bg-gray-700 rounded w-5/6" />
            </div>
          )}

          {explanation?.error && (
            <div className="text-xs text-red-400">{explanation.error}</div>
          )}

          {explanation?.text && (
            <div className="prose prose-invert prose-xs max-w-none text-gray-300 leading-relaxed">
              <ReactMarkdown>{explanation.text}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
