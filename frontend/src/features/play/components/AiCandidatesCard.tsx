import type { CandidateMove } from '../../../types/chess'

export interface AiCandidatesCardProps {
  lastCandidates?: CandidateMove[]
  lastWinPct?: number
}

export default function AiCandidatesCard({
  lastCandidates = [],
  lastWinPct = 50.0,
}: AiCandidatesCardProps) {
  return (
    <div className="p-4 rounded-2xl bg-gray-900 border border-purple-900/40 flex flex-col gap-3 shadow-md">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
          <span>🧠</span> AI Candidate Thoughts
        </div>
        <div className="text-[11px] font-semibold text-gray-400">
          Win Prob: <span className="text-purple-300">{lastWinPct}%</span>
        </div>
      </div>

      {lastCandidates.length > 0 ? (
        <div className="space-y-2">
          {lastCandidates.map((cand, idx) => (
            <div key={`${idx}-${cand.move_san}`} className="flex items-center gap-2.5 text-xs">
              <span className="w-5 text-gray-500 font-mono text-[10px]">
                #{idx + 1}
              </span>
              <span className="font-mono font-bold text-gray-100 w-12">
                {cand.move_san}
              </span>
              <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(8, cand.probability))}%`,
                  }}
                />
              </div>
              <span className="text-gray-300 font-medium text-[11px] w-12 text-right">
                {cand.probability}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-500 italic py-2 text-center">
          Play a move to see the Human AI model's candidate considerations!
        </div>
      )}
    </div>
  )
}
