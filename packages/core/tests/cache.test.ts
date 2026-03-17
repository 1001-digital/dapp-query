import { describe, it, expect } from 'vitest'
import { memoryCache } from '../src/cache/memory.js'

describe('memoryCache', () => {
  it('stores and retrieves entries', async () => {
    const cache = memoryCache()
    await cache.set('k1', { data: 'hello', timestamp: 1000 })

    const entry = await cache.get('k1')
    expect(entry?.data).toBe('hello')
    expect(entry?.timestamp).toBe(1000)
  })

  it('returns undefined for missing keys', async () => {
    const cache = memoryCache()
    expect(await cache.get('missing')).toBeUndefined()
  })

  it('deletes entries', async () => {
    const cache = memoryCache()
    await cache.set('k1', { data: 1, timestamp: 0 })
    await cache.delete('k1')
    expect(await cache.get('k1')).toBeUndefined()
  })

  it('clears all entries', async () => {
    const cache = memoryCache()
    await cache.set('k1', { data: 1, timestamp: 0 })
    await cache.set('k2', { data: 2, timestamp: 0 })
    await cache.clear()
    expect(await cache.get('k1')).toBeUndefined()
    expect(await cache.get('k2')).toBeUndefined()
  })

  it('evicts oldest entries when max size exceeded', async () => {
    const cache = memoryCache(2)
    await cache.set('k1', { data: 1, timestamp: 0 })
    await cache.set('k2', { data: 2, timestamp: 0 })
    await cache.set('k3', { data: 3, timestamp: 0 })

    // k1 should be evicted (oldest)
    expect(await cache.get('k1')).toBeUndefined()
    expect(await cache.get('k2')).toBeDefined()
    expect(await cache.get('k3')).toBeDefined()
  })

  it('promotes accessed entries (LRU)', async () => {
    const cache = memoryCache(2)
    await cache.set('k1', { data: 1, timestamp: 0 })
    await cache.set('k2', { data: 2, timestamp: 0 })

    // Access k1 to promote it
    await cache.get('k1')

    // Add k3 — k2 should be evicted (least recently used)
    await cache.set('k3', { data: 3, timestamp: 0 })

    expect(await cache.get('k1')).toBeDefined()
    expect(await cache.get('k2')).toBeUndefined()
    expect(await cache.get('k3')).toBeDefined()
  })
})
