# @1001-digital/dapp-query-vue

Vue 3 composables for [dapp-query](../../README.md).

```
npm install @1001-digital/dapp-query-vue @1001-digital/dapp-query-core
```

## Setup

Register the plugin with a `QueryClient` instance:

```ts
import { createApp } from 'vue'
import { createQueryClient, idbCache } from '@1001-digital/dapp-query-core'
import { dappQueryPlugin } from '@1001-digital/dapp-query-vue'

const queryClient = createQueryClient({
  cache: idbCache('my-app'),
})

const app = createApp(App)
app.use(dappQueryPlugin, queryClient)
```

## `useQuery`

Reactive data fetching composable. Subscribes to a query definition and automatically re-fetches when reactive arguments change.

```ts
import { useQuery } from '@1001-digital/dapp-query-vue'

const { data, pending, error, revalidating, refresh } = useQuery(
  transfersQuery,
  () => [address.value] as [string],
)
```

### Returns

| Ref | Type | Description |
|-----|------|-------------|
| `data` | `Ref<T \| undefined>` | The query result. |
| `pending` | `Ref<boolean>` | `true` only on initial load when no cached data exists. |
| `error` | `Ref<Error \| undefined>` | The latest fetch error, if any. |
| `revalidating` | `Ref<boolean>` | `true` when refreshing in the background while showing stale data. |
| `refresh()` | `() => Promise<void>` | Invalidate cache and trigger a fresh fetch. |

### Reactive arguments

The second argument is a getter that returns the query args as a tuple. When the returned values change, the composable unsubscribes from the previous query and subscribes to the new one.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useQuery } from '@1001-digital/dapp-query-vue'

const address = ref('0xabc...')
const { data, pending } = useQuery(transfersQuery, () => [address.value])
</script>
```

### Lifecycle

- Subscribes on component setup
- Re-subscribes when reactive args change (deep watch)
- Automatically unsubscribes when the component's effect scope is disposed

## `useQueryClient`

Access the injected `QueryClient` directly for imperative operations:

```ts
import { useQueryClient } from '@1001-digital/dapp-query-vue'

const client = useQueryClient()
await client.invalidate(transfersQuery, '0xabc...')
```

## Peer Dependencies

- `vue` >= 3.3.0
- `@1001-digital/dapp-query-core`

## License

MIT
