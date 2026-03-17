import { Source } from '../types.js';
export interface HttpSourceConfig<T> {
    /** Base URL for the HTTP endpoint. */
    url: string;
    /** Build the request URL or body from query arguments. */
    request?: (...args: unknown[]) => {
        path?: string;
        params?: Record<string, string>;
    };
    /** Transform the raw JSON response into domain type. */
    transform: (data: any) => T;
    /** Custom fetch function. */
    fetchFn?: typeof fetch;
    /** Optional SSE endpoint for live updates. */
    sseUrl?: string;
}
/**
 * Creates a source that queries a REST/HTTP API.
 * Supports SSE for live change notifications.
 */
export declare function httpSource<T>(config: HttpSourceConfig<T>): Source<T>;
