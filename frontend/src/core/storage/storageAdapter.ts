import type { StorageAdapter } from '../../types/api'

export class MemoryStorage implements StorageAdapter {
  private store: Map<string, string> = new Map()

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

export function createStorage(customStorage?: StorageAdapter): StorageAdapter {
  if (customStorage) return customStorage

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const testKey = '__test_storage__'
      window.localStorage.setItem(testKey, '1')
      window.localStorage.removeItem(testKey)
      return window.localStorage
    } catch {
      return new MemoryStorage()
    }
  }

  return new MemoryStorage()
}

export const appStorage: StorageAdapter = createStorage()
