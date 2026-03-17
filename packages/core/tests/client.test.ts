import { describe, it, expect, vi } from 'vitest'
import { createQueryClient } from '../src/client.js'
import { customSource } from '../src/source/custom.js'
import { memoryCache } from '../src/cache/memory.js'
import type { QueryDefinition, Source } from '../src/types.js'

function makeSource<T>(id: string, data: T, delay = 0): Source<T> {
  return customSource({
    id,
    fetch: async () => {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay))
      return data
    },
  })
}

function failingSource<T>(id: string, error = 'fail'): Source<T> {
  return customSource({
    id,
    fetch: async () => { throw new Error(error) },
  })
}

function makeQuery<T>(
  sources: Source<T>[],
  opts: Partial<QueryDefinition<T, [string]>> = {},
): QueryDefinition<T, [string]> {
  return {
    key: (k: string) => k,
    sources,
    ...opts,
  }
}

describe('createQueryClient', () => {
  describe('fetch', () => {
    it('fetches from a single source', async () => {
      const client = createQueryClient()
      const query = makeQuery([makeSource('s1', { count: 5 })])

      const result = await client.fetch(query, 'test')
      expect(result).toEqual({ count: 5 })
    })

    it('returns cached data within staleTime', async () => {
      const fetchFn = vi.fn(async () => 42)
      const source = customSource({ id: 's1', fetch: fetchFn })
      const client = createQueryClient({ defaultStaleTime: 60_000 })
      const query = makeQuery([source])

      await client.fetch(query, 'k')
      await client.fetch(query, 'k')

      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('refetches after staleTime expires', async () => {
      let counter = 0
      const source = customSource({
        id: 's1',
        fetch: async () => ++counter,
      })
      const client = createQueryClient({ defaultStaleTime: 10 })
      const query = makeQuery([source])

      const first = await client.fetch(query, 'k')
      await new Promise((r) => setTimeout(r, 20))
      const second = await client.fetch(query, 'k')

      expect(first).toBe(1)
      expect(second).toBe(2)
    })

    it('applies transform', async () => {
      const client = createQueryClient()
      const query = makeQuery([makeSource('s1', [1, 2, 3])], {
        transform: (arr) => arr.filter((n) => n > 1),
      })

      const result = await client.fetch(query, 'k')
      expect(result).toEqual([2, 3])
    })

    it('deduplicates concurrent requests', async () => {
      const fetchFn = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 50))
        return 'data'
      })
      const source = customSource({ id: 's1', fetch: fetchFn })
      const client = createQueryClient()
      const query = makeQuery([source])

      const [a, b] = await Promise.all([
        client.fetch(query, 'k'),
        client.fetch(query, 'k'),
      ])

      expect(a).toBe('data')
      expect(b).toBe('data')
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('fallback strategy', () => {
    it('falls back to second source on failure', async () => {
      const client = createQueryClient()
      const query = makeQuery([
        failingSource('bad'),
        makeSource('good', 'ok'),
      ])

      const result = await client.fetch(query, 'k')
      expect(result).toBe('ok')
    })

    it('throws if all sources fail', async () => {
      const client = createQueryClient()
      const query = makeQuery([
        failingSource('bad1', 'error1'),
        failingSource('bad2', 'error2'),
      ])

      await expect(client.fetch(query, 'k')).rejects.toThrow('error2')
    })

    it('tracks source health after failures', async () => {
      const client = createQueryClient()
      const query = makeQuery([
        failingSource('bad'),
        makeSource('good', 'ok'),
      ])

      await client.fetch(query, 'k')

      const badHealth = client.getSourceHealth('bad')
      expect(badHealth?.failures).toBe(1)

      const goodHealth = client.getSourceHealth('good')
      expect(goodHealth?.failures).toBe(0)
      expect(goodHealth?.samples).toBe(1)
    })
  })

  describe('race strategy', () => {
    it('returns the first successful result', async () => {
      const client = createQueryClient()
      const query = makeQuery(
        [
          makeSource('slow', 'slow-data', 100),
          makeSource('fast', 'fast-data', 10),
        ],
        { strategy: 'race' },
      )

      const result = await client.fetch(query, 'k')
      expect(result).toBe('fast-data')
    })

    it('succeeds if at least one source works', async () => {
      const client = createQueryClient()
      const query = makeQuery(
        [failingSource('bad'), makeSource('good', 'ok')],
        { strategy: 'race' },
      )

      const result = await client.fetch(query, 'k')
      expect(result).toBe('ok')
    })
  })

  describe('subscribe', () => {
    it('notifies subscriber with data', async () => {
      const client = createQueryClient()
      const query = makeQuery([makeSource('s1', 'hello')])

      const results: any[] = []
      const unsub = client.subscribe(query, ['k'], (r) => {
        results.push({ ...r })
      })

      // Wait for async initial load
      await new Promise((r) => setTimeout(r, 50))

      expect(results.length).toBeGreaterThan(0)
      const last = results[results.length - 1]
      expect(last.data).toBe('hello')
      expect(last.pending).toBe(false)

      unsub()
    })

    it('cleans up on unsubscribe', async () => {
      const client = createQueryClient()
      const query = makeQuery([makeSource('s1', 'data')])

      const unsub = client.subscribe(query, ['k'], () => {})
      unsub()

      // No error, no hanging watchers
    })
  })

  describe('invalidate', () => {
    it('clears cache and refetches for active subscribers', async () => {
      let counter = 0
      const source = customSource({
        id: 's1',
        fetch: async () => ++counter,
      })
      const client = createQueryClient({ defaultStaleTime: 60_000 })
      const query = makeQuery([source])

      const results: any[] = []
      const unsub = client.subscribe(query, ['k'], (r) => {
        results.push({ ...r })
      })

      await new Promise((r) => setTimeout(r, 50))
      expect(results[results.length - 1].data).toBe(1)

      await client.invalidate(query, 'k')
      await new Promise((r) => setTimeout(r, 50))

      expect(results[results.length - 1].data).toBe(2)
      unsub()
    })
  })

  describe('reset', () => {
    it('clears all state', async () => {
      const client = createQueryClient()
      const query = makeQuery([makeSource('s1', 42)])

      await client.fetch(query, 'k')
      await client.reset()

      // Health should be cleared
      expect(client.getSourceHealth('s1')).toBeUndefined()
    })
  })
})
