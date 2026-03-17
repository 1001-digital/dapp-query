import type { PublicClient, AbiEvent, GetContractEventsParameters } from 'viem'
import type { Source } from '../types.js'

export interface RpcSourceConfig<T> {
  /** Viem public client. */
  client: PublicClient
  /** The ABI event to query. */
  event: AbiEvent
  /** Contract address. */
  address: `0x${string}`
  /** Transform raw logs into domain type. */
  transform: (logs: any[]) => T
  /** Max blocks per getLogs call. Default: 2000. */
  maxBlockRange?: number
  /** Start block for historical queries. Default: 0. */
  fromBlock?: bigint
  /** Map query arguments to indexed event parameter filters. */
  filter?: (...args: unknown[]) => Record<string, unknown>
}

/**
 * Creates a source that fetches event logs directly from an RPC node.
 * Auto-chunks large block ranges to stay within RPC limits.
 */
export function rpcSource<T>(config: RpcSourceConfig<T>): Source<T> {
  const {
    client,
    event,
    address,
    transform,
    maxBlockRange = 2000,
    fromBlock: configFromBlock = 0n,
    filter,
  } = config

  return {
    id: `rpc:${address}:${event.name}`,

    async fetch(...args: unknown[]) {
      const currentBlock = await client.getBlockNumber()
      const chunks = chunkRange(configFromBlock, currentBlock, maxBlockRange)
      const filterArgs = filter?.(...args)

      const results = await Promise.all(
        chunks.map(([from, to]) =>
          client.getContractEvents({
            address,
            abi: [event],
            eventName: event.name,
            fromBlock: from,
            toBlock: to,
            args: filterArgs,
          } as GetContractEventsParameters)
        ),
      )

      return transform(results.flat())
    },

    watch(..._args: unknown[]) {
      return (onChange: () => void) => {
        let active = true

        // Poll by watching new blocks
        const unwatch = client.watchBlockNumber({
          onBlockNumber() {
            if (active) onChange()
          },
          poll: true,
          pollingInterval: 12_000,
        })

        return () => {
          active = false
          unwatch()
        }
      }
    },
  }
}

/** Split a block range into fixed-size chunks. */
function chunkRange(from: bigint, to: bigint, size: number): [bigint, bigint][] {
  const chunks: [bigint, bigint][] = []
  const sizeN = BigInt(size)
  let start = from

  while (start <= to) {
    const end = start + sizeN - 1n > to ? to : start + sizeN - 1n
    chunks.push([start, end])
    start = end + 1n
  }

  return chunks
}
