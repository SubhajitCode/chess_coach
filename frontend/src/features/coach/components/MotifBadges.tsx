import { formatMotifBadge } from '../../../core/coaching/motifFormatter'

export interface MotifBadgesProps {
  motifs?: string[]
}

export default function MotifBadges({ motifs = [] }: MotifBadgesProps) {
  if (!motifs || motifs.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {motifs.map((m, idx) => {
        const b = formatMotifBadge(m)
        return (
          <span
            key={`${idx}-${m}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${b.color}`}
          >
            <span>{b.icon}</span>
            <span>{b.label}</span>
          </span>
        )
      })}
    </div>
  )
}
