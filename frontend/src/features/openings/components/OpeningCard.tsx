import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OpeningEntry, OpeningProgress } from '../../../types/openings'

interface OpeningCardProps {
  opening: OpeningEntry
  progress?: OpeningProgress
}

export default function OpeningCard({ opening, progress }: OpeningCardProps) {
  const navigate = useNavigate()
  const [trainAs, setTrainAs] = useState<'white' | 'black'>(opening.side === 'black' ? 'black' : 'white')

  const getComfortColor = (level?: string) => {
    switch (level) {
      case 'mastered': return 'bg-emerald-500'
      case 'familiar': return 'bg-blue-500'
      case 'learning': return 'bg-amber-500'
      default: return 'bg-gray-500'
    }
  }

  const handleStartTraining = () => {
    navigate('/openings/train', { state: { eco: opening.eco, name: opening.name, trainAs } })
  }

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 flex flex-col h-full hover:border-gray-600 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <span className="bg-gray-700 text-gray-200 text-xs font-bold px-2 py-1 rounded">
          {opening.eco}
        </span>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">{progress?.comfort_level || 'new'}</span>
          <div className={`w-3 h-3 rounded-full ${getComfortColor(progress?.comfort_level)}`} />
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-gray-100 flex-grow mb-2">{opening.name}</h3>
      
      <div className="text-xs text-gray-400 mb-4 flex items-center justify-between">
        <span>
          {opening.deep_move_count || opening.move_count} moves
          {opening.deep_move_count && opening.deep_move_count > opening.move_count ? ' (Deep)' : ''}
        </span>
        {opening.scenarios_count && opening.scenarios_count > 1 && (
          <span className="bg-purple-900/40 border border-purple-700/50 text-purple-300 px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1">
            <span>🎭</span> {opening.scenarios_count} scenarios
          </span>
        )}
      </div>
      
      <div className="mt-auto space-y-3">
        <div className="flex bg-gray-900 rounded-md p-1">
          <button
            onClick={() => setTrainAs('white')}
            className={`flex-1 text-sm py-1 rounded ${trainAs === 'white' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            White
          </button>
          <button
            onClick={() => setTrainAs('black')}
            className={`flex-1 text-sm py-1 rounded ${trainAs === 'black' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Black
          </button>
        </div>
        
        <button
          onClick={handleStartTraining}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Start Training
        </button>
      </div>
    </div>
  )
}
