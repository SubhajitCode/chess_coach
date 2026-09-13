import { useState } from 'react'
import type { OpeningCategory, OpeningProgress } from '../../../types/openings'
import OpeningCard from './OpeningCard'

interface CategorySectionProps {
  category: OpeningCategory
  progressMap: Record<string, OpeningProgress>
  forceExpanded?: boolean
}

export default function CategorySection({ category, progressMap, forceExpanded }: CategorySectionProps) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const isExpanded = forceExpanded !== undefined ? forceExpanded : localExpanded

  return (
    <div className="mb-4 bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setLocalExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
      >
        <div className="text-left flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-100">{category.name}</h2>
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">
                {category.openings.length} lines
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{category.description}</p>
          </div>
        </div>
        <svg
          className={`w-6 h-6 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <div className="px-6 pb-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {category.openings.map((opening) => (
              <OpeningCard
                key={`${opening.eco}-${opening.name}`}
                opening={opening}
                progress={progressMap[`${opening.eco}-${opening.name}`]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
