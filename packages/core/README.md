# @1001-digital/dapp-query-core

Resilient on-chain data queries with multi-source fallback and local caching.

```
npm install @dapp-query/core
```

## What it does

Define data sources (RPC nodes, GraphQL indexers, REST APIs), and the query client handles resolution order, automatic fallback, request deduplication, caching, and live updates.

## Quick Start

```ts
import { createQueryClient, graphqlSource, rpcSource, idbCache } from '@dapp-query/core'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'

const client = createQueryClient({
  cache: idbCache('my-app'),
})

const indexed = graphqlSource({
  endpoints: ['https://indexer.example.com'],
  query: `query($address: String!) { transfers(where: { from: $address }) { items { to value block } } }`,
  variables: (address) => ({ address }),
  transform: (data) => data.transfers.items,
})

const viemClient = createPublicClient({ chain: mainnet, transport: http() })

const onchain = rpcSource({
  client: viemClient,
  event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  address: '0x...',
  fromBlock: 18_000_000n,
  transform: (logs) => logs.map((l) => ({ to: l.args.to, value: l.args.value, block: l.blockNumber })),
})

const transfersQuery = {
  key: (address: string) => `transfers:${address}`,
  sources: [indexed, onchain],
  staleTime: 5 * 60_000,
}

const transfers = await client.fetch(transfersQuery, '0xabc...')
```

## Sources

A source wraps a data backend. Each source transforms its raw response into a shared domain type.

### `rpcSource`

Fetches event logs from an RPC node. Automatically chunks large block ranges to stay within provider limits.

```ts
rpcSource({
  client: viemClient,
  event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  address: '0x...',
  fromBlock: 18_000_000n,
  maxBlockRange: 2000,    // blocks per getLogs call (default: 2000)
  filter: (address) => ({ from: address }),
  transform: (logs) => logs.map(parseTransfer),
})
```

Supports live updates via block polling (12s interval).

### `graphqlSource`

Queries a GraphQL indexer (Ponder, The Graph, etc.) with multi-endpoint failover.

```ts
graphqlSource({
  endpoints: [primaryIndexer, backupIndexer],
  query: TRANSFERS_QUERY,
  variables: (address) => ({ address }),
  transform: (data) => data.transfers.items,
})
```

### `httpSource`

Queries a REST API. Supports live updates via Server-Sent Events.

```ts
httpSource({
  url: 'https://api.example.com/transfers',
  request: (address) => ({ params: { address: address as string } }),
  transform: (data) => data.map(parseTransfer),
  sseUrl: 'https://api.example.com/transfers/stream',
})
```

### `customSource`

Wraps any async function.

```ts
customSource({
  id: 'my-source',
  fetch: async (address) => {
    const res = await fetch(`/api/transfers/${address}`)
    return res.json()
  },
})
```

## Query Client

```ts
const client = createQueryClient({
  cache: idbCache('my-app'),   // or memoryCache(500)
  defaultStaleTime: 5 * 60_000,
  defaultStaleWhileRevalidate: true,
})
```

### `client.fetch(query, ...args)`

One-shot fetch. Returns cached data if fresh, otherwise fetches from sources. Concurrent requests for the same cache key are deduplicated.

### `client.subscribe(query, args, callback)`

Reactive subscription. Returns cached data immediately (if available), revalidates in the background, and re-fetches when live watchers fire. Returns an unsubscribe function.

### `client.invalidate(query, ...args)`

Clears the cache entry and triggers revalidation for active subscribers.

### `client.waitForChange(query, args, predicate, options?)`

Polls sources until a predicate is satisfied or max attempts are exhausted. Useful for waiting until on-chain state reflects a recent transaction.

```ts
const updated = await client.waitForChange(
  transfersQuery,
  ['0xabc...'],
  (current, previous) => current.length > (previous?.length ?? 0),
  { interval: 3000, maxAttempts: 10 },
)
```

### `client.getSourceHealth(sourceId)`

Returns latency and failure data for a source.

```ts
client.getSourceHealth('graphql:https://indexer.example.com')
// { failures: 0, lastFailure: 0, avgLatency: 120, samples: 15 }
```

### `client.reset()`

Clears all caches, resets health tracking, and tears down active subscriptions.

## Query Definitions

A query definition is a plain object:

```ts
const transfersQuery = {
  key: (address: string) => `transfers:${address}`,
  sources: [indexed, onchain],
  strategy: 'fallback' as const, // 'fallback' | 'race'
  staleTime: 5 * 60_000,
  staleWhileRevalidate: true,
  transform: (transfers) => transfers.sort((a, b) => Number(b.block - a.block)),
}
```

## Strategies

**`fallback`** (default) — Try sources in order. Sources with 3+ consecutive failures are temporarily skipped (30s backoff).

**`race`** — Fire all sources concurrently, use the first successful result.

## Caching

**`memoryCache(maxSize?)`** — In-memory LRU cache. Default: 500 entries.

**`idbCache(dbName?)`** — IndexedDB-backed persistent cache. Handles BigInt serialization automatically.

Both implement the `Cache` interface:

```ts
interface Cache {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

## Peer Dependencies

- `viem` >= 2.0.0

## License

MIT
