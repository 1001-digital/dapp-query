/** A source fetches data from a single backend (RPC, indexer, API, etc.) */
export interface Source<T> {
    /** Unique identifier for logging and health tracking. */
    id: string;
    /** Fetch data for the given query key. */
    fetch(...args: unknown[]): Promise<T>;
    /** Optional: subscribe to live updates. Returns an unsubscribe function. */
    watch?(...args: unknown[]): (onChange: () => void) => (() => void);
}
/** Cache entry with metadata. */
export interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
/** Persistent or in-memory cache backend. */
export interface Cache {
    get<T>(key: string): Promise<CacheEntry<T> | undefined>;
    set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
/** Resolution strategy for multi-source queries. */
export type Strategy = 'fallback' | 'race';
/** Health state tracked per source. */
export interface SourceHealth {
    failures: number;
    lastFailure: number;
    avgLatency: number;
    samples: number;
}
/** Query definition — the blueprint for a data query. */
export interface QueryDefinition<T, TArgs extends unknown[] = unknown[]> {
    /** Derive a cache key from the query arguments. */
    key(...args: TArgs): string;
    /** Ordered list of data sources. */
    sources: Source<T>[];
    /** How to resolve across sources. Default: 'fallback'. */
    strategy?: Strategy;
    /** Cache TTL in milliseconds. Default: 5 minutes. */
    staleTime?: number;
    /** Return stale cache while revalidating in background. Default: true. */
    staleWhileRevalidate?: boolean;
    /** Optional transform applied after fetching. */
    transform?(raw: T): T;
    /** Optional: set up a watcher. Returns unsubscribe. */
    watch?(...args: TArgs): (onChange: () => void) => (() => void);
}
/** The result of executing a query. */
export interface QueryResult<T> {
    data: T | undefined;
    error: Error | undefined;
    /** True only on initial load (no cached data yet). */
    pending: boolean;
    /** True when revalidating in background (stale data shown). */
    revalidating: boolean;
}
/** Subscription callback. */
export type QuerySubscriber<T> = (result: QueryResult<T>) => void;
