import { describe, it, expect, vi } from 'vitest'
import { graphqlSource } from '../src/source/graphql.js'
import { httpSource } from '../src/source/http.js'
import { customSource } from '../src/source/custom.js'

describe('graphqlSource', () => {
  it('fetches and transforms data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { items: [1, 2, 3] } }),
    })

    const source = graphqlSource({
      endpoints: ['http://indexer.test/graphql'],
      query: '{ items { id } }',
      transform: (data) => data.items,
      fetchFn: mockFetch as any,
    })

    const result = await source.fetch()
    expect(result).toEqual([1, 2, 3])
    expect(mockFetch).toHaveBeenCalledWith(
      'http://indexer.test/graphql',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('fails over to second endpoint', async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++
      if (url === 'http://bad.test/graphql') throw new Error('down')
      return {
        ok: true,
        json: async () => ({ data: { ok: true } }),
      }
    })

    const source = graphqlSource({
      endpoints: ['http://bad.test/graphql', 'http://good.test/graphql'],
      query: '{ ok }',
      transform: (data) => data.ok,
      fetchFn: mockFetch as any,
    })

    const result = await source.fetch()
    expect(result).toBe(true)
    expect(callCount).toBe(2)
  })

  it('throws if all endpoints fail', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('down'))

    const source = graphqlSource({
      endpoints: ['http://a.test', 'http://b.test'],
      query: '{ ok }',
      transform: (d) => d,
      fetchFn: mockFetch as any,
    })

    await expect(source.fetch()).rejects.toThrow('down')
  })

  it('throws on GraphQL errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, errors: [{ message: 'bad query' }] }),
    })

    const source = graphqlSource({
      endpoints: ['http://test.test'],
      query: '{ bad }',
      transform: (d) => d,
      fetchFn: mockFetch as any,
    })

    await expect(source.fetch()).rejects.toThrow('bad query')
  })
})

describe('httpSource', () => {
  it('fetches and transforms', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: 42 }),
    })

    const source = httpSource({
      url: 'http://api.test',
      transform: (data) => data.value,
      fetchFn: mockFetch as any,
    })

    const result = await source.fetch()
    expect(result).toBe(42)
  })

  it('builds URL from request params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const source = httpSource({
      url: 'http://api.test',
      request: (id: unknown) => ({ path: `/items/${id}`, params: { format: 'json' } }),
      transform: (d) => d,
      fetchFn: mockFetch as any,
    })

    await source.fetch('123')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api.test/items/123?format=json',
    )
  })
})

describe('customSource', () => {
  it('wraps an arbitrary function', async () => {
    const source = customSource({
      id: 'test',
      fetch: async (x: unknown) => (x as number) * 2,
    })

    expect(await source.fetch(21)).toBe(42)
    expect(source.id).toBe('test')
  })
})
