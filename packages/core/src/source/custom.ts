import type { Source } from '../types.js'

export interface CustomSourceConfig<T> {
  /** Unique source identifier. */
  id: string
  /** The fetch function. */
  fetch: (...args: unknown[]) => Promise<T>
  /** Optional watcher factory. */
  watch?: (...args: unknown[]) => (onChange: () => void) => (() => void)
}

/** Creates a source from arbitrary async functions. */
export function customSource<T>(config: CustomSourceConfig<T>): Source<T> {
  return {
    id: config.id,
    fetch: config.fetch,
    watch: config.watch,
  }
}
