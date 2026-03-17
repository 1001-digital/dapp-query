import type {
  Cache,
  CacheEntry,
  Source,
  SourceHealth,
  Strategy,
  QueryDefinition,
  QueryResult,
  QuerySubscriber,
} from './types.js'
import { memoryCache } from './cache/memory.js'

export interface QueryClientConfig {
  /** Cache backend. Defaults to in-memory cache. */
  cache?: Cache
  /** Default stale time in ms. Default: 5 minutes. */
  defaultStaleTime?: number
  /** Default stale-while-revalidate. Default: true. */
  defaultStaleWhileRevalidate?: boolean
}

interface ActiveQuery<T> {
  subscribers: Set<QuerySubscriber<T>>
  result: QueryResult<T>
  unwatch?: () => void
}

export function createQueryClient(config: QueryClientConfig = {}) {
  const cache = config.cache ?? memoryCache()
  const defaultStaleTime = config.defaultStaleTime ?? 5 * 60_000
  const defaultSWR = config.defaultStaleWhileRevalidate ?? true

  // Track in-flight requests for deduplication
  const inflight = new Map<string, Promise<unknown>>()

  // Track source health for smart fallback
  const health = new Map<string, SourceHealth>()

  // Active query subscriptions
  const active = new Map<string, ActiveQuery<unknown>>()

  function getHealth(sourceId: string): SourceHealth {
    let h = health.get(sourceId)
    if (!h) {
      h = { failures: 0, lastFailure: 0, avgLatency: 0, samples: 0 }
      health.set(sourceId, h)
    }
    return h
  }

  function recordSuccess(sourceId: string, latency: number) {
    const h = getHealth(sourceId)
    h.failures = Math.max(0, h.failures - 1) // Decay failures on success
    h.avgLatency = h.samples === 0
      ? latency
      : (h.avgLatency * h.samples + latency) / (h.samples + 1)
    h.samples++
  }

  function recordFailure(sourceId: string) {
    const h = getHealth(sourceId)
    h.failures++
    h.lastFailure = Date.now()
  }

  /** Execute a fetch against ordered sources using the given strategy. */
  async function resolveFromSources<T>(
    sources: Source<T>[],
    strategy: Strategy,
    args: unknown[],
  ): Promise<T> {
    if (strategy === 'race') {
      return raceStrategy(sources, args)
    }
    return fallbackStrategy(sources, args)
  }

  async function fallbackStrategy<T>(
    sources: Source<T>[],
    args: unknown[],
  ): Promise<T> {
    let lastError: Error | undefined

    for (const source of sources) {
      const h = getHealth(source.id)

      // Skip sources that have been failing recently (backoff)
      if (h.failures >= 3 && Date.now() - h.lastFailure < 30_000) {
        continue
      }

      try {
        const start = Date.now()
        const result = await source.fetch(...args)
        recordSuccess(source.id, Date.now() - start)
        return result
      } catch (error) {
        recordFailure(source.id)
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    throw lastError ?? new Error('All sources failed')
  }

  async function raceStrategy<T>(
    sources: Source<T>[],
    args: unknown[],
  ): Promise<T> {
    try {
      return await Promise.any(
        sources.map(async (source) => {
          const start = Date.now()
          try {
            const result = await source.fetch(...args)
            recordSuccess(source.id, Date.now() - start)
            return result
          } catch (error) {
            recordFailure(source.id)
            throw error
          }
        }),
      )
    } catch (error) {
      if (error instanceof AggregateError) {
        throw error.errors[0] ?? new Error('All sources failed')
      }
      throw error
    }
  }

  /** Deduplicated fetch — only one in-flight request per cache key. */
  function deduplicatedFetch<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined
    if (existing) return existing

    const promise = fn().finally(() => {
      inflight.delete(key)
    })

    inflight.set(key, promise)
    return promise
  }

  return {
    /** One-shot query: fetch data, using cache + sources. */
    async fetch<T, TArgs extends unknown[]>(
      query: QueryDefinition<T, TArgs>,
      ...args: TArgs
    ): Promise<T> {
      const key = query.key(...args)
      const staleTime = query.staleTime ?? defaultStaleTime
      const transform = query.transform ?? ((x: T) => x)

      // Check cache
      const cached = await cache.get<T>(key)
      if (cached && Date.now() - cached.timestamp < staleTime) {
        return cached.data
      }

      // Fetch from sources (deduplicated)
      const data = await deduplicatedFetch(key, async () => {
        const raw = await resolveFromSources(
          query.sources,
          query.strategy ?? 'fallback',
          args as unknown[],
        )
        return transform(raw)
      })

      // Update cache
      await cache.set(key, { data, timestamp: Date.now() })

      return data
    },

    /** Subscribe to a query — returns data reactively and revalidates on changes. */
    subscribe<T, TArgs extends unknown[]>(
      query: QueryDefinition<T, TArgs>,
      args: TArgs,
      subscriber: QuerySubscriber<T>,
    ): () => void {
      const key = query.key(...args)
      const staleTime = query.staleTime ?? defaultStaleTime
      const swr = query.staleWhileRevalidate ?? defaultSWR
      const transform = query.transform ?? ((x: T) => x)

      // Get or create active query
      let aq = active.get(key) as ActiveQuery<T> | undefined
      if (!aq) {
        aq = {
          subscribers: new Set(),
          result: { data: undefined, error: undefined, pending: true, revalidating: false },
        }
        active.set(key, aq as ActiveQuery<unknown>)
      }

      aq.subscribers.add(subscriber)

      function notify() {
        for (const sub of aq!.subscribers) {
          sub(aq!.result)
        }
      }

      async function revalidate() {
        try {
          const raw = await resolveFromSources(
            query.sources,
            query.strategy ?? 'fallback',
            args as unknown[],
          )
          const data = transform(raw)
          await cache.set(key, { data, timestamp: Date.now() })
          aq!.result = { data, error: undefined, pending: false, revalidating: false }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          aq!.result = { ...aq!.result, error: err, pending: false, revalidating: false }
        }
        notify()
      }

      // Initial load: check cache first
      cache.get<T>(key).then(async (cached) => {
        if (cached) {
          const isStale = Date.now() - cached.timestamp >= staleTime
          aq!.result = {
            data: cached.data,
            error: undefined,
            pending: false,
            revalidating: isStale && swr,
          }
          notify()

          if (isStale) {
            await revalidate()
          }
        } else {
          await revalidate()
        }
      })

      // Set up live watcher if available and not already watching
      if (!aq.unwatch) {
        // Use query-level watch, or find first source with watch
        const watchFactory = query.watch?.(...args)
          ?? query.sources.find((s) => s.watch)?.watch?.(...(args as unknown[]))

        if (watchFactory) {
          aq.unwatch = watchFactory(() => {
            aq!.result = { ...aq!.result, revalidating: true }
            notify()
            revalidate()
          })
        }
      }

      // Return unsubscribe
      return () => {
        aq!.subscribers.delete(subscriber)
        if (aq!.subscribers.size === 0) {
          aq!.unwatch?.()
          active.delete(key)
        }
      }
    },

    /** Invalidate cache for a key and trigger revalidation for active subscribers. */
    async invalidate<T, TArgs extends unknown[]>(
      query: QueryDefinition<T, TArgs>,
      ...args: TArgs
    ) {
      const key = query.key(...args)
      await cache.delete(key)

      // If there are active subscribers, trigger a revalidation
      const aq = active.get(key)
      if (aq && aq.subscribers.size > 0) {
        const transform = query.transform ?? ((x: T) => x)
        try {
          const raw = await resolveFromSources(
            query.sources,
            query.strategy ?? 'fallback',
            args as unknown[],
          )
          const data = transform(raw)
          await cache.set(key, { data, timestamp: Date.now() })
          aq.result = { data, error: undefined, pending: false, revalidating: false }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          aq.result = { ...aq.result, error: err, pending: false, revalidating: false }
        }
        for (const sub of aq.subscribers) {
          sub(aq.result as QueryResult<T>)
        }
      }
    },

    /** Access to source health data (for debugging/monitoring). */
    getSourceHealth(sourceId: string): SourceHealth | undefined {
      return health.get(sourceId)
    },

    /** Clear all caches and reset health tracking. */
    async reset() {
      await cache.clear()
      health.clear()
      for (const [, aq] of active) {
        aq.unwatch?.()
      }
      active.clear()
      inflight.clear()
    },
  }
}

export type QueryClient = ReturnType<typeof createQueryClient>
