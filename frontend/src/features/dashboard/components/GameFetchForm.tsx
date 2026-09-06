import React from 'react'
import { PLATFORMS, MONTHS } from '../../../core/coaching/coachPlans'
import type { CoachProfile } from '../../../types/coaching'

export interface GameFetchFormProps {
  profile: CoachProfile
  loading: boolean
  gamesSource?: string | null
  onFetch?: (e?: React.FormEvent) => void
  onOpenProfile?: () => void
  selectedPlatform?: { id: string; label: string; icon: string }
  year?: number
  setYear?: (y: number) => void
  month?: number
  setMonth?: (m: number) => void
  years?: number[]
  onUpdateField?: (field: keyof CoachProfile, val: string) => void
  onSubmit?: (e: React.FormEvent) => void
}

export default function GameFetchForm({
  profile,
  loading,
  gamesSource,
  onFetch,
  onOpenProfile,
  selectedPlatform,
  year,
  setYear,
  month,
  setMonth,
  years,
  onUpdateField,
  onSubmit,
}: GameFetchFormProps) {
  if (!onUpdateField || !onSubmit || !selectedPlatform || !years || !setYear || !setMonth || month === undefined || year === undefined) {
    const hasUsername = Boolean(profile.username?.trim())
    const platformLabel = profile.platform === 'lichess' ? 'Lichess' : 'Chess.com'
    const platformIcon = profile.platform === 'lichess' ? '♞' : '♟'

    const handleFetchClick = (e: React.FormEvent) => {
      e.preventDefault()
      if (onFetch) {
        onFetch(e)
      } else if (onSubmit) {
        onSubmit(e)
      }
    }

    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Import Games
              </span>
              {gamesSource && (
                <span className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300 font-mono">
                  {gamesSource}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-base font-bold text-white">
              {hasUsername
                ? `Fetch games for ${profile.username} on ${platformLabel}`
                : 'Connect your account to fetch games'}
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              {hasUsername
                ? `Sync your recent matches from ${platformLabel} into the analyzer.`
                : 'Set up your Chess.com or Lichess username to load games.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="px-3.5 py-2 rounded-xl border border-gray-700 hover:border-gray-600 bg-gray-800 text-xs font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                {hasUsername ? `${platformIcon} ${profile.username}` : 'Configure Account'}
              </button>
            )}

            <button
              type="button"
              onClick={handleFetchClick}
              disabled={loading || !hasUsername}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-xs font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⟳</span> Fetching...
                </>
              ) : (
                'Fetch Games'
              )}
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex gap-3">
        {PLATFORMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onUpdateField('platform', item.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer ${
              profile.platform === item.id
                ? 'border-blue-500 bg-blue-600/20 text-blue-400'
                : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="username-input" className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
          Username
        </label>
        <input
          id="username-input"
          type="text"
          value={profile.username}
          onChange={(e) => onUpdateField('username', e.target.value)}
          placeholder={`Your ${selectedPlatform.label} username`}
          className="w-full rounded-xl border border-gray-600 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 transition-colors focus:border-blue-500 focus:outline-none"
        />
      </div>

      {profile.platform === 'chesscom' && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="fetch-month-select" className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
              Month
            </label>
            <select
              id="fetch-month-select"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-600 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {MONTHS.map((item, index) => (
                <option key={item} value={index + 1}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label htmlFor="fetch-year-select" className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
              Year
            </label>
            <select
              id="fetch-year-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-600 bg-gray-800 px-3 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !profile.username.trim()}
        className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-all hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 cursor-pointer disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⟳</span> Fetching games...
          </span>
        ) : (
          'Fetch Games'
        )}
      </button>
    </form>
  )
}
