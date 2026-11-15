'use strict';
// ---------- storage: the one place the app reads and writes its data ----------
// Pages never touch a database. They call Store.get / set / list / remove with keys like "model" or "stmts/<id>".
// Two backends with the same four calls:
//   local     the iPad's own browser database (IndexedDB). Default.
//   supabase  a table in your Supabase project (see README). Chosen when config.js has a url and an anonKey.
// To add another backend, write an object with init, get, set, list, remove and pick it in Store below.
const Store = (() => {
  const CFG = (typeof window !== 'undefined' && window.LEDGER_CONFIG) || {};
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  // ---- local: IndexedDB, one object store "kv" holding { key, value } ----
  const local = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('ledger', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv', { keyPath: 'key' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode); const s = t.objectStore('kv'); let out; Promise.resolve(fn(s, (v) => { out = v; })).catch(rej); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
    const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return {
      name: 'local',
      async init() { await open(); try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* not offered */ } return { ok: true }; },
      get: (key) => tx('readonly', async (s, out) => { const r = await req(s.get(key)); out(r ? r.value : null); }),
      set: (key, value) => tx('readwrite', (s) => { s.put({ key, value: clone(value) }); }),
      remove: (key) => tx('readwrite', (s) => { s.delete(key); }),
      list: (prefix) => tx('readonly', async (s, out) => { const all = await req(s.getAll()); out(all.filter((x) => !prefix || x.key.startsWith(prefix)).map((x) => ({ key: x.key, value: x.value }))); }),
    };
  })();

  // ---- supabase: table ledger_kv (user_id, key, value jsonb, updated_at), one row per key, rows visible only to their owner ----
  const supa = (() => {
    let sb = null, uid = null; const T = 'ledger_kv';
    const fail = (e) => { const x = new Error((e && e.message) || 'storage error'); x.code = 'unavailable'; throw x; };
    return {
      name: 'supabase',
      // returns { ok: true } when signed in, or { signIn: fn(email, password) } for the sign-in screen
      async init() {
        if (!window.supabase) await new Promise((res) => { const el = document.createElement('script'); el.src = 'vendor/supabase.js'; el.onload = res; el.onerror = res; document.head.appendChild(el); });
        if (!window.supabase) return { error: 'vendor/supabase.js did not load' };
        sb = sb || window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
        const { data } = await sb.auth.getSession(); uid = data && data.session ? data.session.user.id : null;
        if (uid) return { ok: true };
        return { signIn: async (email, password) => { const { data: d, error } = await sb.auth.signInWithPassword({ email, password }); if (error) return error.message; uid = d.user.id; return null; } };
      },
      async signOut() { if (sb) await sb.auth.signOut(); uid = null; },
      async get(key) { const { data, error } = await sb.from(T).select('value').eq('user_id', uid).eq('key', key).maybeSingle(); if (error) fail(error); return data ? data.value : null; },
      async set(key, value) { const { error } = await sb.from(T).upsert({ user_id: uid, key, value: clone(value), updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }); if (error) fail(error); },
      async remove(key) { const { error } = await sb.from(T).delete().eq('user_id', uid).eq('key', key); if (error) fail(error); },
      async list(prefix) {
        const out = []; let from = 0; const step = 1000;
        for (;;) { let q = sb.from(T).select('key,value').eq('user_id', uid).order('key').range(from, from + step - 1); if (prefix) q = q.like('key', prefix.replace(/[%_]/g, '\\$&') + '%');
          const { data, error } = await q; if (error) fail(error); out.push(...data); if (data.length < step) break; from += step; }
        return out;
      },
    };
  })();

  const B = CFG.url && CFG.anonKey ? supa : local;
  return { backend: B.name, init: () => B.init(), get: (k) => B.get(k), set: (k, v) => B.set(k, v), list: (p) => B.list(p), remove: (k) => B.remove(k), signOut: () => (B.signOut ? B.signOut() : null) };
})();
