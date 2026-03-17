import { PublicClient, AbiEvent } from 'viem';
import { Source } from '../types.js';
export interface RpcSourceConfig<T> {
    /** Viem public client. */
    client: PublicClient;
    /** The ABI event to query. */
    event: AbiEvent;
    /** Contract address. */
    address: `0x${string}`;
    /** Transform raw logs into domain type. */
    transform: (logs: any[]) => T;
    /** Max blocks per getLogs call. Default: 2000. */
    maxBlockRange?: number;
    /** Start block for historical queries. Default: 0. */
    fromBlock?: bigint;
    /** Map query arguments to indexed event parameter filters. */
    filter?: (...args: unknown[]) => Record<string, unknown>;
}
/**
 * Creates a source that fetches event logs directly from an RPC node.
 * Auto-chunks large block ranges to stay within RPC limits.
 */
export declare function rpcSource<T>(config: RpcSourceConfig<T>): Source<T>;
