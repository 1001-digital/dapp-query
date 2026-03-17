# dapp-query

Resilient data queries for decentralized frontends. Fetch on-chain data from multiple sources with automatic fallback, caching, and live updates.

```
npm install @dapp-query/core
```

## The Problem

Decentralized apps need on-chain data but the options are fragile:

- **Indexers** (Ponder, The Graph) are fast but centralized — when they go down, your app breaks
- **Direct RPC** is decentralized but slow for historical data, rate-limited, and requires manual pagination
- **Both at once** means hand-rolling fallback logic, caching, and deduplication per query

dapp-query abstracts this into a single query layer. Define your sources, and the client handles resolution, fallback, caching, and live updates.

## Quick Start

```ts
import {
  createQueryClient,
  graphqlSource,
  rpcSource,
  idbCache,
} from '@dapp-query/core'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'

// 1. Create a query client
const client = createQueryClient({
  cache: idbCache('my-app'),  // Persistent browser cache (or memoryCache())
})

// 2. Define sources
const indexed = graphqlSource({
  endpoints: ['https://indexer-1.example.com', 'https://indexer-2.example.com'],
  query: `query($collection: String!, $tokenId: BigInt!) {
    mints(where: { collection: $collection, tokenId: $tokenId }) {
      items { minter amount unitPrice block }
    }
  }`,
  variables: (collection, tokenId) => ({
    collection: (collection as string).toLowerCase(),
    tokenId: String(tokenId),
  }),
  transform: (data) => data.mints.items.map((m: any) => ({
    minter: m.minter,
    amount: BigInt(m.amount),
    price: BigInt(m.unitPrice) * BigInt(m.amount),
    block: BigInt(m.block),
  })),
})

const viemClient = createPublicClient({ chain: mainnet, transport: http() })

const onchain = rpcSource({
  client: viemClient,
  event: parseAbiItem(
    'event NewMint(uint256 indexed tokenId, uint256 unitPrice, uint256 amount, address minter)'
  ),
  address: '0x...',
  fromBlock: 18_000_000n,
  filter: (_collection, tokenId) => ({ tokenId }),
  transform: (logs) => logs.map((l: any) => ({
    minter: l.args.minter,
    amount: l.args.amount,
    price: l.args.unitPrice * l.args.amount,
    block: l.blockNumber,
  })),
})

// 3. Define a query
const mintsQuery = {
  key: (collection: string, tokenId: bigint) => `mints:${collection}:${tokenId}`,
  sources: [indexed, onchain],   // Try indexer first, fall back to RPC
  strategy: 'fallback' as const,
  staleTime: 5 * 60_000,        // Cache for 5 minutes
}

// 4. Fetch
const mints = await client.fetch(mintsQuery, '0xabc...', 42n)
```

## Concepts

### Sources

A source is anything that can fetch data. Each source returns the same domain type — the transform happens inside the source, not outside.

**`rpcSource`** — Fetch event logs directly from an RPC node. Automatically splits large block ranges into chunks to stay within provider limits.

```ts
const source = rpcSource({
  client: viemClient,
  event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
  address: '0x...',
  fromBlock: 18_000_000n,
  maxBlockRange: 2000,    // Blocks per getLogs call (default: 2000)
  transform: (logs) => logs.map(parseTransfer),
})
```

**`graphqlSource`** — Query a GraphQL indexer (Ponder, The Graph, or any GraphQL API). Supports multi-endpoint failover: if the first endpoint fails, it tries the next.

```ts
const source = graphqlSource({
  endpoints: [primaryIndexer, backupIndexer],
  query: TRANSFERS_QUERY,
  variables: (address) => ({ address }),
  transform: (data) => data.transfers.items.map(parseTransfer),
})
```

**`httpSource`** — Query a REST API. Supports live updates via Server-Sent Events.

```ts
const source = httpSource({
  url: 'https://api.example.com/transfers',
  request: (address) => ({ params: { address: address as string } }),
  transform: (data) => data.map(parseTransfer),
  sseUrl: 'https://api.example.com/transfers/stream',
})
```

**`customSource`** — Wrap any async function.

```ts
const source = customSource({
  id: 'my-source',
  fetch: async (address) => {
    const res = await fetch(`/api/transfers/${address}`)
    return res.json()
  },
})
```

### Query Client

The client orchestrates source resolution, caching, and subscriptions.

```ts
const client = createQueryClient({
  cache: idbCache('my-app'),   // or memoryCache(500)
  defaultStaleTime: 5 * 60_000,
  defaultStaleWhileRevalidate: true,
})
```

**`client.fetch(query, ...args)`** — One-shot fetch. Returns cached data if fresh, otherwise fetches from sources.

**`client.subscribe(query, args, callback)`** — Reactive subscription. Returns cached data immediately (if available), revalidates in the background, and re-fetches when live watchers fire. Returns an unsubscribe function.

**`client.invalidate(query, ...args)`** — Clears the cache entry and triggers a revalidation for any active subscribers.

### Query Definitions

A query definition is a plain object describing what to fetch and how:

```ts
const transfersQuery = {
  // Derive a cache key from the arguments
  key: (address: string) => `transfers:${address}`,

  // Sources in priority order
  sources: [indexed, onchain],

  // Resolution strategy (default: 'fallback')
  strategy: 'fallback' as const,

  // Cache TTL in ms (default: 5 minutes)
  staleTime: 5 * 60_000,

  // Show stale data while revalidating (default: true)
  staleWhileRevalidate: true,

  // Optional post-fetch transform
  transform: (transfers) => transfers.sort((a, b) => Number(b.block - a.block)),
}
```

### Strategies

**`fallback`** (default) — Try sources in order. If the first fails, try the next. Sources that have failed 3+ times in the last 30 seconds are temporarily skipped.

**`race`** — Fire all sources concurrently. Use the first successful result. Good for latency-sensitive queries where you're willing to pay for redundant requests.

### Caching

**`memoryCache(maxSize?)`** — In-memory LRU cache. Fast, no persistence. Default: 500 entries.

**`idbCache(dbName?)`** — IndexedDB-backed persistent cache. Survives page reloads. Handles BigInt serialization and deserialization automatically.

Both implement the `Cache` interface — bring your own if needed:

```ts
interface Cache {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

## Vue Integration

```
npm install @dapp-query/vue
```

### Setup

```ts
import { createApp } from 'vue'
import { createQueryClient, idbCache } from '@dapp-query/core'
import { dappQueryPlugin } from '@dapp-query/vue'

const queryClient = createQueryClient({
  cache: idbCache('my-app'),
})

const app = createApp(App)
app.use(dappQueryPlugin, queryClient)
```

### useQuery

```ts
import { useQuery } from '@dapp-query/vue'

const { data, pending, error, revalidating, refresh } = useQuery(
  transfersQuery,
  () => [address.value] as [string],  // Reactive args — re-fetches on change
)
```

Returns:
- **`data`** — `Ref<T | undefined>` — The query result.
- **`pending`** — `Ref<boolean>` — `true` only on initial load when no cached data exists.
- **`error`** — `Ref<Error | undefined>` — The latest fetch error, if any.
- **`revalidating`** — `Ref<boolean>` — `true` when refreshing in the background while showing stale data.
- **`refresh()`** — Invalidate the cache and trigger a fresh fetch.

## Source Health

The client tracks latency and failure rates per source. Sources with 3+ consecutive failures are temporarily skipped (30s backoff) in the fallback strategy. Successful fetches decay the failure count.

```ts
const health = client.getSourceHealth('graphql:https://indexer.example.com')
// { failures: 0, lastFailure: 0, avgLatency: 120, samples: 15 }
```

## How It Works

```
useQuery(transfersQuery, () => [address])
  │
  ▼
client.subscribe(query, args, callback)
  │
  ├─ Check cache ──────────────────────── Fresh? Return immediately.
  │                                       Stale? Return + revalidate in background.
  │                                       Missing? Fetch from sources.
  │
  ├─ Resolve from sources ────────────── fallback: try in order, skip unhealthy
  │   (deduplicated per cache key)        race: fire all, use first success
  │
  ├─ Transform + cache result
  │
  └─ Set up watcher (if source supports it)
       │
       └─ On change ──────────────────── Revalidate and notify subscribers
```

## License

MIT
