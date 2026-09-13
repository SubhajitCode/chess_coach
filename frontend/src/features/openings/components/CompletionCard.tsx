import { useNavigate } from 'react-router-dom'

interface CompletionCardProps {
  accuracy: number
  comfortLevel: string
  onRetry: () => void
}

export default function CompletionCard({ accuracy, comfortLevel, onRetry }: CompletionCardProps) {
  const navigate = useNavigate()

  const getComfortColor = (level: string) => {
    switch (level) {
      case 'mastered': return 'text-emerald-400'
      case 'familiar': return 'text-blue-400'
      case 'learning': return 'text-amber-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center animate-in fade-in zoom-in duration-500">
      <div className="text-4xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Opening Completed!</h2>
      
      <div className="my-6 flex justify-center items-center gap-8">
        <div>
          <div className="text-3xl font-bold text-white">{accuracy}%</div>
          <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">Accuracy</div>
        </div>
        <div className="w-px h-12 bg-gray-700"></div>
        <div>
          <div className={`text-xl font-bold capitalize ${getComfortColor(comfortLevel)}`}>
            {comfortLevel}
          </div>
          <div className="text-sm text-gray-400 uppercase tracking-wider mt-1">Status</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-8">
        <button
          onClick={onRetry}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          Practice Again
        </button>
        <button
          onClick={() => navigate('/openings')}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          Back to Catalog
        </button>
      </div>
    </div>
  )
}
