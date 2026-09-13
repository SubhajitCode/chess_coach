import { useState } from 'react'
import type { MoveExplanation } from '../../../types/openings'

interface ExplanationCardProps {
  explanation: MoveExplanation
}

export default function ExplanationCard({ explanation }: ExplanationCardProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="bg-gray-800/80 border border-gray-700 rounded-lg overflow-hidden">
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-gray-800 flex justify-between items-center hover:bg-gray-700 transition-colors"
      >
        <span className="font-semibold text-gray-100 flex items-center gap-2">
          <span>📖</span> Move Explanation
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transform transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar text-sm">
          <div>
            <h4 className="text-blue-400 font-medium mb-1">Strategic Purpose</h4>
            <p className="text-gray-300">{explanation.strategic_purpose}</p>
          </div>

          {explanation.key_ideas?.length > 0 && (
            <div>
              <h4 className="text-emerald-400 font-medium mb-1">Key Ideas</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                {explanation.key_ideas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            </div>
          )}

          {explanation.drawbacks?.length > 0 && (
            <div>
              <h4 className="text-amber-400 font-medium mb-1">Drawbacks</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                {explanation.drawbacks.map((drawback, i) => (
                  <li key={i}>{drawback}</li>
                ))}
              </ul>
            </div>
          )}

          {explanation.opponent_likely_responses?.length > 0 && (
            <div>
              <h4 className="text-purple-400 font-medium mb-2">Opponent's Likely Responses</h4>
              <div className="space-y-2">
                {explanation.opponent_likely_responses.map((resp, i) => (
                  <div key={i} className="bg-gray-900/50 p-2 rounded border border-gray-700">
                    <div className="font-mono text-gray-200 font-bold">{resp.move} <span className="text-gray-400 font-sans font-normal text-xs">- {resp.name}</span></div>
                    <div className="text-gray-400 text-xs mt-1">{resp.idea}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {explanation.pawn_structure && (
            <div>
              <h4 className="text-orange-400 font-medium mb-1">Pawn Structure</h4>
              <p className="text-gray-300">{explanation.pawn_structure}</p>
            </div>
          )}

          {explanation.typical_plans?.length > 0 && (
            <div>
              <h4 className="text-cyan-400 font-medium mb-1">Typical Plans</h4>
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                {explanation.typical_plans.map((plan, i) => (
                  <li key={i}>{plan}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
