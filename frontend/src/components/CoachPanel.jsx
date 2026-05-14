import ReactMarkdown from 'react-markdown'

export default function CoachPanel({ coaching, loading, onRequest, hasAnalysis }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎓</span>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">AI Coach</h3>
        </div>
        {hasAnalysis && !coaching && (
          <button
            onClick={onRequest}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {loading ? 'Analyzing...' : 'Get Coaching'}
          </button>
        )}
      </div>

      <div className="p-4 max-h-96 overflow-y-auto">
        {loading && (
          <div className="flex flex-col gap-3 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-700 rounded w-5/6" />
            <div className="h-3 bg-gray-700 rounded w-2/3" />
            <div className="h-3 bg-gray-700 rounded w-full" />
            <div className="h-3 bg-gray-700 rounded w-4/5" />
          </div>
        )}

        {!loading && coaching && (
          <div className="prose prose-invert prose-sm max-w-none text-gray-300
            prose-headings:text-blue-400 prose-headings:font-semibold
            prose-strong:text-gray-200
            prose-li:text-gray-300">
            <ReactMarkdown>{coaching}</ReactMarkdown>
          </div>
        )}

        {!loading && !coaching && !hasAnalysis && (
          <p className="text-gray-500 text-sm text-center py-4">
            Analyze a game to get AI coaching feedback.
          </p>
        )}

        {!loading && !coaching && hasAnalysis && (
          <p className="text-gray-500 text-sm text-center py-4">
            Click "Get Coaching" to receive personalized feedback from the AI coach.
          </p>
        )}
      </div>
    </div>
  )
}
