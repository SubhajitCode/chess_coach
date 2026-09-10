import type { WhyBadSummary } from '../../../types/coaching'

export interface WhyBadCardProps {
  whyBadSummary?: WhyBadSummary | null
}

export default function WhyBadCard({ whyBadSummary }: WhyBadCardProps) {
  if (!whyBadSummary) return null

  const { headline, detail, alternative, replyLine, recommendedLine } = whyBadSummary

  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-3.5 flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-red-400">
        Why this move didn't work
      </div>
      {headline && (
        <p className="text-sm font-semibold text-red-200 leading-snug">{headline}</p>
      )}
      {detail && <p className="text-xs text-gray-300 leading-relaxed">{detail}</p>}
      {alternative && (
        <p className="text-xs text-emerald-300 font-medium">{alternative}</p>
      )}
      {replyLine && (
        <div className="text-[11px] text-gray-400">
          Opponent punishment line:{' '}
          <span className="font-mono text-white font-semibold">{replyLine}</span>
        </div>
      )}
      {recommendedLine && !alternative && (
        <div className="text-[11px] text-gray-400">
          Engine recommendation:{' '}
          <span className="font-mono text-white font-semibold">{recommendedLine}</span>
        </div>
      )}
    </div>
  )
}
