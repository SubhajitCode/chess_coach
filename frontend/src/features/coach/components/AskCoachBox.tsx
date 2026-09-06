import ReactMarkdown from 'react-markdown'
import { useCoachQnA } from '../hooks/useCoachQnA'
import type { PlayerColor } from '../../../types/chess'

export interface AskCoachBoxProps {
  fen: string
  playerColor?: PlayerColor
  moveNumber?: number
}

export default function AskCoachBox({ fen, playerColor, moveNumber }: AskCoachBoxProps) {
  const {
    question,
    setQuestion,
    candidateMove,
    setCandidateMove,
    loading,
    answer,
    error,
    handleAsk,
  } = useCoachQnA({ fen, playerColor, moveNumber })

  return (
    <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-300 uppercase tracking-wide">
        <span>💬</span> Ask Coach
      </div>
      <form onSubmit={handleAsk} className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Candidate move (e.g. Nxd5, e4)... optional"
            value={candidateMove}
            onChange={(e) => setCandidateMove(e.target.value)}
            className="sm:w-1/3 bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Ask anything about this position..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors cursor-pointer"
          >
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </form>

      {error && <div className="text-xs text-red-400">{error}</div>}
      {answer && (
        <div className="mt-2 p-2.5 rounded bg-gray-900/80 border border-blue-700/40 text-xs text-gray-200 leading-relaxed prose prose-invert prose-xs max-w-none">
          <ReactMarkdown>{answer}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
