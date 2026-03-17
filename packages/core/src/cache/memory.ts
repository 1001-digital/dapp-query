import type { Cache, CacheEntry } from '../types.js'

/** In-memory cache with optional max size (LRU eviction). */
export function memoryCache(maxSize: number = 500): Cache {
  const store = new Map<string, CacheEntry<unknown>>()

  function evict() {
    if (store.size <= maxSize) return
    // Delete oldest entry (first inserted)
    const first = store.keys().next().value
    if (first !== undefined) store.delete(first)
  }

  return {
    async get<T>(key: string) {
      const entry = store.get(key) as CacheEntry<T> | undefined
      if (entry) {
        // Move to end (most recently accessed)
        store.delete(key)
        store.set(key, entry)
      }
      return entry
    },

    async set<T>(key: string, entry: CacheEntry<T>) {
      store.delete(key) // Remove first to update insertion order
      store.set(key, entry)
      evict()
    },

    async delete(key: string) {
      store.delete(key)
    },

    async clear() {
      store.clear()
    },
  }
}
