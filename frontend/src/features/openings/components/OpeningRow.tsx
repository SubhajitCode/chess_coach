import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OpeningEntry, OpeningProgress } from '../../../types/openings'

interface OpeningRowProps {
  opening: OpeningEntry
  progress?: OpeningProgress
}

export default function OpeningRow({ opening, progress }: OpeningRowProps) {
  const navigate = useNavigate()
  const [trainAs, setTrainAs] = useState<'white' | 'black'>(
    opening.side === 'black' ? 'black' : 'white'
  )

  const getComfortBadge = (level?: string) => {
    switch (level) {
      case 'mastered':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Mastered</span>
      case 'familiar':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">Familiar</span>
      case 'learning':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">Learning</span>
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700/50 text-gray-400 border border-gray-600/40">New</span>
    }
  }

  const handleStartTraining = () => {
    navigate('/openings/train', {
      state: { eco: opening.eco, name: opening.name, trainAs },
    })
  }

  // Abbreviate PGN moves preview
  const previewPgn = opening.pgn ? (opening.pgn.length > 55 ? `${opening.pgn.substring(0, 52)}...` : opening.pgn) : ''

  return (
    <div className="bg-gray-900/60 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/40 rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start gap-3.5 flex-1 min-w-0">
        <span className="flex-shrink-0 bg-blue-900/40 border border-blue-700/50 text-blue-300 text-xs font-mono font-bold px-2.5 py-1 rounded-md mt-0.5">
          {opening.eco}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-gray-100 truncate hover:text-white" title={opening.name}>
              {opening.name}
            </h3>
            {getComfortBadge(progress?.comfort_level)}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
            <span className="font-medium text-gray-300">
              {opening.deep_move_count || opening.move_count} moves
              {opening.deep_move_count && opening.deep_move_count > opening.move_count ? ' (Deep)' : ''}
            </span>
            {opening.scenarios_count && opening.scenarios_count > 1 ? (
              <>
                <span className="text-gray-600">•</span>
                <span className="bg-purple-900/40 border border-purple-700/50 text-purple-300 px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1">
                  <span>🎭</span> {opening.scenarios_count} scenarios
                </span>
              </>
            ) : null}
            {previewPgn && (
              <>
                <span className="text-gray-600">•</span>
                <span className="font-mono text-gray-400 truncate max-w-md">{previewPgn}</span>
              </>
            )}
            {progress?.times_practiced ? (
              <>
                <span className="text-gray-600">•</span>
                <span className="text-emerald-400">Practiced {progress.times_practiced}x</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-shrink-0 justify-end">
        <div className="flex bg-gray-950/80 border border-gray-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setTrainAs('white')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              trainAs === 'white'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            White
          </button>
          <button
            type="button"
            onClick={() => setTrainAs('black')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              trainAs === 'black'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Black
          </button>
        </div>

        <button
          type="button"
          onClick={handleStartTraining}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow hover:shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
        >
          <span>▶</span> Train
        </button>
      </div>
    </div>
  )
}
