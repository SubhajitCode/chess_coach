import { prettifyOpening } from '../../../core/chess/pgnParser'
import type { EngineOption, GameItem } from '../../../types/chess'
import type { AnalyzeStreamMeta } from '../../../types/api'

export interface AnalysisHeaderProps {
  game?: GameItem
  gameMeta?: AnalyzeStreamMeta | null
  fromCache?: boolean
  selectedEngine: string
  setSelectedEngine: (eng: string) => void
  availableEngines?: EngineOption[]
  depth: number
  setDepth: (d: number) => void
  analyzing: boolean
  showArrows: boolean
  setShowArrows: (show: boolean) => void
  analyzedCount: number
  totalMoves: number
  onAnalyze: () => void
  onStop?: () => void
  onBack: () => void
}

export default function AnalysisHeader({
  game,
  gameMeta,
  fromCache = false,
  selectedEngine,
  setSelectedEngine,
  availableEngines = [],
  depth,
  setDepth,
  analyzing,
  showArrows,
  setShowArrows,
  analyzedCount,
  totalMoves,
  onAnalyze,
  onStop,
  onBack,
}: AnalysisHeaderProps) {
  const progressPercent =
    totalMoves > 0 ? Math.round((analyzedCount / totalMoves) * 100) : 0

  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1 cursor-pointer"
        >
          ← Back
        </button>
        <div className="w-px h-5 bg-gray-700" />
        <span className="text-2xl">♛</span>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-white truncate">
            {game?.white} vs {game?.black}
          </h1>
          <p className="text-xs text-gray-400 truncate">
            {game?.result} · {game?.time_control} ·{' '}
            {prettifyOpening(gameMeta?.opening || game?.opening) ||
              'Unknown opening'}
          </p>
        </div>

        {/* Depth + Engine + Analyze */}
        <div className="flex items-center gap-2">
          {fromCache && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-800/50 border border-emerald-600 text-emerald-400">
              ✓ Cached
            </span>
          )}

          {/* Engine Selector */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="analysis-engine-select" className="text-xs text-gray-400">
              Engine
            </label>
            <select
              id="analysis-engine-select"
              value={selectedEngine}
              onChange={(e) => setSelectedEngine(e.target.value)}
              disabled={analyzing}
              className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none disabled:opacity-50 font-medium"
              title="Select Analysis Engine"
            >
              {availableEngines.length > 0 ? (
                availableEngines.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.name || eng.id}
                  </option>
                ))
              ) : (
                <>
                  <option value="stockfish">⚡ Stockfish 16</option>
                  <option value="human_model">🧠 Human AI (1400–1800)</option>
                  <option value="hybrid">🔮 Hybrid Coach</option>
                </>
              )}
            </select>
          </div>

          {selectedEngine === 'stockfish' && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="analysis-depth-select" className="text-xs text-gray-400">
                Depth
              </label>
              <select
                id="analysis-depth-select"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                disabled={analyzing}
                className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none disabled:opacity-50"
              >
                {[10, 12, 15, 18, 20, 22].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 ml-2 mr-2">
            <button
              type="button"
              onClick={() => setShowArrows(!showArrows)}
              className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                showArrows
                  ? 'bg-emerald-900/30 border-emerald-600 text-emerald-400'
                  : 'bg-gray-800 border-gray-600 text-gray-400'
              }`}
            >
              {showArrows ? '✓ Arrows' : 'Arrows Off'}
            </button>
          </div>

          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all shadow cursor-pointer disabled:cursor-not-allowed"
          >
            {analyzing ? 'Analyzing…' : '▶ Analyze'}
          </button>
        </div>
      </div>

      {analyzing && (
        <div className="border-t border-gray-800 bg-gray-950/80 px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-blue-400 font-medium whitespace-nowrap">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
              </span>
              <span>
                Evaluating with{' '}
                <span className="text-white font-semibold">
                  {availableEngines.find((e) => e.id === selectedEngine)?.name || selectedEngine}
                </span>
              </span>
            </div>

            <div
              role="progressbar"
              aria-label="Game analysis progress"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden shadow-inner border border-gray-700/60 relative"
            >
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-gray-300 whitespace-nowrap">
              <span>
                {analyzedCount} / {totalMoves} moves
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-700/60 text-blue-300 font-semibold text-[11px]">
                {progressPercent}%
              </span>
            </div>

            {onStop && (
              <button
                type="button"
                onClick={onStop}
                className="px-2.5 py-1 bg-red-950/80 hover:bg-red-900 border border-red-700/70 text-red-300 rounded-md text-xs font-semibold transition-colors cursor-pointer"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
