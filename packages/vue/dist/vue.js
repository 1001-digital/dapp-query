import { inject as g, ref as o, computed as Q, toValue as a, watch as m, onScopeDispose as w } from "vue";
const f = Symbol("dapp-query");
function A(e, t) {
  e.provide(f, t);
}
function h() {
  const e = g(f);
  if (!e) throw new Error("dapp-query: No QueryClient provided. Use app.use(dappQueryPlugin, client).");
  return e;
}
function P(e, t) {
  const c = h(), u = o(), p = o(!0), d = o(), l = o(!1);
  let n;
  function s() {
    n == null || n();
    const i = a(t);
    n = c.subscribe(e, i, (r) => {
      u.value = r.data, p.value = r.pending, d.value = r.error, l.value = r.revalidating;
    });
  }
  s();
  const y = Q(() => a(t));
  m(y, () => s(), { deep: !0 }), w(() => {
    n == null || n();
  });
  async function v() {
    const i = a(t);
    await c.invalidate(e, ...i);
  }
  return {
    data: u,
    pending: p,
    error: d,
    revalidating: l,
    refresh: v
  };
}
export {
  f as QueryClientKey,
  A as dappQueryPlugin,
  P as useQuery,
  h as useQueryClient
};
