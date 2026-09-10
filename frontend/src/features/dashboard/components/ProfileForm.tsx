import { useState } from 'react'
import type { CoachProfile, PlatformId } from '../../../types/coaching'

export interface ProfileFormProps {
  profile: CoachProfile
  saving?: boolean
  notice?: string | null
  onSave: (updated: CoachProfile) => void
  onCancel: () => void
}

export default function ProfileForm({
  profile,
  saving = false,
  notice = null,
  onSave,
  onCancel,
}: ProfileFormProps) {
  const [formState, setFormState] = useState<CoachProfile>({ ...profile })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formState)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {notice && (
        <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-300 font-medium">
          {notice}
        </div>
      )}

      <div>
        <label htmlFor="pf-username" className="text-xs uppercase tracking-wider text-gray-400 font-medium block mb-1">
          Username
        </label>
        <input
          id="pf-username"
          type="text"
          value={formState.username || ''}
          onChange={(e) =>
            setFormState((prev) => ({ ...prev, username: e.target.value }))
          }
          placeholder="e.g. MagnusCarlsen"
          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pf-platform" className="text-xs uppercase tracking-wider text-gray-400 font-medium block mb-1">
            Platform
          </label>
          <select
            id="pf-platform"
            value={formState.platform || 'chesscom'}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                platform: e.target.value as PlatformId,
              }))
            }
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="chesscom">Chess.com</option>
            <option value="lichess">Lichess</option>
          </select>
        </div>

        <div>
          <label htmlFor="pf-timecontrol" className="text-xs uppercase tracking-wider text-gray-400 font-medium block mb-1">
            Main Time Control
          </label>
          <select
            id="pf-timecontrol"
            value={formState.main_time_control || ''}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                main_time_control: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Auto / Any</option>
            <option value="rapid">Rapid (10+ min)</option>
            <option value="blitz">Blitz (3–5 min)</option>
            <option value="bullet">Bullet (1–2 min)</option>
            <option value="classical">Classical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pf-goal" className="text-xs uppercase tracking-wider text-gray-400 font-medium block mb-1">
            Improvement Goal
          </label>
          <select
            id="pf-goal"
            value={formState.improvement_goal || ''}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                improvement_goal: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">General Improvement</option>
            <option value="reach_1200">Break 1200 Elo</option>
            <option value="reach_1500">Reach 1500 Intermediate</option>
            <option value="reach_1800">Reach 1800 Club Master</option>
            <option value="stop_blundering">Eliminate One-Move Blunders</option>
          </select>
        </div>

        <div>
          <label htmlFor="pf-focus" className="text-xs uppercase tracking-wider text-gray-400 font-medium block mb-1">
            Current Focus
          </label>
          <select
            id="pf-focus"
            value={formState.focus_area || ''}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                focus_area: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Balanced</option>
            <option value="tactics">Tactical Awareness</option>
            <option value="openings">Opening Repertoire</option>
            <option value="endgames">Endgame Technique</option>
            <option value="time_management">Time Management</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-1.5 rounded-xl border border-gray-700 bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </form>
  )
}
