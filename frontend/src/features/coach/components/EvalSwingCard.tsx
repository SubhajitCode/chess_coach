import { evalLabel, cpLossDescription } from '../../../core/chess/moveClassifier'
import type { PlayerColor } from '../../../types/chess'

export interface EvalSwingCardProps {
  before?: number | null
  after?: number | null
  cpLoss?: number | null
  isPlayerMove?: boolean
  playerColor?: PlayerColor
}

export default function EvalSwingCard({
  before,
  after,
  cpLoss,
  isPlayerMove = false,
  playerColor = 'white',
}: EvalSwingCardProps) {
  const sign = playerColor === 'black' ? -1 : 1
  const beforeL = evalLabel(before !== null && before !== undefined ? before * sign : before)
  const afterL = evalLabel(after !== null && after !== undefined ? after * sign : after)
  const loss = cpLoss !== null && cpLoss !== undefined ? Math.round(cpLoss) : null
  const lossMsg = isPlayerMove ? cpLossDescription(loss) : null

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Position change
      </div>
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 mb-0.5">Before this move</div>
          <div className={`text-xs font-semibold truncate ${beforeL.color}`}>
            {beforeL.text}
          </div>
        </div>
        <div className="flex items-center text-gray-600 text-lg font-light">
          →
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 mb-0.5">After this move</div>
          <div className={`text-xs font-semibold truncate ${afterL.color}`}>
            {afterL.text}
          </div>
        </div>
        {loss !== null && loss > 5 && (
          <div className="flex-shrink-0 text-right">
            <div className="text-[10px] text-gray-500 mb-0.5">Lost</div>
            <div
              className={`text-xs font-bold ${
                loss > 100
                  ? 'text-red-400'
                  : loss > 50
                  ? 'text-orange-400'
                  : 'text-yellow-400'
              }`}
            >
              −{loss} cp
            </div>
          </div>
        )}
      </div>
      {lossMsg && (
        <div className="mt-2 text-[11px] text-gray-400 italic">{lossMsg}</div>
      )}
    </div>
  )
}
