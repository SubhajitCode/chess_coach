import { formatDate, formatSavedAt, prettifyOpening } from '../../../core/chess/pgnParser'
import type { AnalysisSessionRecord } from '../../../core/storage/profileStorage'

export interface ResumeSessionCardProps {
  lastSession: AnalysisSessionRecord | null
  onResume: () => void
}

export default function ResumeSessionCard({
  lastSession,
  onResume,
}: ResumeSessionCardProps) {
  const resumeGame = lastSession?.game
  if (!resumeGame?.pgn) return null

  const resumeDate = formatSavedAt(lastSession?.savedAt)
  const resumeOpening = prettifyOpening(resumeGame.opening)

  return (
    <section className="rounded-2xl border border-emerald-700/40 bg-emerald-950/20 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Continue where you left off
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            {resumeGame.white} vs {resumeGame.black}
          </h2>
        </div>
        <button
          type="button"
          onClick={onResume}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 cursor-pointer"
        >
          Resume
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-emerald-100/80">
        {resumeOpening && <span>{resumeOpening}</span>}
        {resumeGame.time_control && <span>· {resumeGame.time_control}</span>}
        {resumeGame.end_time && <span>· {formatDate(resumeGame.end_time)}</span>}
        {resumeDate && <span>· Saved {resumeDate}</span>}
      </div>
    </section>
  )
}
