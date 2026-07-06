// Session-scoped stale-while-revalidate cache (2026-07 UI pass).
// Views render instantly from the last fetched copy while a fresh fetch runs
// in the background — kills the spinner-on-every-navigation problem without
// changing API semantics (mutating flows still call their loaders and get
// fresh data, which lands in the cache for next time).
const _mem = new Map(); // key → { data, ts }

export function cacheGet(key) {
  return _mem.get(key)?.data ?? null;
}

export function cacheSet(key, data) {
  _mem.set(key, { data, ts: Date.now() });
}

export function cacheClear(key) {
  if (key) _mem.delete(key);
  else _mem.clear();
}

/**
 * primeThenFetch(key, fetcher, apply)
 * Calls apply(cachedData, true) immediately when a cached copy exists, then
 * always fetches fresh and calls apply(freshData, false). Returns the fetch
 * promise. `apply`'s second arg tells you whether the data is stale.
 */
export function primeThenFetch(key, fetcher, apply) {
  const cached = _mem.get(key);
  if (cached) { try { apply(cached.data, true); } catch { /* view unmounted */ } }
  return fetcher().then(data => {
    cacheSet(key, data);
    apply(data, false);
    return data;
  });
}
