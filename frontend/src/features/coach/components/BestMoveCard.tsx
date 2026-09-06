import { Chess } from 'chess.js'
import { PIECE_ICONS, PIECE_NAMES } from '../../../core/chess/fenTree'

export interface BestMoveCardProps {
  uci?: string
  san?: string
  summary?: string
  fenBefore?: string
  onPreview?: () => void
  onExitPreview?: () => void
  isPreviewing?: boolean
}

export default function BestMoveCard({
  uci,
  san,
  summary,
  fenBefore,
  onPreview,
  onExitPreview,
  isPreviewing,
}: BestMoveCardProps) {
  if (!san || !uci) return null

  let display = summary || san
  if (fenBefore) {
    try {
      const chess = new Chess(fenBefore)
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const piece = chess.get(from as any)
      const target = chess.get(to as any)
      if (piece) {
        const icon = PIECE_ICONS[piece.color]?.[piece.type] || ''
        const result = chess.move({ from, to, promotion: uci[4] || undefined })
        if (result) {
          const isCastle =
            result.flags?.includes('k') || result.flags?.includes('q')
          if (isCastle) {
            display = `${icon} ${
              result.flags?.includes('k') ? 'Castle kingside' : 'Castle queenside'
            }`
          } else if (target) {
            display = `${icon} ${PIECE_NAMES[piece.type]} on ${from} captures ${
              PIECE_NAMES[target.type]
            } on ${to}`
          } else {
            display = `${icon} ${PIECE_NAMES[piece.type]} moves from ${from} to ${to}`
          }
        }
      }
    } catch {
      // fallback to summary/san
    }
  }

  const handleClick = () => {
    if (isPreviewing) onExitPreview?.()
    else onPreview?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${
        isPreviewing
          ? 'border-emerald-500 bg-emerald-950/50 ring-1 ring-emerald-700/50'
          : 'border-emerald-800/50 bg-emerald-950/25 hover:border-emerald-600/70 hover:bg-emerald-950/40'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
          ★ Engine's best move
        </div>
        <div
          className={`text-[10px] ${
            isPreviewing ? 'text-emerald-400' : 'text-emerald-800'
          }`}
        >
          {isPreviewing ? '● on board' : 'click → preview'}
        </div>
      </div>
      <div className="text-sm text-emerald-200 font-medium">{display}</div>
    </button>
  )
}
