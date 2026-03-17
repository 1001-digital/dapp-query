// Types
export type {
  Source,
  Cache,
  CacheEntry,
  Strategy,
  SourceHealth,
  QueryDefinition,
  QueryResult,
  QuerySubscriber,
} from './types.js'

// Client
export { createQueryClient, type QueryClient, type QueryClientConfig } from './client.js'

// Sources
export { rpcSource, type RpcSourceConfig } from './source/rpc.js'
export { graphqlSource, graphqlFetch, type GraphQLSourceConfig } from './source/graphql.js'
export { httpSource, type HttpSourceConfig } from './source/http.js'
export { customSource, type CustomSourceConfig } from './source/custom.js'

// Cache
export { memoryCache } from './cache/memory.js'
export { idbCache, bigintReviver } from './cache/idb.js'
