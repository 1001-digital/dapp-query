import { Cache, SourceHealth, QueryDefinition, QuerySubscriber } from './types.js';
export interface QueryClientConfig {
    /** Cache backend. Defaults to in-memory cache. */
    cache?: Cache;
    /** Default stale time in ms. Default: 5 minutes. */
    defaultStaleTime?: number;
    /** Default stale-while-revalidate. Default: true. */
    defaultStaleWhileRevalidate?: boolean;
}
export declare function createQueryClient(config?: QueryClientConfig): {
    /** One-shot query: fetch data, using cache + sources. */
    fetch<T, TArgs extends unknown[]>(query: QueryDefinition<T, TArgs>, ...args: TArgs): Promise<T>;
    /** Subscribe to a query — returns data reactively and revalidates on changes. */
    subscribe<T, TArgs extends unknown[]>(query: QueryDefinition<T, TArgs>, args: TArgs, subscriber: QuerySubscriber<T>): () => void;
    /** Invalidate cache for a key and trigger revalidation for active subscribers. */
    invalidate<T, TArgs extends unknown[]>(query: QueryDefinition<T, TArgs>, ...args: TArgs): Promise<void>;
    /** Access to source health data (for debugging/monitoring). */
    getSourceHealth(sourceId: string): SourceHealth | undefined;
    /**
     * Poll sources until a predicate is satisfied or max attempts are exhausted.
     * Useful for waiting until on-chain state reflects a recent transaction.
     */
    waitForChange<T, TArgs extends unknown[]>(query: QueryDefinition<T, TArgs>, args: TArgs, predicate: (current: T, previous: T | undefined) => boolean, options?: {
        interval?: number;
        maxAttempts?: number;
    }): Promise<T | undefined>;
    /** Clear all caches and reset health tracking. */
    reset(): Promise<void>;
};
export type QueryClient = ReturnType<typeof createQueryClient>;
