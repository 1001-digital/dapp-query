import { Cache } from '../types.js';
/** IndexedDB-backed persistent cache. */
export declare function idbCache(dbName?: string): Cache;
/** Reviver for deserializing bigints from IndexedDB. */
export declare function bigintReviver(_key: string, value: unknown): unknown;
