import { Cache } from '../types.js';
/** In-memory cache with optional max size (LRU eviction). */
export declare function memoryCache(maxSize?: number): Cache;
