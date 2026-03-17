import { Ref, MaybeRefOrGetter } from 'vue';
import { QueryDefinition } from '../../core/dist';
export interface UseQueryReturn<T> {
    /** The query data (undefined until first successful fetch). */
    data: Ref<T | undefined>;
    /** True only on initial load when no cached data exists. */
    pending: Ref<boolean>;
    /** The error from the latest fetch attempt, if any. */
    error: Ref<Error | undefined>;
    /** True when revalidating in background while showing stale data. */
    revalidating: Ref<boolean>;
    /** Manually trigger a revalidation. */
    refresh: () => Promise<void>;
}
/**
 * Vue composable for reactive queries.
 *
 * @example
 * ```ts
 * const { data, pending, error } = useQuery(mintsQuery, () => [collection.value, tokenId.value])
 * ```
 */
export declare function useQuery<T, TArgs extends unknown[]>(query: QueryDefinition<T, TArgs>, args: MaybeRefOrGetter<TArgs>): UseQueryReturn<T>;
