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

  describe('waitForChange', () => {
    it('resolves immediately when predicate matches on first fetch', async () => {
      const client = createQueryClient()
      const query = makeQuery([makeSource('s1', 10)])

      // Seed cache with old value
      await client.fetch(query, 'k')

      // Source now returns a different value
      const source = customSource({
        id: 's1',
        fetch: async () => 20,
      })
      const query2 = makeQuery([source])

      const result = await client.waitForChange(
        query2,
        ['k'],
        (current, previous) => current !== previous,
        { interval: 10, maxAttempts: 5 },
      )

      expect(result).toBe(20)
    })

    it('polls until predicate matches', async () => {
      let counter = 0
      const source = customSource({
        id: 's1',
        fetch: async () => ++counter,
      })
      const client = createQueryClient()
      const query = makeQuery([source])

      // Seed cache with value 1
      await client.fetch(query, 'k')

      // Now counter is at 1; predicate waits for value > 3
      const result = await client.waitForChange(
        query,
        ['k'],
        (current) => current > 3,
        { interval: 10, maxAttempts: 10 },
      )

      // counter increments each fetch: 2, 3, 4 — matches at 4
      expect(result).toBe(4)
    })

    it('returns undefined when max attempts exhausted', async () => {
      const source = customSource({
        id: 's1',
        fetch: async () => 1, // Never changes
      })
      const client = createQueryClient()
      const query = makeQuery([source])

      // Seed cache
      await client.fetch(query, 'k')

      const result = await client.waitForChange(
        query,
        ['k'],
        (current, previous) => current !== previous,
        { interval: 10, maxAttempts: 3 },
      )

      expect(result).toBeUndefined()
    })

    it('updates cache and notifies subscribers on success', async () => {
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

      // Wait for initial subscription load
      await new Promise((r) => setTimeout(r, 50))
      expect(results[results.length - 1].data).toBe(1)

      // waitForChange: predicate matches when value > 1
      await client.waitForChange(
        query,
        ['k'],
        (current) => current > 1,
        { interval: 10, maxAttempts: 5 },
      )

      expect(results[results.length - 1].data).toBe(2)

      // Subsequent fetch should use updated cache
      const cached = await client.fetch(query, 'k')
      expect(cached).toBe(2)

      unsub()
    })

    it('updates cache even when exhausted', async () => {
      let counter = 0
      const source = customSource({
        id: 's1',
        fetch: async () => ++counter,
      })
      const client = createQueryClient({ defaultStaleTime: 60_000 })
      const query = makeQuery([source])

      // Seed cache
      await client.fetch(query, 'k')
      expect(counter).toBe(1)

      // Predicate never satisfied (always false)
      await client.waitForChange(
        query,
        ['k'],
        () => false,
        { interval: 10, maxAttempts: 3 },
      )

      // Cache should be updated with the latest value fetched during polling
      const cached = await client.fetch(query, 'k')
      // counter went 1 (seed) → 2, 3, 4 (3 poll attempts) — cache has 4
      expect(cached).toBe(4)
    })

    it('works with no prior cache', async () => {
      let counter = 0
      const source = customSource({
        id: 's1',
        fetch: async () => ++counter,
      })
      const client = createQueryClient()
      const query = makeQuery([source])

      // No seed — previous is undefined
      const result = await client.waitForChange(
        query,
        ['k'],
        (current, previous) => previous === undefined && current > 0,
        { interval: 10, maxAttempts: 3 },
      )

      expect(result).toBe(1)
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
