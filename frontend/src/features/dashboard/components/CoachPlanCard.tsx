import { prettifyProfileValue } from '../../../core/coaching/coachPlans'
import type { CoachPlan, CoachProfile } from '../../../types/coaching'

export interface CoachPlanCardProps {
  activePlan: CoachPlan | null
  planProfile: CoachProfile | null
  onEditProfile: () => void
}

export default function CoachPlanCard({
  activePlan,
  planProfile,
  onEditProfile,
}: CoachPlanCardProps) {
  if (!activePlan) return null

  const profileSummary = [
    planProfile?.main_time_control &&
      `Time control: ${prettifyProfileValue(planProfile.main_time_control)}`,
    planProfile?.improvement_goal &&
      `Goal: ${prettifyProfileValue(planProfile.improvement_goal)}`,
    planProfile?.focus_area &&
      `Focus: ${prettifyProfileValue(planProfile.focus_area)}`,
  ].filter(Boolean)

  return (
    <section className="rounded-2xl border border-cyan-700/40 bg-gradient-to-r from-cyan-950/30 via-slate-900/80 to-blue-950/30 p-5 shadow-lg">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
              Personalized Plan
            </span>
            <span className="rounded-full border border-cyan-500/50 bg-cyan-950/60 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
              {activePlan.bandLabel || 'Plan'}
            </span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-white">
            {activePlan.theme || activePlan.title}
          </h2>
          <p className="mt-1 text-xs text-gray-300 max-w-2xl">
            {activePlan.description || activePlan.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={onEditProfile}
          className="self-start md:self-auto rounded-lg border border-cyan-600/60 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/50 transition-colors cursor-pointer"
        >
          Adjust Profile
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-3">
          <p className="font-semibold text-cyan-300 mb-1">
            Focus Areas For Your Next Games
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            {activePlan.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-3">
          <p className="font-semibold text-blue-300 mb-1">
            Suggested Improvement Routine
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            {(activePlan.drills || []).map((drill: string) => (
              <li key={drill}>{drill}</li>
            ))}
          </ul>
        </div>
      </div>

      {profileSummary.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {profileSummary.map((item) => (
            <span
              key={item as string}
              className="rounded-full border border-gray-700 bg-gray-800/80 px-2.5 py-0.5 text-[11px] text-gray-300"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
