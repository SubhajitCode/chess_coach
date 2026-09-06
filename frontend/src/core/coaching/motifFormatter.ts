import type { MotifBadge } from '../../types/coaching'

export const MOTIF_LABELS: Record<string, MotifBadge> = {
  fork: {
    label: 'Fork',
    icon: '🔱',
    color: 'text-amber-400 bg-amber-950/60 border-amber-700/60',
  },
  pin: {
    label: 'Pin',
    icon: '📌',
    color: 'text-cyan-400 bg-cyan-950/60 border-cyan-700/60',
  },
  skewer: {
    label: 'Skewer',
    icon: '🗡️',
    color: 'text-purple-400 bg-purple-950/60 border-purple-700/60',
  },
  discovered_attack: {
    label: 'Discovered Attack',
    icon: '⚡',
    color: 'text-yellow-400 bg-yellow-950/60 border-yellow-700/60',
  },
  hanging_piece: {
    label: 'Hanging Piece',
    icon: '🎯',
    color: 'text-red-400 bg-red-950/60 border-red-700/60',
  },
  back_rank: {
    label: 'Back Rank',
    icon: '🛡️',
    color: 'text-blue-400 bg-blue-950/60 border-blue-700/60',
  },
  trapped_piece: {
    label: 'Trapped Piece',
    icon: '🕸️',
    color: 'text-orange-400 bg-orange-950/60 border-orange-700/60',
  },
  deflection: {
    label: 'Deflection',
    icon: '🔀',
    color: 'text-indigo-400 bg-indigo-950/60 border-indigo-700/60',
  },
  overloaded_piece: {
    label: 'Overloaded Piece',
    icon: '⚖️',
    color: 'text-pink-400 bg-pink-950/60 border-pink-700/60',
  },
}

export function formatMotifBadge(motif: string): MotifBadge {
  const normalized = motif.toLowerCase().trim().replace(/[- ]+/g, '_')
  if (MOTIF_LABELS[normalized]) {
    return MOTIF_LABELS[normalized]
  }
  const cleanLabel = motif
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return {
    label: cleanLabel,
    icon: '♟',
    color: 'text-gray-300 bg-gray-800 border-gray-600',
  }
}
