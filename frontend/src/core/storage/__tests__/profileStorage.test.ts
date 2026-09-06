import { describe, it, expect, beforeEach } from 'vitest'
import { createStorage } from '../storageAdapter'
import {
  normalizeProfile,
  loadLocalProfile,
  persistLocalProfile,
  loadLastSession,
  persistLastSession,
} from '../profileStorage'
import type { StorageAdapter } from '../../../types/api'

describe('profileStorage', () => {
  let memoryStorage: StorageAdapter

  beforeEach(() => {
    memoryStorage = createStorage()
  })

  it('normalizes partial profile with default values', () => {
    const normalized = normalizeProfile({ username: ' Grandmaster ' })
    expect(normalized.username).toBe('Grandmaster')
    expect(normalized.platform).toBe('chesscom')
    expect(normalized.main_time_control).toBe('')
  })

  it('persists and loads profile via storage adapter', () => {
    persistLocalProfile(
      {
        username: 'Kasparov',
        platform: 'lichess',
        main_time_control: 'blitz',
      },
      memoryStorage
    )

    const loaded = loadLocalProfile(memoryStorage)
    expect(loaded.username).toBe('Kasparov')
    expect(loaded.platform).toBe('lichess')
    expect(loaded.main_time_control).toBe('blitz')
  })

  it('persists and loads last analysis session', () => {
    const session = {
      game: { pgn: '1. e4 e5', white: 'Alice', black: 'Bob' },
      playerColor: 'white' as const,
      username: 'Alice',
    }

    persistLastSession(session, memoryStorage)
    const loaded = loadLastSession(memoryStorage)
    expect(loaded).not.toBeNull()
    expect(loaded?.game.white).toBe('Alice')
    expect(loaded?.savedAt).toBeDefined()
  })
})
