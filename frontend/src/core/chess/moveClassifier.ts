import type { MoveClassification, PlayerColor } from '../../types/chess'

export interface ClassificationMetadata {
  label: string
  color: string
  bg: string
  icon: string
  symbol: string
}

export const CLASSIFICATION_META: Record<MoveClassification, ClassificationMetadata> = {
  best: {
    label: 'Best Move',
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/60 border-emerald-700/60',
    icon: '★',
    symbol: '★',
  },
  excellent: {
    label: 'Excellent',
    color: 'text-green-400',
    bg: 'bg-green-950/60 border-green-700/60',
    icon: '✓',
    symbol: '!',
  },
  good: {
    label: 'Good',
    color: 'text-lime-400',
    bg: 'bg-lime-950/60 border-lime-700/60',
    icon: '✓',
    symbol: '✓',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    color: 'text-yellow-400',
    bg: 'bg-yellow-950/60 border-yellow-700/60',
    icon: '?!',
    symbol: '?!',
  },
  mistake: {
    label: 'Mistake',
    color: 'text-orange-400',
    bg: 'bg-orange-950/60 border-orange-700/60',
    icon: '?',
    symbol: '?',
  },
  blunder: {
    label: 'Blunder',
    color: 'text-red-400',
    bg: 'bg-red-950/60 border-red-700/60',
    icon: '??',
    symbol: '??',
  },
  forced: {
    label: 'Forced',
    color: 'text-gray-400',
    bg: 'bg-gray-800/60 border-gray-600/60',
    icon: '□',
    symbol: '□',
  },
  book: {
    label: 'Book',
    color: 'text-amber-300',
    bg: 'bg-amber-950/60 border-amber-700/60',
    icon: '📖',
    symbol: '📖',
  },
}

export const CLASSIFICATION_BADGE: Record<string, { label: string; color: string }> = {
  best: { label: 'Best', color: 'bg-emerald-600 text-white' },
  excellent: { label: 'Excellent', color: 'bg-green-600 text-white' },
  good: { label: 'Good', color: 'bg-lime-700 text-white' },
  inaccuracy: { label: 'Inaccuracy', color: 'bg-yellow-600 text-black' },
  mistake: { label: 'Mistake', color: 'bg-orange-600 text-white' },
  blunder: { label: 'Blunder', color: 'bg-red-600 text-white' },
  forced: { label: 'Forced', color: 'bg-gray-600 text-white' },
  book: { label: 'Book', color: 'bg-amber-700 text-white' },
}

export function evalLabel(
  cp: number | null | undefined,
  playerColor?: PlayerColor
): { text: string; color: string } {
  if (cp === null || cp === undefined) {
    return { text: '—', color: 'text-gray-500' }
  }

  const effectiveCp = playerColor === 'black' ? -cp : cp

  if (effectiveCp >= 9000)
    return { text: 'Checkmate threat', color: 'text-emerald-400 font-bold' }
  if (effectiveCp <= -9000)
    return { text: 'Getting mated', color: 'text-red-400 font-bold' }

  const abs = Math.abs(effectiveCp)
  const pawns = (abs / 100).toFixed(1)
  const isPositive = effectiveCp > 0

  if (abs < 30) return { text: 'Equal (=)', color: 'text-gray-300' }
  if (abs < 90) {
    return isPositive
      ? { text: `Slight edge (+${pawns})`, color: 'text-emerald-300' }
      : { text: `Slight disadvantage (-${pawns})`, color: 'text-red-300' }
  }
  if (abs < 250) {
    return isPositive
      ? { text: `Clear advantage (+${pawns})`, color: 'text-emerald-400 font-semibold' }
      : { text: `Clear disadvantage (-${pawns})`, color: 'text-red-400 font-semibold' }
  }
  return isPositive
    ? { text: `Winning (+${pawns})`, color: 'text-emerald-300 font-bold' }
    : { text: `Losing (-${pawns})`, color: 'text-red-300 font-bold' }
}

export function cpLossDescription(loss: number | null | undefined): string | null {
  if (loss === null || loss === undefined || loss <= 5) return null
  if (loss <= 20) return 'Minimal loss of advantage'
  if (loss <= 50) return 'Noticeable advantage lost'
  if (loss <= 100) return 'Significant advantage lost'
  return 'Major blunder — large advantage given away'
}
