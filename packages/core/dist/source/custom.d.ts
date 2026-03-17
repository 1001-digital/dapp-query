import { Source } from '../types.js';
export interface CustomSourceConfig<T> {
    /** Unique source identifier. */
    id: string;
    /** The fetch function. */
    fetch: (...args: unknown[]) => Promise<T>;
    /** Optional watcher factory. */
    watch?: (...args: unknown[]) => (onChange: () => void) => (() => void);
}
/** Creates a source from arbitrary async functions. */
export declare function customSource<T>(config: CustomSourceConfig<T>): Source<T>;
