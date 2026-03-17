import type { Source } from '../types.js'

export interface HttpSourceConfig<T> {
  /** Base URL for the HTTP endpoint. */
  url: string
  /** Build the request URL or body from query arguments. */
  request?: (...args: unknown[]) => { path?: string; params?: Record<string, string> }
  /** Transform the raw JSON response into domain type. */
  transform: (data: any) => T
  /** Custom fetch function. */
  fetchFn?: typeof fetch
  /** Optional SSE endpoint for live updates. */
  sseUrl?: string
}

/**
 * Creates a source that queries a REST/HTTP API.
 * Supports SSE for live change notifications.
 */
export function httpSource<T>(config: HttpSourceConfig<T>): Source<T> {
  const {
    url,
    request,
    transform,
    fetchFn = globalThis.fetch,
    sseUrl,
  } = config

  return {
    id: `http:${url}`,

    async fetch(...args: unknown[]) {
      const req = request?.(...args)
      let fetchUrl = url + (req?.path ?? '')

      if (req?.params) {
        const search = new URLSearchParams(req.params)
        fetchUrl += '?' + search.toString()
      }

      const res = await fetchFn(fetchUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      return transform(data)
    },

    watch: sseUrl
      ? () => {
          return (onChange: () => void) => {
            const source = new EventSource(sseUrl)
            source.addEventListener('change', () => onChange())
            return () => source.close()
          }
        }
      : undefined,
  }
}
