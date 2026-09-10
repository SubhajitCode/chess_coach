import { STYLES } from '../hooks/useSparringSession'
import type { PlayerColor } from '../../../types/chess'

export interface MatchConfigCardProps {
  engine: string
  setEngine: (eng: string) => void
  playerColor: PlayerColor
  onColorChange: (color: PlayerColor) => void
  temperature: number
  setTemperature: (temp: number) => void
}

export default function MatchConfigCard({
  engine,
  setEngine,
  playerColor,
  onColorChange,
  temperature,
  setTemperature,
}: MatchConfigCardProps) {
  return (
    <div className="p-4 rounded-2xl bg-gray-900 border border-gray-800 flex flex-col gap-3.5 shadow-md">
      <div className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
        <span>⚙️</span> Sparring Settings
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Opponent Selection */}
        <div>
          <label htmlFor="play-opponent-select" className="text-[11px] font-medium text-gray-400 mb-1 block">
            Opponent
          </label>
          <select
            id="play-opponent-select"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-purple-500 font-medium"
          >
            <option value="human_model">🧠 Human AI Model (1400–1800)</option>
            <option value="hybrid">♟️ Hybrid Coach (Stockfish + Neural)</option>
            <option value="stockfish">⚡ Stockfish 16</option>
          </select>
        </div>

        {/* Your Color */}
        <div>
          <span className="text-[11px] font-medium text-gray-400 mb-1 block">
            Play As
          </span>
          <div className="grid grid-cols-2 gap-1 bg-gray-800 p-0.5 rounded-lg border border-gray-700 min-h-[36px]">
            <button
              type="button"
              onClick={() => onColorChange('white')}
              className={`py-1.5 text-xs font-semibold rounded cursor-pointer flex items-center justify-center ${
                playerColor === 'white'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              ⚪ White
            </button>
            <button
              type="button"
              onClick={() => onColorChange('black')}
              className={`py-1.5 text-xs font-semibold rounded cursor-pointer flex items-center justify-center ${
                playerColor === 'black'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              ⚫ Black
            </button>
          </div>
        </div>
      </div>

      {/* AI Style & Variety Slider */}
      {engine === 'human_model' && (
        <div>
          <div className="text-[11px] font-medium text-gray-400 mb-1.5 flex items-center justify-between">
            <span>AI Play Variety (Temperature)</span>
            <span className="text-purple-400 font-bold">
              {temperature.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setTemperature(s.id)}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  Math.abs(temperature - s.id) < 0.1
                    ? 'bg-purple-950/60 border-purple-500 text-purple-200 shadow'
                    : 'bg-gray-800/60 border-gray-700/60 text-gray-400 hover:border-gray-600'
                }`}
              >
                <div className="text-xs font-bold">{s.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
