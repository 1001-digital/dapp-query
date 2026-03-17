import { inject, type App, type InjectionKey } from 'vue'
import type { QueryClient } from '@dapp-query/core'

export const QueryClientKey: InjectionKey<QueryClient> = Symbol('dapp-query')

export function dappQueryPlugin(app: App, client: QueryClient) {
  app.provide(QueryClientKey, client)
}

export function useQueryClient(): QueryClient {
  const client = inject(QueryClientKey)
  if (!client) throw new Error('dapp-query: No QueryClient provided. Use app.use(dappQueryPlugin, client).')
  return client
}
