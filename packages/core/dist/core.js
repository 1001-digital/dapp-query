function R(c = 500) {
  const t = /* @__PURE__ */ new Map();
  function i() {
    if (t.size <= c) return;
    const e = t.keys().next().value;
    e !== void 0 && t.delete(e);
  }
  return {
    async get(e) {
      const a = t.get(e);
      return a && (t.delete(e), t.set(e, a)), a;
    },
    async set(e, a) {
      t.delete(e), t.set(e, a), i();
    },
    async delete(e) {
      t.delete(e);
    },
    async clear() {
      t.clear();
    }
  };
}
function M(c = {}) {
  const t = c.cache ?? R(), i = c.defaultStaleTime ?? 5 * 6e4, e = c.defaultStaleWhileRevalidate ?? !0, a = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map();
  function o(r) {
    let n = l.get(r);
    return n || (n = { failures: 0, lastFailure: 0, avgLatency: 0, samples: 0 }, l.set(r, n)), n;
  }
  function m(r, n) {
    const s = o(r);
    s.failures = Math.max(0, s.failures - 1), s.avgLatency = s.samples === 0 ? n : (s.avgLatency * s.samples + n) / (s.samples + 1), s.samples++;
  }
  function p(r) {
    const n = o(r);
    n.failures++, n.lastFailure = Date.now();
  }
  async function y(r, n, s) {
    return n === "race" ? T(r, s) : v(r, s);
  }
  async function v(r, n) {
    let s;
    for (const f of r) {
      const h = o(f.id);
      if (!(h.failures >= 3 && Date.now() - h.lastFailure < 3e4))
        try {
          const d = Date.now(), b = await f.fetch(...n);
          return m(f.id, Date.now() - d), b;
        } catch (d) {
          p(f.id), s = d instanceof Error ? d : new Error(String(d));
        }
    }
    throw s ?? new Error("All sources failed");
  }
  async function T(r, n) {
    const s = await Promise.allSettled(
      r.map(async (h) => {
        const d = Date.now();
        try {
          const b = await h.fetch(...n);
          return m(h.id, Date.now() - d), b;
        } catch (b) {
          throw p(h.id), b;
        }
      })
    );
    for (const h of s)
      if (h.status === "fulfilled") return h.value;
    throw s.filter((h) => h.status === "rejected").map((h) => h.reason)[0] ?? new Error("All sources failed");
  }
  function B(r, n) {
    const s = a.get(r);
    if (s) return s;
    const f = n().finally(() => {
      a.delete(r);
    });
    return a.set(r, f), f;
  }
  return {
    /** One-shot query: fetch data, using cache + sources. */
    async fetch(r, ...n) {
      const s = r.key(...n), f = r.staleTime ?? i, h = r.transform ?? ((w) => w), d = await t.get(s);
      if (d && Date.now() - d.timestamp < f)
        return d.data;
      const b = await B(s, async () => {
        const w = await y(
          r.sources,
          r.strategy ?? "fallback",
          n
        );
        return h(w);
      });
      return await t.set(s, { data: b, timestamp: Date.now() }), b;
    },
    /** Subscribe to a query — returns data reactively and revalidates on changes. */
    subscribe(r, n, s) {
      var N, k, P;
      const f = r.key(...n), h = r.staleTime ?? i, d = r.staleWhileRevalidate ?? e, b = r.transform ?? ((g) => g);
      let w = u.get(f);
      w || (w = {
        subscribers: /* @__PURE__ */ new Set(),
        result: { data: void 0, error: void 0, pending: !0, revalidating: !1 }
      }, u.set(f, w)), w.subscribers.add(s);
      function D() {
        for (const g of w.subscribers)
          g(w.result);
      }
      async function _() {
        try {
          const g = await y(
            r.sources,
            r.strategy ?? "fallback",
            n
          ), S = b(g);
          await t.set(f, { data: S, timestamp: Date.now() }), w.result = { data: S, error: void 0, pending: !1, revalidating: !1 };
        } catch (g) {
          const S = g instanceof Error ? g : new Error(String(g));
          w.result = { ...w.result, error: S, pending: !1, revalidating: !1 };
        }
        D();
      }
      if (t.get(f).then(async (g) => {
        if (g) {
          const S = Date.now() - g.timestamp >= h;
          w.result = {
            data: g.data,
            error: void 0,
            pending: !1,
            revalidating: S && d
          }, D(), S && await _();
        } else
          await _();
      }), !w.unwatch) {
        const g = ((N = r.watch) == null ? void 0 : N.call(r, ...n)) ?? ((P = (k = r.sources.find((S) => S.watch)) == null ? void 0 : k.watch) == null ? void 0 : P.call(k, ...n));
        g && (w.unwatch = g(() => {
          w.result = { ...w.result, revalidating: !0 }, D(), _();
        }));
      }
      return () => {
        var g;
        w.subscribers.delete(s), w.subscribers.size === 0 && ((g = w.unwatch) == null || g.call(w), u.delete(f));
      };
    },
    /** Invalidate cache for a key and trigger revalidation for active subscribers. */
    async invalidate(r, ...n) {
      const s = r.key(...n);
      await t.delete(s);
      const f = u.get(s);
      if (f && f.subscribers.size > 0) {
        const h = r.transform ?? ((d) => d);
        try {
          const d = await y(
            r.sources,
            r.strategy ?? "fallback",
            n
          ), b = h(d);
          await t.set(s, { data: b, timestamp: Date.now() }), f.result = { data: b, error: void 0, pending: !1, revalidating: !1 };
        } catch (d) {
          const b = d instanceof Error ? d : new Error(String(d));
          f.result = { ...f.result, error: b, pending: !1, revalidating: !1 };
        }
        for (const d of f.subscribers)
          d(f.result);
      }
    },
    /** Access to source health data (for debugging/monitoring). */
    getSourceHealth(r) {
      return l.get(r);
    },
    /** Clear all caches and reset health tracking. */
    async reset() {
      var r;
      await t.clear(), l.clear();
      for (const [, n] of u)
        (r = n.unwatch) == null || r.call(n);
      u.clear(), a.clear();
    }
  };
}
function O(c) {
  const {
    client: t,
    event: i,
    address: e,
    transform: a,
    maxBlockRange: l = 2e3,
    fromBlock: u = 0n
  } = c;
  return {
    id: `rpc:${e}:${i.name}`,
    async fetch(...o) {
      const m = await t.getBlockNumber(), p = o[0] ?? u, y = x(p, m, l), v = await Promise.all(
        y.map(
          ([T, B]) => t.getContractEvents({
            address: e,
            abi: [i],
            eventName: i.name,
            fromBlock: T,
            toBlock: B
          })
        )
      );
      return a(v.flat());
    },
    watch(...o) {
      return (m) => {
        let p = !0;
        const y = t.watchBlockNumber({
          onBlockNumber() {
            p && m();
          },
          poll: !0,
          pollingInterval: 12e3
        });
        return () => {
          p = !1, y();
        };
      };
    }
  };
}
function x(c, t, i) {
  const e = [], a = BigInt(i);
  let l = c;
  for (; l <= t; ) {
    const u = l + a - 1n > t ? t : l + a - 1n;
    e.push([l, u]), l = u + 1n;
  }
  return e;
}
function z(c) {
  const {
    endpoints: t,
    query: i,
    variables: e,
    transform: a,
    fetchFn: l = globalThis.fetch
  } = c;
  return {
    id: `graphql:${t[0] ?? "unknown"}`,
    async fetch(...u) {
      const o = e == null ? void 0 : e(...u);
      return $(t, i, o, a, l);
    }
  };
}
async function $(c, t, i, e, a = globalThis.fetch) {
  var u;
  let l;
  for (const o of c)
    try {
      const m = await a(o, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: t, variables: i })
      });
      if (!m.ok) throw new Error(`HTTP ${m.status}`);
      const p = await m.json();
      if ((u = p.errors) != null && u.length)
        throw new Error(p.errors[0].message);
      return e(p.data);
    } catch (m) {
      l = m instanceof Error ? m : new Error(String(m));
    }
  throw l ?? new Error("No GraphQL endpoints configured");
}
function C(c) {
  const {
    url: t,
    request: i,
    transform: e,
    fetchFn: a = globalThis.fetch,
    sseUrl: l
  } = c;
  return {
    id: `http:${t}`,
    async fetch(...u) {
      const o = i == null ? void 0 : i(...u);
      let m = t + ((o == null ? void 0 : o.path) ?? "");
      if (o != null && o.params) {
        const v = new URLSearchParams(o.params);
        m += "?" + v.toString();
      }
      const p = await a(m);
      if (!p.ok) throw new Error(`HTTP ${p.status}`);
      const y = await p.json();
      return e(y);
    },
    watch: l ? () => (u) => {
      const o = new EventSource(l);
      return o.addEventListener("change", () => u()), () => o.close();
    } : void 0
  };
}
function H(c) {
  return {
    id: c.id,
    fetch: c.fetch,
    watch: c.watch
  };
}
const F = "cache";
function j(c) {
  return new Promise((t, i) => {
    const e = indexedDB.open(c, 1);
    e.onupgradeneeded = () => {
      e.result.createObjectStore(F);
    }, e.onsuccess = () => t(e.result), e.onerror = () => i(e.error);
  });
}
function E(c, t, i) {
  return new Promise((e, a) => {
    const u = c.transaction(F, t).objectStore(F), o = i(u);
    o.onsuccess = () => e(o.result), o.onerror = () => a(o.error);
  });
}
function W(c = "dapp-query") {
  let t;
  function i() {
    return t || (t = j(c)), t;
  }
  return {
    async get(e) {
      const a = await i();
      return await E(a, "readonly", (u) => u.get(e));
    },
    async set(e, a) {
      const l = await i(), u = JSON.parse(JSON.stringify(a, L));
      await E(l, "readwrite", (o) => o.put(u, e));
    },
    async delete(e) {
      const a = await i();
      await E(a, "readwrite", (l) => l.delete(e));
    },
    async clear() {
      const e = await i();
      await E(e, "readwrite", (a) => a.clear());
    }
  };
}
function L(c, t) {
  return typeof t == "bigint" ? `__bigint__${t.toString()}` : t;
}
function A(c, t) {
  return typeof t == "string" && t.startsWith("__bigint__") ? BigInt(t.slice(10)) : t;
}
export {
  A as bigintReviver,
  M as createQueryClient,
  H as customSource,
  $ as graphqlFetch,
  z as graphqlSource,
  C as httpSource,
  W as idbCache,
  R as memoryCache,
  O as rpcSource
};
