import type { Cache, CacheEntry } from '../types.js'

const STORE_NAME = 'cache'

function openDB(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = fn(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** IndexedDB-backed persistent cache. */
export function idbCache(dbName: string = 'dapp-query'): Cache {
  let dbPromise: Promise<IDBDatabase> | undefined

  function getDB() {
    if (!dbPromise) dbPromise = openDB(dbName)
    return dbPromise
  }

  return {
    async get<T>(key: string) {
      const db = await getDB()
      const raw = await tx(db, 'readonly', (s) => s.get(key))
      if (raw === undefined) return undefined
      return JSON.parse(JSON.stringify(raw), bigintReviver) as CacheEntry<T>
    },

    async set<T>(key: string, entry: CacheEntry<T>) {
      const db = await getDB()
      // Serialize bigints for storage
      const serialized = JSON.parse(JSON.stringify(entry, bigintReplacer))
      await tx(db, 'readwrite', (s) => s.put(serialized, key))
    },

    async delete(key: string) {
      const db = await getDB()
      await tx(db, 'readwrite', (s) => s.delete(key))
    },

    async clear() {
      const db = await getDB()
      await tx(db, 'readwrite', (s) => s.clear())
    },
  }
}

function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `__bigint__${value.toString()}`
  return value
}

/** Reviver for deserializing bigints from IndexedDB. */
export function bigintReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('__bigint__'))
    return BigInt(value.slice(10))
  return value
}
