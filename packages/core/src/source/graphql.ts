import type { Source } from '../types.js'

export interface GraphQLSourceConfig<T> {
  /** One or more GraphQL endpoints (tried in order for failover). */
  endpoints: string[]
  /** The GraphQL query string. */
  query: string
  /** Build variables from the query arguments. */
  variables?: (...args: unknown[]) => Record<string, unknown>
  /** Transform the raw response data into domain type. */
  transform: (data: any) => T
  /** Custom fetch function (for SSR or testing). */
  fetchFn?: typeof fetch
}

/**
 * Creates a source that queries a GraphQL indexer (Ponder, The Graph, etc.)
 * with multi-endpoint failover.
 */
export function graphqlSource<T>(config: GraphQLSourceConfig<T>): Source<T> {
  const {
    endpoints,
    query,
    variables,
    transform,
    fetchFn = globalThis.fetch,
  } = config

  return {
    id: `graphql:${endpoints[0] ?? 'unknown'}`,

    async fetch(...args: unknown[]) {
      const vars = variables?.(...args)
      return graphqlFetch(endpoints, query, vars, transform, fetchFn)
    },
  }
}

/** Execute a GraphQL query with multi-endpoint failover. */
export async function graphqlFetch<T>(
  endpoints: string[],
  query: string,
  variables: Record<string, unknown> | undefined,
  transform: (data: any) => T,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<T> {
  let lastError: Error | undefined

  for (const endpoint of endpoints) {
    try {
      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const response: { data: any; errors?: { message: string }[] } = await res.json()

      if (response.errors?.length) {
        throw new Error(response.errors[0]!.message)
      }

      return transform(response.data)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error('No GraphQL endpoints configured')
}
