function x(l = 500) {
  const t = /* @__PURE__ */ new Map();
  function f() {
    if (t.size <= l) return;
    const r = t.keys().next().value;
    r !== void 0 && t.delete(r);
  }
  return {
    async get(r) {
      const o = t.get(r);
      return o && (t.delete(r), t.set(r, o)), o;
    },
    async set(r, o) {
      t.delete(r), t.set(r, o), f();
    },
    async delete(r) {
      t.delete(r);
    },
    async clear() {
      t.clear();
    }
  };
}
function L(l = {}) {
  const t = l.cache ?? x(), f = l.defaultStaleTime ?? 5 * 6e4, r = l.defaultStaleWhileRevalidate ?? !0, o = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map();
  function c(e) {
    let a = i.get(e);
    return a || (a = { failures: 0, lastFailure: 0, avgLatency: 0, samples: 0 }, i.set(e, a)), a;
  }
  function g(e, a) {
    const n = c(e);
    n.failures = Math.max(0, n.failures - 1), n.avgLatency = n.samples === 0 ? a : (n.avgLatency * n.samples + a) / (n.samples + 1), n.samples++;
  }
  function p(e) {
    const a = c(e);
    a.failures++, a.lastFailure = Date.now();
  }
  async function v(e, a, n) {
    return a === "race" ? F(e, n) : E(e, n);
  }
  async function E(e, a) {
    let n;
    for (const s of e) {
      const m = c(s.id);
      if (!(m.failures >= 3 && Date.now() - m.lastFailure < 3e4))
        try {
          const h = Date.now(), b = await s.fetch(...a);
          return g(s.id, Date.now() - h), b;
        } catch (h) {
          p(s.id), n = h instanceof Error ? h : new Error(String(h));
        }
    }
    throw n ?? new Error("All sources failed");
  }
  async function F(e, a) {
    try {
      return await Promise.any(
        e.map(async (n) => {
          const s = Date.now();
          try {
            const m = await n.fetch(...a);
            return g(n.id, Date.now() - s), m;
          } catch (m) {
            throw p(n.id), m;
          }
        })
      );
    } catch (n) {
      throw n instanceof AggregateError ? n.errors[0] ?? new Error("All sources failed") : n;
    }
  }
  function _(e, a) {
    const n = o.get(e);
    if (n) return n;
    const s = a().finally(() => {
      o.delete(e);
    });
    return o.set(e, s), s;
  }
  return {
    /** One-shot query: fetch data, using cache + sources. */
    async fetch(e, ...a) {
      const n = e.key(...a), s = e.staleTime ?? f, m = e.transform ?? ((w) => w), h = await t.get(n);
      if (h && Date.now() - h.timestamp < s)
        return h.data;
      const b = await _(n, async () => {
        const w = await v(
          e.sources,
          e.strategy ?? "fallback",
          a
        );
        return m(w);
      });
      return await t.set(n, { data: b, timestamp: Date.now() }), b;
    },
    /** Subscribe to a query — returns data reactively and revalidates on changes. */
    subscribe(e, a, n) {
      var B, S, k;
      const s = e.key(...a), m = e.staleTime ?? f, h = e.staleWhileRevalidate ?? r, b = e.transform ?? ((d) => d);
      let w = u.get(s);
      w || (w = {
        subscribers: /* @__PURE__ */ new Set(),
        result: { data: void 0, error: void 0, pending: !0, revalidating: !1 }
      }, u.set(s, w)), w.subscribers.add(n);
      function D() {
        for (const d of w.subscribers)
          d(w.result);
      }
      async function T() {
        try {
          const d = await v(
            e.sources,
            e.strategy ?? "fallback",
            a
          ), y = b(d);
          await t.set(s, { data: y, timestamp: Date.now() }), w.result = { data: y, error: void 0, pending: !1, revalidating: !1 };
        } catch (d) {
          const y = d instanceof Error ? d : new Error(String(d));
          w.result = { ...w.result, error: y, pending: !1, revalidating: !1 };
        }
        D();
      }
      if (t.get(s).then(async (d) => {
        if (d) {
          const y = Date.now() - d.timestamp >= m;
          w.result = {
            data: d.data,
            error: void 0,
            pending: !1,
            revalidating: y && h
          }, D(), y && await T();
        } else
          await T();
      }), !w.unwatch) {
        const d = ((B = e.watch) == null ? void 0 : B.call(e, ...a)) ?? ((k = (S = e.sources.find((y) => y.watch)) == null ? void 0 : S.watch) == null ? void 0 : k.call(S, ...a));
        d && (w.unwatch = d(() => {
          w.result = { ...w.result, revalidating: !0 }, D(), T();
        }));
      }
      return () => {
        var d;
        w.subscribers.delete(n), w.subscribers.size === 0 && ((d = w.unwatch) == null || d.call(w), u.delete(s));
      };
    },
    /** Invalidate cache for a key and trigger revalidation for active subscribers. */
    async invalidate(e, ...a) {
      const n = e.key(...a);
      await t.delete(n);
      const s = u.get(n);
      if (s && s.subscribers.size > 0) {
        const m = e.transform ?? ((h) => h);
        try {
          const h = await v(
            e.sources,
            e.strategy ?? "fallback",
            a
          ), b = m(h);
          await t.set(n, { data: b, timestamp: Date.now() }), s.result = { data: b, error: void 0, pending: !1, revalidating: !1 };
        } catch (h) {
          const b = h instanceof Error ? h : new Error(String(h));
          s.result = { ...s.result, error: b, pending: !1, revalidating: !1 };
        }
        for (const h of s.subscribers)
          h(s.result);
      }
    },
    /** Access to source health data (for debugging/monitoring). */
    getSourceHealth(e) {
      return i.get(e);
    },
    /**
     * Poll sources until a predicate is satisfied or max attempts are exhausted.
     * Useful for waiting until on-chain state reflects a recent transaction.
     */
    async waitForChange(e, a, n, s) {
      const m = e.key(...a), h = e.transform ?? ((k) => k), b = (s == null ? void 0 : s.interval) ?? 3e3, w = (s == null ? void 0 : s.maxAttempts) ?? 10;
      async function D(k) {
        await t.set(m, { data: k, timestamp: Date.now() });
        const d = u.get(m);
        if (d) {
          d.result = { data: k, error: void 0, pending: !1, revalidating: !1 };
          for (const y of d.subscribers)
            y(d.result);
        }
      }
      const T = await t.get(m), B = T == null ? void 0 : T.data;
      let S;
      for (let k = 0; k < w; k++) {
        k > 0 && await new Promise((y) => setTimeout(y, b));
        const d = await v(
          e.sources,
          e.strategy ?? "fallback",
          a
        );
        if (S = h(d), n(S, B))
          return await D(S), S;
      }
      S !== void 0 && await D(S);
    },
    /** Clear all caches and reset health tracking. */
    async reset() {
      var e;
      await t.clear(), i.clear();
      for (const [, a] of u)
        (e = a.unwatch) == null || e.call(a);
      u.clear(), o.clear();
    }
  };
}
function M(l) {
  const {
    client: t,
    event: f,
    address: r,
    transform: o,
    maxBlockRange: i = 2e3,
    fromBlock: u = 0n,
    filter: c
  } = l;
  return {
    id: `rpc:${r}:${f.name}`,
    async fetch(...g) {
      const p = await t.getBlockNumber(), v = R(u, p, i), E = c == null ? void 0 : c(...g), F = await Promise.all(
        v.map(
          ([_, e]) => t.getContractEvents({
            address: r,
            abi: [f],
            eventName: f.name,
            fromBlock: _,
            toBlock: e,
            args: E
          })
        )
      );
      return o(F.flat());
    },
    watch(...g) {
      return (p) => {
        let v = !0;
        const E = t.watchBlockNumber({
          onBlockNumber() {
            v && p();
          },
          poll: !0,
          pollingInterval: 12e3
        });
        return () => {
          v = !1, E();
        };
      };
    }
  };
}
function R(l, t, f) {
  const r = [], o = BigInt(f);
  let i = l;
  for (; i <= t; ) {
    const u = i + o - 1n > t ? t : i + o - 1n;
    r.push([i, u]), i = u + 1n;
  }
  return r;
}
function j(l) {
  const {
    endpoints: t,
    query: f,
    variables: r,
    transform: o,
    fetchFn: i = globalThis.fetch
  } = l;
  return {
    id: `graphql:${t[0] ?? "unknown"}`,
    async fetch(...u) {
      const c = r == null ? void 0 : r(...u);
      return A(t, f, c, o, i);
    }
  };
}
async function A(l, t, f, r, o = globalThis.fetch) {
  var u;
  let i;
  for (const c of l)
    try {
      const g = await o(c, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: t, variables: f })
      });
      if (!g.ok) throw new Error(`HTTP ${g.status}`);
      const p = await g.json();
      if ((u = p.errors) != null && u.length)
        throw new Error(p.errors[0].message);
      return r(p.data);
    } catch (g) {
      i = g instanceof Error ? g : new Error(String(g));
    }
  throw i ?? new Error("No GraphQL endpoints configured");
}
function z(l) {
  const {
    url: t,
    request: f,
    transform: r,
    fetchFn: o = globalThis.fetch,
    sseUrl: i
  } = l;
  return {
    id: `http:${t}`,
    async fetch(...u) {
      const c = f == null ? void 0 : f(...u);
      let g = t + ((c == null ? void 0 : c.path) ?? "");
      if (c != null && c.params) {
        const E = new URLSearchParams(c.params);
        g += "?" + E.toString();
      }
      const p = await o(g);
      if (!p.ok) throw new Error(`HTTP ${p.status}`);
      const v = await p.json();
      return r(v);
    },
    watch: i ? () => (u) => {
      const c = new EventSource(i);
      return c.addEventListener("change", () => u()), () => c.close();
    } : void 0
  };
}
function J(l) {
  return {
    id: l.id,
    fetch: l.fetch,
    watch: l.watch
  };
}
const P = "cache";
function O(l) {
  return new Promise((t, f) => {
    const r = indexedDB.open(l, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(P);
    }, r.onsuccess = () => t(r.result), r.onerror = () => f(r.error);
  });
}
function N(l, t, f) {
  return new Promise((r, o) => {
    const u = l.transaction(P, t).objectStore(P), c = f(u);
    c.onsuccess = () => r(c.result), c.onerror = () => o(c.error);
  });
}
function H(l = "dapp-query") {
  let t;
  function f() {
    return t || (t = O(l)), t;
  }
  return {
    async get(r) {
      const o = await f(), i = await N(o, "readonly", (u) => u.get(r));
      if (i !== void 0)
        return JSON.parse(JSON.stringify(i), $);
    },
    async set(r, o) {
      const i = await f(), u = JSON.parse(JSON.stringify(o, C));
      await N(i, "readwrite", (c) => c.put(u, r));
    },
    async delete(r) {
      const o = await f();
      await N(o, "readwrite", (i) => i.delete(r));
    },
    async clear() {
      const r = await f();
      await N(r, "readwrite", (o) => o.clear());
    }
  };
}
function C(l, t) {
  return typeof t == "bigint" ? `__bigint__${t.toString()}` : t;
}
function $(l, t) {
  return typeof t == "string" && t.startsWith("__bigint__") ? BigInt(t.slice(10)) : t;
}
export {
  $ as bigintReviver,
  L as createQueryClient,
  J as customSource,
  A as graphqlFetch,
  j as graphqlSource,
  z as httpSource,
  H as idbCache,
  x as memoryCache,
  M as rpcSource
};
