import { Source } from '../types.js';
export interface GraphQLSourceConfig<T> {
    /** One or more GraphQL endpoints (tried in order for failover). */
    endpoints: string[];
    /** The GraphQL query string. */
    query: string;
    /** Build variables from the query arguments. */
    variables?: (...args: unknown[]) => Record<string, unknown>;
    /** Transform the raw response data into domain type. */
    transform: (data: any) => T;
    /** Custom fetch function (for SSR or testing). */
    fetchFn?: typeof fetch;
}
/**
 * Creates a source that queries a GraphQL indexer (Ponder, The Graph, etc.)
 * with multi-endpoint failover.
 */
export declare function graphqlSource<T>(config: GraphQLSourceConfig<T>): Source<T>;
/** Execute a GraphQL query with multi-endpoint failover. */
export declare function graphqlFetch<T>(endpoints: string[], query: string, variables: Record<string, unknown> | undefined, transform: (data: any) => T, fetchFn?: typeof fetch): Promise<T>;
