import type { CoachProfile } from '../../types/coaching'
import type { GameItem, PlayerColor } from '../../types/chess'
import type { StorageAdapter } from '../../types/api'
import { appStorage } from './storageAdapter'

export const PROFILE_STORAGE_KEY = 'chess_coach_user_profile_v1'
export const LAST_SESSION_KEY = 'chess_coach_last_session_v1'

export interface AnalysisSessionRecord {
  game: GameItem
  playerColor: PlayerColor
  username?: string | null
  savedAt: string
}

export function normalizeProfile(raw?: Partial<CoachProfile> | null): CoachProfile {
  return {
    username: (raw?.username || '').trim(),
    platform: raw?.platform === 'lichess' ? 'lichess' : 'chesscom',
    main_time_control: raw?.main_time_control || '',
    improvement_goal: raw?.improvement_goal || '',
    focus_area: raw?.focus_area || '',
    updated_at: raw?.updated_at || null,
  }
}

export function loadLocalProfile(storage: StorageAdapter = appStorage): CoachProfile {
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY)
    if (typeof raw === 'string') {
      return normalizeProfile(JSON.parse(raw))
    }
  } catch {
    // ignore parse error
  }
  return normalizeProfile()
}

export function persistLocalProfile(
  profile: Partial<CoachProfile>,
  storage: StorageAdapter = appStorage
): CoachProfile {
  const normalized = normalizeProfile(profile)
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // ignore storage error
  }
  return normalized
}

export function loadLastSession(
  storage: StorageAdapter = appStorage
): AnalysisSessionRecord | null {
  try {
    const raw = storage.getItem(LAST_SESSION_KEY)
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.game && parsed.game.pgn) {
        return parsed as AnalysisSessionRecord
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function persistLastSession(
  session: { game: GameItem; playerColor: PlayerColor; username?: string | null },
  storage: StorageAdapter = appStorage
): void {
  try {
    storage.setItem(
      LAST_SESSION_KEY,
      JSON.stringify({
        ...session,
        savedAt: new Date().toISOString(),
      })
    )
  } catch {
    // ignore
  }
}
