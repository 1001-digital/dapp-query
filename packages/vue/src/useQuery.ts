import {
  ref,
  watch,
  computed,
  onScopeDispose,
  toValue,
  type Ref,
  type MaybeRefOrGetter,
} from 'vue'
import type { QueryDefinition, QueryResult } from '@dapp-query/core'
import { useQueryClient } from './plugin.js'

export interface UseQueryReturn<T> {
  /** The query data (undefined until first successful fetch). */
  data: Ref<T | undefined>
  /** True only on initial load when no cached data exists. */
  pending: Ref<boolean>
  /** The error from the latest fetch attempt, if any. */
  error: Ref<Error | undefined>
  /** True when revalidating in background while showing stale data. */
  revalidating: Ref<boolean>
  /** Manually trigger a revalidation. */
  refresh: () => Promise<void>
}

/**
 * Vue composable for reactive queries.
 *
 * @example
 * ```ts
 * const { data, pending, error } = useQuery(mintsQuery, () => [collection.value, tokenId.value])
 * ```
 */
export function useQuery<T, TArgs extends unknown[]>(
  query: QueryDefinition<T, TArgs>,
  args: MaybeRefOrGetter<TArgs>,
): UseQueryReturn<T> {
  const client = useQueryClient()

  const data = ref<T | undefined>() as Ref<T | undefined>
  const pending = ref(true)
  const error = ref<Error | undefined>()
  const revalidating = ref(false)

  let unsubscribe: (() => void) | undefined

  function subscribe() {
    unsubscribe?.()

    const currentArgs = toValue(args)

    unsubscribe = client.subscribe(query, currentArgs, (result: QueryResult<T>) => {
      data.value = result.data
      pending.value = result.pending
      error.value = result.error
      revalidating.value = result.revalidating
    })
  }

  // Subscribe immediately
  subscribe()

  // Re-subscribe when args change
  const argsRef = computed(() => toValue(args))
  watch(argsRef, () => subscribe(), { deep: true })

  // Cleanup on scope dispose
  onScopeDispose(() => {
    unsubscribe?.()
  })

  async function refresh() {
    const currentArgs = toValue(args)
    await client.invalidate(query, ...currentArgs)
  }

  return {
    data,
    pending,
    error,
    revalidating,
    refresh,
  }
}
