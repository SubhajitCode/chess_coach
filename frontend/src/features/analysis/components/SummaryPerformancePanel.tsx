import { computeSideStats } from '../../../core/chess/eloCalculator'
import type { ChessMove, GameSummary, PlayerColor } from '../../../types/chess'

export interface SummaryPerformancePanelProps {
  summary?: GameSummary | null
  streamedMoves?: ChessMove[]
  playerColor?: PlayerColor
  onSelectColor?: (color: PlayerColor) => void
  whiteName?: string
  blackName?: string
  analyzing?: boolean
  opening?: string | null
}

export default function SummaryPerformancePanel({
  summary,
  streamedMoves = [],
  playerColor = 'white',
  onSelectColor,
  whiteName = 'White',
  blackName = 'Black',
  analyzing = false,
  opening = null,
}: SummaryPerformancePanelProps) {
  const whiteMoves = streamedMoves.filter((m) => m.color === 'white')
  const blackMoves = streamedMoves.filter((m) => m.color === 'black')

  const whiteStats = computeSideStats(whiteMoves)
  const blackStats = computeSideStats(blackMoves)

  const activeStats = playerColor === 'white' ? whiteStats : blackStats
  const s =
    summary && playerColor === (summary.player_color || playerColor)
      ? summary
      : activeStats

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
          <span>📊 Performance & Elo Audit</span>
          {analyzing && (
            <span className="text-blue-400 normal-case font-normal text-xs">
              (live evaluating with Stockfish)
            </span>
          )}
        </h3>
        <span className="text-[11px] text-gray-400">
          Click a player to switch perspective
        </span>
      </div>

      {/* Dual Player Comparison Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* White Card */}
        <button
          type="button"
          onClick={() => onSelectColor && onSelectColor('white')}
          className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
            playerColor === 'white'
              ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/40'
              : 'bg-gray-800/60 border-gray-700 hover:bg-gray-800'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-300 flex-shrink-0" />
              <span className="text-xs font-bold text-gray-200 truncate">
                {whiteName}
              </span>
            </div>
            {playerColor === 'white' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-medium">
                Active
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between w-full mt-1">
            <div>
              <div className="text-xs text-gray-400 font-medium">Est. Elo</div>
              <div className="text-lg font-bold text-purple-400">
                {whiteStats.estimated_elo
                  ? `~${whiteStats.estimated_elo}`
                  : '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 font-medium">Accuracy</div>
              <div className="text-lg font-bold text-blue-400">
                {whiteStats.accuracy !== null ? `${whiteStats.accuracy}%` : '—'}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-400 flex items-center gap-2 pt-1 border-t border-gray-700/60">
            <span>{whiteStats.blunders} blunders</span>
            <span>·</span>
            <span>{whiteStats.mistakes} mistakes</span>
          </div>
        </button>

        {/* Black Card */}
        <button
          type="button"
          onClick={() => onSelectColor && onSelectColor('black')}
          className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
            playerColor === 'black'
              ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/40'
              : 'bg-gray-800/60 border-gray-700 hover:bg-gray-800'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-3 h-3 rounded-sm bg-gray-900 border border-gray-600 flex-shrink-0" />
              <span className="text-xs font-bold text-gray-200 truncate">
                {blackName}
              </span>
            </div>
            {playerColor === 'black' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-medium">
                Active
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between w-full mt-1">
            <div>
              <div className="text-xs text-gray-400 font-medium">Est. Elo</div>
              <div className="text-lg font-bold text-purple-400">
                {blackStats.estimated_elo
                  ? `~${blackStats.estimated_elo}`
                  : '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400 font-medium">Accuracy</div>
              <div className="text-lg font-bold text-blue-400">
                {blackStats.accuracy !== null ? `${blackStats.accuracy}%` : '—'}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-400 flex items-center gap-2 pt-1 border-t border-gray-700/60">
            <span>{blackStats.blunders} blunders</span>
            <span>·</span>
            <span>{blackStats.mistakes} mistakes</span>
          </div>
        </button>
      </div>

      {/* Opening badge */}
      {opening && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700">
          <span className="text-sm">♟</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">
              Opening:
            </span>
            <span className="text-xs text-gray-200 font-semibold">{opening}</span>
          </div>
        </div>
      )}

      {/* Detailed Move Quality Breakdown */}
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>
            {playerColor === 'white' ? whiteName : blackName} Move Distribution
          </span>
          <span className="text-gray-500 normal-case">
            {activeStats.total ? `${activeStats.total} moves` : ''}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBadge
            label="Blunders"
            value={s.blunders ?? activeStats.blunders}
            color="text-red-400"
          />
          <StatBadge
            label="Mistakes"
            value={s.mistakes ?? activeStats.mistakes}
            color="text-orange-400"
          />
          <StatBadge
            label="Inaccuracies"
            value={s.inaccuracies ?? activeStats.inaccuracies}
            color="text-yellow-400"
          />
          <StatBadge
            label="Good"
            value={s.good_moves ?? activeStats.good_moves}
            color="text-lime-400"
          />
          <StatBadge
            label="Excellent"
            value={s.excellent_moves ?? activeStats.excellent_moves}
            color="text-green-400"
          />
          <StatBadge
            label="Best"
            value={s.best_moves ?? activeStats.best_moves}
            color="text-emerald-400"
          />
        </div>
      </div>
    </div>
  )
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2 text-center border border-gray-700/40">
      <div className={`text-lg font-bold ${color}`}>{value ?? 0}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
