'use strict';
  const C = window.Core, M = window.Model;
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // French display: 1 234,56 € (narrow no-break space between thousands, no-break space before the sign); negatives carry a minus sign
  const frNum = (n, dec, max) => n.toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: max == null ? (dec || 0) : max });
  // money everywhere: #,###;(#,###);-  (whole euros, negatives in brackets, zero as a dash)
  const eur = (v) => {
    if (v == null || isNaN(v)) return '–';
    const r = Math.round(v); if (r === 0) return '–';
    const s = frNum(Math.abs(r), 0) + ' €';
    return r < 0 ? `(${s})` : s;
  };
  const eurT = (v) => (Math.round(v) === 0 ? '0 €' : eur(v)); // zero as 0 € in sentences; tables keep the dash
  const eurSigned = (v) => (Math.round(v) > 0 ? '+' : '') + eur(v);
  // lists of payments: plain amounts, inflows marked with +
  const eurL = (v, dec) => (v > 0 ? '+' + eur(v, dec) : eur(Math.abs(v), dec));
  const usd = (v) => (+v || 0) < 0 ? '−' + frNum(-(+v), 2) + '\u00a0$' : frNum(+v || 0, 2) + '\u00a0$';
  const compact = (v) => { const a = Math.abs(v); const w = (x) => (v < 0 ? `(${x})` : x); if (Math.round(a) === 0) return '0'; if (a >= 1e6) return w((a / 1e6).toFixed(1).replace(/\.0$/, '') + ' M€'); if (a >= 1e4) return w(Math.round(a / 1e3) + ' k€'); return w(frNum(Math.round(a), 0) + ' €'); };
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDate = C.fmtDate;
  const ML = C.monthLabel;
  const uid8 = () => Math.random().toString(36).slice(2, 10);

  // ---------- icons ----------
  const ICON = {
    doc: 'M7 3h7l5 5v13H7z M14 3v5h5', pen: 'M4 20l4-1 11-11-3-3L5 16z', alert: 'M12 4l9 16H3z M12 10v4 M12 17v.5', check: 'M5 12.5l4.5 4.5L19 7.5',
    tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01', up: 'M4 17l6-6 4 4 6-7 M14 8h6v6', save: 'M12 3v12 M7 10l5 5 5-5 M5 21h14', card: 'M3 6h18v12H3z M3 10h18',
    repeat: 'M17 2l3 3-3 3 M4 11V9a4 4 0 0 1 4-4h12 M7 22l-3-3 3-3 M20 13v2a4 4 0 0 1-4 4H4', big: 'M12 3v18 M16 7.5C15 6 13.6 5.5 12 5.5c-2.2 0-3.8 1.1-3.8 2.8 0 4 7.8 2.3 7.8 6.6 0 1.8-1.7 3.1-4 3.1-1.8 0-3.3-.7-4.2-2',
    person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0', family: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M2 20a6 6 0 0 1 12 0 M14.5 20a4 4 0 0 1 7.5 0',
    arrow: 'M4 12h15 M13 6l6 6-6 6',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 7.5v.01',
    overview: 'M4 13h6V4H4z M14 20h6v-9h-6z M4 20h6v-3H4z M14 7h6V4h-6z', months: 'M4 6h16 M4 12h16 M4 18h10', plan: 'M3 16l5-5 4 4 9-9 M3 21h18',
    outlook: 'M5 20V12 M10 20V7 M15 20v-6 M20 20V4', tax: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3', import: 'M12 4v11 M7 10l5 5 5-5 M4 20h16', setup: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 4v6 M10 14v6',
    x: 'M6 6l12 12 M18 6L6 18', plus: 'M12 5v14 M5 12h14', cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z', device: 'M7 3h10v18H7z M11 18h2',
  };
  const icon = (k, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k] || ''}"/></svg>`;
  Object.assign(ICON, {
    now: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2', copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
    report: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h4', cash: 'M3 7h18v10H3z M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M6 10v4 M18 10v4',
    worth: 'M4 20h16 M6 20V10 M10 20V6 M14 20v-8 M18 20V4', forecast: 'M3 17l5-6 4 3 8-9 M14 5h6v6', close: 'M5 12.5l4.5 4.5L19 7.5 M4 4h16v16H4z',
    flag: 'M5 21V4 M5 4h11l-2 4 2 4H5', chevD: 'M6 9l6 6 6-6', chevR: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6',
  });
  ICON.assump = ICON.setup; Object.assign(ICON, { cash: 'M4 4v16h16 M8 14l3-3 3 2 4-5', hold: 'M12 3a9 9 0 1 0 9 9 M12 3v9h9 M15 3.5A9 9 0 0 1 20.5 9H15z', setup: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1' });
  // seven pages in six places. Older page names (hashes, links, handlers) still work: they redirect to the page that now holds them, at the section that holds them.
  const VIEWS = [['report', 'Month'], ['time', 'Over time'], ['worth', 'Wealth'], ['assume', 'Assumptions'], ['update', 'Update'], ['setup', 'Settings']];
  const ALIAS = { now: ['report', null], bills: ['report', 'steer'], lines: ['report', 'transactions'], cash: ['time', 'sec-chart'], forecast: ['time', 'sec-chart'], 'plan-years': ['time', 'sec-table'], 'plan-inputs': ['assume', null], hold: ['worth', null], holdings: ['worth', null], close: ['update', 'closelist'] };
  const resolveView = (h) => { const k = String(h || '').replace(/^#/, ''); if (k === 'now' || k === 'bills') ui.month = null; /* Today is Month on the current cycle */ if (VIEWS.some(([v]) => v === k)) return { view: k, sect: null }; return ALIAS[k] ? { view: ALIAS[k][0], sect: ALIAS[k][1] } : null; };
  const BL = Object.fromEntries(M.BUCKETS);
  const TIERS = [['cash', 'Cash'], ['savings', 'Savings'], ['invest', 'Invested'], ['locked', 'Locked (PEE, PERCOL)'], ['other', 'Other assets'], ['receivable', 'Owed to you (not in net worth)']];

  // ---------- state ----------
  let S = { cfg: M.defaults(), rules: { list: [] }, overrides: { map: {}, oneoff: {}, reviewed: {} }, stmts: {}, snapshots: { points: {} }, live: {}, tax: {} };
  let D = null;
  const ui = { dOpen: {}, lastDelta: null, view: 'report', qcat: 'Groceries', fresh: null, month: null, cat: null, bucket: null, q: '', onlyTodo: false, pending: [], csv: null, armed: null, ruleOffer: null, expand: {}, norm: true, busy: null };

  // ---------- persistence: every read and write goes through Store (storage.js); the pages only see S ----------
  // keys: model, rules, overrides, snapshots, tax, model-backup-2026-11b, stmts/<id>, live/<id> (see README)
  let sync = 'starting'; const dirty = {}, writing = {}, timers = {};
  const ONLINE = () => Store.backend !== 'local';
  function saveLocal() { /* each change is written by persist, writeStmt or writeLive */ }
  function setSync(x) { const prev = sync; sync = x; ['sync', 'sync-side'].forEach((id) => { const el = document.getElementById(id); if (el) el.outerHTML = syncPill(id === 'sync-side'); }); if (x !== prev && x === 'error') toast('Last save failed'); }
  function syncPill(side) {
    const here = ONLINE() ? ['good', 'cloud', 'Saved to your account'] : ['good', 'device', 'Saved on this iPad'];
    const map = { starting: ['muted', 'device', 'Opening…'], signin: ['warn', 'cloud', 'Sign in to open your data'], saved: here, saving: ['muted', here[1], 'Saving…'], error: ['bad', 'alert', 'Last save failed'] };
    const [k, ic, t] = map[sync] || here;
    return `<span id="${side ? 'sync-side' : 'sync'}" class="pill pill-${k}${side ? ' side-sync' : ''}" role="status" aria-label="${esc(t)}" title="${esc(t)}">${icon(ic)}<span class="pill-t">${esc(t)}</span></span>`;
  }
  const BODY = { model: () => S.cfg, rules: () => S.rules, overrides: () => S.overrides, snapshots: () => S.snapshots, tax: () => S.tax };
  // nothing is written before the saved data has loaded, so an empty start can never overwrite it
  let loaded = false;
  function persist(name) {
    const b = BODY[name] && BODY[name](); if (b) b._at = Date.now();
    dirty[name] = true; if (!loaded) return; clearTimeout(timers[name]); timers[name] = setTimeout(() => flush(name), 400);
  }
  async function flush(name) {
    if (writing[name]) { timers[name] = setTimeout(() => flush(name), 300); return; }
    writing[name] = true; dirty[name] = false; setSync('saving');
    try { await Store.set(name, BODY[name]()); setSync('saved'); } catch (e) { dirty[name] = true; setSync('error'); }
    writing[name] = false;
  }
  async function storeDo(fn) { if (!loaded) return false; setSync('saving'); try { await fn(); setSync('saved'); return true; } catch (e) { setSync('error'); return false; } }
  const writeStmt = (st) => storeDo(() => Store.set(`stmts/${st.id}`, st));
  // quick entries (typed here or from the Apple Pay log): one record each
  async function writeLive(e) { const { _q, ...doc } = e; if (await storeDo(() => Store.set(`live/${e.id}`, doc))) delete e._q; }
  const deleteLive = (id) => storeDo(() => Store.remove(`live/${id}`));
  const deleteStmt = (id) => storeDo(() => Store.remove(`stmts/${id}`));
  // the whole state from the store; the first time, from what this browser held before (ledger.v3, ledger.v1)
  async function loadAll() {
    const queued = Object.values(S.live || {}).filter((e) => e._q); const keepQ = async () => { for (const e of queued) { S.live[e.id] = e; await writeLive(e); } };
    const rows = await Store.list(''); const kv = {}; rows.forEach((r) => { kv[r.key] = r.value; });
    const has = Object.keys(kv).length;
    if (!has) {
      let old = null; try { old = JSON.parse(localStorage.getItem('ledger.v3') || 'null'); } catch (e) { old = null; }
      let leg = null; try { leg = JSON.parse(localStorage.getItem('ledger.v1') || 'null'); } catch (e) { leg = null; }
      if (old && old.cfg) S = { cfg: M.mergeConfig(old.cfg), rules: old.rules || { list: [] }, overrides: { map: {}, oneoff: {}, reviewed: {}, ...(old.overrides || {}) }, stmts: old.stmts || {}, snapshots: old.snapshots || { points: {} }, live: old.live || {}, tax: old.tax || {} };
      else if (leg && leg.settings) S = { cfg: M.fromPrevious(leg.settings), rules: leg.rules || { list: [] }, overrides: { map: {}, oneoff: {}, reviewed: {}, ...(leg.overrides || {}) }, stmts: leg.stmts || {}, snapshots: leg.snapshots || { points: {} }, live: {}, tax: {} };
      loaded = true; if (old || leg) { Object.keys(BODY).forEach(persist); for (const st of Object.values(S.stmts)) await writeStmt(st); for (const e of Object.values(S.live)) await writeLive(e); }
      await keepQ(); fixNames(); return;
    }
    const m = kv.model; const stmts = {}, live = {};
    Object.entries(kv).forEach(([k, v]) => { if (k.startsWith('stmts/') && v && v.id) stmts[v.id] = v; else if (k.startsWith('live/') && v && v.id) live[v.id] = v; });
    // a model saved before the plan lines existed is converted once (M.migrate); the old one is copied once to model-backup-2026-11b
    const migrated = !(m && m.assume && m.v >= M.A_VERSION); if (migrated && m && Object.keys(m).length && !kv['model-backup-2026-11b']) await Store.set('model-backup-2026-11b', m);
    S = { cfg: m ? M.mergeConfig(m) : M.defaults(), rules: { list: Array.isArray((kv.rules || {}).list) ? kv.rules.list : [], _at: (kv.rules || {})._at }, overrides: { map: {}, oneoff: {}, reviewed: {}, ...(kv.overrides || {}) },
      snapshots: { points: {}, ...(kv.snapshots || {}) }, tax: kv.tax || {}, stmts, live };
    // €0 entries came from a shortcut that sent no amount: clear them
    for (const e of Object.values(S.live).filter((x) => !x.amt)) { delete S.live[e.id]; await Store.remove(`live/${e.id}`); }
    loaded = true; await keepQ(); const fixes = fixNames(); if (migrated && !fixes.includes('model')) fixes.push('model'); fixes.forEach((n) => persist(n));
  }
  async function connect() {
    let r; try { r = await Store.init(); } catch (e) { r = { error: e && e.message }; }
    if (r && r.signIn) { ui.signIn = r.signIn; setSync('signin'); render(); return; }
    if (!r || !r.ok) { setSync('error'); render(); return; }
    try { await loadAll(); } catch (e) { console.error(e); setSync('error'); render(); return; }
    setSync('saved'); D = null; render();
  }
  // ONLINE only: coming back to the app reloads what another device saved, unless a change here is still waiting
  document.addEventListener('visibilitychange', async () => {
    if (!ONLINE() || !loaded || document.visibilityState !== 'visible' || Object.values(dirty).some(Boolean) || Object.values(writing).some(Boolean)) return;
    const before = JSON.stringify(S); try { await loadAll(); } catch (e) { return; } if (JSON.stringify(S) !== before) changed();
  });

  // categories renamed since the data was saved: carry rules, manual choices and bucket choices over
  function fixNames() {
    const RN = M.RENAMED; const done = new Set();
    S.cfg.seen = S.cfg.seen || {};
    if (!S.cfg.pay) { S.cfg.pay = M.defaultPay(); if (S.cfg.payslip && S.cfg.payslip.rate) S.cfg.pay.pas = S.cfg.payslip.rate; done.add('model'); }
    for (const [id, c] of Object.entries(S.overrides.map || {})) if (RN[c]) { S.overrides.map[id] = RN[c]; done.add('overrides'); }
    (S.rules.list || []).forEach((r) => { if (RN[r[1]]) { r[1] = RN[r[1]]; done.add('rules'); } });
    const bm = S.cfg.bucketMap || {}; for (const k of Object.keys(bm)) if (RN[k]) { if (!bm[RN[k]]) bm[RN[k]] = bm[k]; delete bm[k]; done.add('model'); }
    ((S.cfg.assume || {}).lines || []).forEach((l) => { if (RN[l.cat]) { l.cat = RN[l.cat]; done.add('model'); } }); const ac = (S.cfg.assume || {}).costs || {}; for (const k of Object.keys(ac)) if (RN[k]) { if (!ac[RN[k]]) ac[RN[k]] = ac[k]; delete ac[k]; done.add('model'); }
    return [...done];
  }

  // ---------- derived numbers ----------
  const acct = (k) => S.cfg.accounts.find((a) => a.key === k) || { balance: 0, name: k };
  const monthlyEq = (e) => (e.every === 'month' ? 1 : e.every === 'once' ? 0 : (e.months && e.months.length ? e.months.length : 1)) * (+e.amount || 0) / (e.every === 'month' ? 1 : 12);
  const liveAcct = (e) => (/revolut/i.test(e.card || '') ? 'REV' : /trade/i.test(e.card || '') ? 'TR' : 'SG');
  const liveCat = (e) => (S.overrides.map && S.overrides.map[e.id]) || e.cat;
  const isFlexCat = (c) => FLEX.includes(c) || VIA.includes(c) || c === 'To classify';
  // split live entries: covered by statement lines (or by a closed month) versus still standing in for the open month
  function liveSplit(txs0, isDone, sgTo) {
    const cutoff = S.cfg.cutoff; const open = [], covered = [], inject = []; const used = new Set();
    const byM = {}; txs0.forEach((t) => { (byM[t.month] = byM[t.month] || []).push(t); });
    Object.values(S.live || {}).sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
      const mk = C.budgetMonth(e.date, cutoff); const acct = liveAcct(e);
      let cov = isDone(mk);
      if (!cov) { const m = (byM[mk] || []).find((t) => !used.has(t.id) && Math.abs(t.amt - e.amt) < 0.011 && Math.abs(daysBetween(t.date, e.date)) <= 5); if (m) { used.add(m.id); cov = true; } }
      if (!cov && acct === 'SG' && sgTo && e.date <= sgTo) cov = true;
      if (cov) { covered.push(e); return; }
      open.push(e);
      inject.push({ id: e.id, date: e.date, vdate: e.date, month: mk, desc: (e.merchant || e.card || 'Apple Pay').toUpperCase(), det: [], amt: e.amt, cat: liveCat(e), acct, live: true });
    });
    return { open, covered, inject };
  }
  function derive() {
    if (typeof refreshRows === 'function') refreshRows();
    const cfg = S.cfg; const today = todayISO();
    C.setBucket6(cfg.bucket6);
    const txs0 = C.allTransactions({ stmts: S.stmts, settings: { cutoff: cfg.cutoff }, rules: S.rules, overrides: S.overrides });
    const sgTo = Object.values(S.stmts).filter((x) => String(x.account).startsWith('SG') && x.role !== 'savings').map((x) => x.to).sort().pop();
    const isDone = (k) => sgTo && C.monthRange(k, cfg.cutoff).to <= sgTo;
    // Apple Pay and hand-added entries stand in for the open month until its statements arrive; closed months use statements only
    const live = liveSplit(txs0, isDone, sgTo);
    // a top-up from SG to your own Revolut or Trade Republic is a move between your accounts once that account's own
    // lines are imported for the month: its purchases count instead. Set it here so every view reads the same category.
    const TOPUP = { 'Spent via Revolut': 'REV', 'Spent via Trade Republic': 'TR' }; const itemM = {};
    txs0.forEach((t) => { if (!String(t.acct).startsWith('SG')) (itemM[t.month] = itemM[t.month] || new Set()).add(t.acct); });
    // only when the money is seen arriving there (same amount within 5 days); a top-up that never arrives stays spending and is flagged
    const credits = {}; txs0.forEach((t) => { if (!String(t.acct).startsWith('SG') && t.amt > 0) (credits[t.acct] = credits[t.acct] || []).push(t); }); const usedC = new Set();
    const arrived = (t) => { const c = (credits[TOPUP[t.cat]] || []).find((u) => !usedC.has(u.id) && Math.abs(u.amt + t.amt) < 0.011 && Math.abs(daysBetween(t.date, u.date)) <= 5); if (c) usedC.add(c.id); return !!c; };
    // a transfer to one of your current accounts that has no statements here (Fortuneo) stays in your cash
    const OWN_BIC = [[/CHEZ:\s*FTNOFRP/i, 'fo']]; const ownTo = (t) => { if (t.amt >= 0 || !String(t.acct).startsWith('SG') || t.cat !== 'Between my accounts') return null; const s = `${t.desc} ${(t.det || []).join(' ')}`; const m = OWN_BIC.find(([re]) => re.test(s)); return m && cfg.accounts.some((a) => a.key === m[1] && a.tier === 'cash') ? m[1] : null; };
    const txs = txs0.map((t) => (TOPUP[t.cat] && t.amt < 0 && itemM[t.month] && itemM[t.month].has(TOPUP[t.cat]) ? (arrived(t) ? { ...t, cat: 'Between my accounts', topup: t.cat } : { ...t, unmatched: TOPUP[t.cat] }) : ownTo(t) ? { ...t, toOwn: ownTo(t) } : t)).concat(live.inject);
    const keys = [...new Set(txs.map((t) => t.month))].sort();
    const complete = keys.filter(isDone);
    const refs = M.salaryRefs(txs, keys);
    const pl = {}; keys.forEach((k) => { pl[k] = M.monthPL(txs, k, cfg, S.overrides.oneoff, refs[k]); });
    const lastKey = complete[complete.length - 1] || keys[keys.length - 1] || C.budgetMonth(today, cfg.cutoff);
    const rr = M.runRate(complete.slice(-cfg.runMonths).map((k) => pl[k]), cfg, []);
    holdSync(); usdSync();
    const bal = {}; cfg.accounts.forEach((a) => { bal[a.key] = +a.balance || 0; });
    const tiers = {}; TIERS.forEach(([t]) => { tiers[t] = C.sum(cfg.accounts.filter((a) => a.tier === t), (a) => +a.balance || 0); });
    const nw = C.sum(cfg.accounts.filter((a) => a.tier !== 'receivable'), (a) => +a.balance || 0);
    const spendT = { essentials: cfg.targets.essentials * cfg.netPay, lifestyle: cfg.targets.lifestyle * cfg.netPay, family: 0 };
    const spend = cfg.basis === 'custom' && cfg.spendOverride ? { essentials: +cfg.spendOverride.essentials || 0, lifestyle: +cfg.spendOverride.lifestyle || 0, family: 0 } : cfg.basis === 'targets' ? spendT : rr.plan;
    const [ty, tm] = today.split('-').map(Number); const start = C.addMonths(`${ty}-${pad(tm)}`, 1);
    const snaps = Object.entries((S.snapshots || {}).points || {}).sort((a, b) => a[0].localeCompare(b[0]));
    const bonusLTM = C.sum(complete.slice(-12), (k) => pl[k].bonus || 0);
    const pa = cfg.paul; const paulTx = pa ? txs.filter((t) => t.cat === 'Paid for Paul' && t.date > (pa.asOf || '')) : [];
    const paul = pa ? { base: +pa.base || 0, owed: C.paulOwed(pa.base, pa.asOf, txs), asOf: pa.asOf, sent: -C.sum(paulTx.filter((t) => t.amt < 0), (t) => t.amt), back: C.sum(paulTx.filter((t) => t.amt > 0), (t) => t.amt) } : null;
    // net pay and bonus follow from the gross figures
    const payC = cfg.pay ? M.payCalc(cfg.pay) : null;
    if (payC) cfg.netPay = payC.net;
    D = { live, payC, today, txs, keys, complete, sgTo, pl, refs, lastKey, rr, bal, tiers, nw, spend, spendT, start, snaps, bonusLTM, paul, history: C.savingsHistory(S, txs) };
    D.close = closeInfo();
    D.now = nowInfo();
    autoSnap();
  }
  // When a month closes, its balances are recorded by themselves from the statements: current account and Livret A at the period's end, marked as estimated.
  // They go in snapshots.auto, never over a check-in you made yourself (snapshots.points).
  function autoSnap() {
    const sn = S.snapshots; if (!sn || !D.history) return; const pts = sn.points || {}, auto = sn.auto = sn.auto || {}; let added = 0;
    D.complete.forEach((k) => { const to = C.monthRange(k, S.cfg.cutoff).to; if (pts[to] || auto[to]) return; const h = D.history.find((x) => x.date === to); if (!h) return; auto[to] = { sg: h.sg, ...(h.la != null ? { la: h.la } : {}), est: true }; added++; });
    if (added) persist('snapshots');
  }
  function changed() { saveLocal(); D = null; render(); }

  // ---------- charts ----------
  function niceTicks(min, max, n) {
    if (max === min) max = min + 1;
    const raw = (max - min) / (n || 4); const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || 10 * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step; const t = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v * 100) / 100);
    return t;
  }
  function legend(items) { return `<div class="legend">${items.map((it) => `<span class="lg"><i class="${it.line ? 'lg-line' : it.dot ? 'lg-dot' : 'lg-box'}" style="background:${it.dash ? `repeating-linear-gradient(90deg,${it.color} 0 4px,transparent 4px 7px)` : it.dots ? `repeating-linear-gradient(90deg,${it.color} 0 2px,transparent 2px 5px)` : it.color};${it.faint ? 'opacity:.5;' : ''}"></i>${esc(it.name)}</span>`).join('')}</div>`; }
  // waterfall: income down to what is left
  function waterfall(wrap, steps) {
    const W = Math.max(280, wrap.clientWidth || 600), H = 230; const m = { l: 52, r: 10, t: 22, b: 30 }; const pw = W - m.l - m.r, ph = H - m.t - m.b;
    let run = 0; const bars = steps.map((s) => { if (s.total) { const b = { ...s, y0: 0, y1: s.value }; run = s.value; return b; } const b = { ...s, y0: run, y1: run - s.value }; run -= s.value; return b; });
    const hi = Math.max(...bars.map((b) => Math.max(b.y0, b.y1)), 1), lo = Math.min(0, ...bars.map((b) => Math.min(b.y0, b.y1)));
    const ticks = niceTicks(lo, hi, 4); const t0 = ticks[0], t1 = ticks[ticks.length - 1];
    const y = (v) => m.t + ph - ((v - t0) / (t1 - t0)) * ph; const band = pw / steps.length; const bw = Math.min(46, band * 0.6);
    const narrow = band < 64; const SHORT = { Essentials: 'Ess.', Lifestyle: 'Life' };
    const fmt1 = (a) => (narrow && a >= 1000 ? (a / 1000).toFixed(1) + '\u00a0k€' : compact(a)); const fmt = (v) => (v < 0 ? `(${fmt1(-v)})` : fmt1(v));
    let g = ''; for (const t of ticks) g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(compact(t))}</text>`;
    bars.forEach((b, i) => {
      const cx = m.l + band * i + band / 2; const top = y(Math.max(b.y0, b.y1)), bot = y(Math.min(b.y0, b.y1)); const h = Math.max(1, bot - top);
      g += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="3" fill="${b.color}"><title>${esc(b.label)}: ${esc(eur(b.value))}</title></rect>`;
      g += `<text class="cap" x="${cx}" y="${top - 6}" text-anchor="middle">${esc(b.total ? fmt(b.value) : b.value < 0 ? '+' + fmt(-b.value) : fmt(-b.value))}</text>`;
      g += `<text class="axis" x="${cx}" y="${H - 10}" text-anchor="middle">${esc(narrow ? SHORT[b.label] || b.label : b.label)}</text>`;
      if (i < bars.length - 1) { const yv = y(b.total ? b.y1 : b.y1); g += `<line x1="${cx + bw / 2}" x2="${cx + band - bw / 2}" y1="${yv}" y2="${yv}" class="today"/>`; }
    });
    wrap.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Where this month's income went">${g}<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
  }

  // ---------- shell ----------
  // iPad navigation: six sections; Report, Wealth and More hold two pages each behind a segmented switch
  const GROUPS = [['report', 'Month', ['report']], ['time', 'Over time', ['time']], ['worth', 'Wealth', ['worth']], ['assume', 'Assumptions', ['assume']], ['update', 'Update', ['update']], ['setup', 'Settings', ['setup']]];
  // ---------- shared visuals: bar row, change, bridge, line chart, day strip, allocation bar, sparkline ----------
  // Money figures use the shared formatter; green and red appear only on the change figures, never on bars.
  const svgT = (x, y, txt, cls, anchor) => `<text class="${cls || 'axis'}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(txt)}</text>`;
  // the change against a reference: arrow, sign and amount; cost = true means more is worse
  function changeH(d, cost, pct) {
    if (d == null || isNaN(d) || Math.abs(d) < 0.5) return '<span class="br-c muted num">–</span>';
    const up = d > 0; const bad = cost === false ? !up : up; const txt = pct != null && isFinite(pct) ? Math.round(Math.abs(pct) * 100) + '%' : eur(Math.abs(d));
    return `<span class="br-c num ${bad ? 'neg' : 'pos'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${up ? '+' : '−'}${txt}</span>`;
  }
  // one row style everywhere: label, amount, bar, tick at the usual amount, change, optional detail and sparkline
  function barRow(o) {
    const mx = Math.max(1, o.max || Math.max(o.value || 0, o.usual || 0)); const w = Math.max(0, Math.min(100, (o.value || 0) / mx * 100)); const t = o.usual != null ? Math.max(0, Math.min(100, o.usual / mx * 100)) : null;
    const d = o.usual != null ? (o.value || 0) - o.usual : null;
    const inner = `<span class="br-l">${o.label}</span><span class="br-v num">${o.fmt ? o.fmt(o.value) : eur(o.value)}</span><span class="br-bar" aria-hidden="true"><i style="width:${w.toFixed(1)}%"></i>${t != null ? `<u style="left:${t.toFixed(1)}%"></u>` : ''}</span>${o.right != null ? o.right : changeH(d, o.cost, o.pct && o.usual ? d / o.usual : null)}${o.spark ? `<span class="br-sp">${o.spark}</span>` : ''}`;
    const cls = 'br-b' + (o.spark ? ' has-sp' : '');
    return `<li class="br">${o.attrs ? `<button type="button" class="${cls}" ${o.attrs}>${inner}</button>` : `<div class="${cls}">${inner}</div>`}${(() => { const dt = [o.usual != null && o.ulabel !== '' ? (o.ulabel || 'Usual') + ' ' + eur(o.usual) : '', o.detail].filter(Boolean).join(' · '); return dt ? `<div class="br-d">${dt}</div>` : ''; })()}</li>`;
  }
  // waterfall: steps = [{ l, v, t: 'total' | 'down' | 'up' }]; a total shows the running amount, a step moves it
  function bridgeSvg(steps, aria, W0, H0) {
    const W = W0 || 760, H = H0 || 232, m = { l: 8, r: 8, t: 26, b: 46 }; const pw = W - m.l - m.r, ph = H - m.t - m.b; let run = 0; const bars = [];
    steps.forEach((s) => { if (s.t === 'total') { bars.push({ ...s, a: 0, b: s.v }); run = s.v; } else { const nx = run + (s.t === 'down' ? -s.v : s.v); bars.push({ ...s, a: run, b: nx }); run = nx; } });
    const hi = Math.max(1, ...bars.map((b) => Math.max(b.a, b.b))), lo = Math.min(0, ...bars.map((b) => Math.min(b.a, b.b))); const y = (v) => m.t + ph - ((v - lo) / (hi - lo)) * ph; const slot = pw / bars.length, bw = Math.min(64, slot * 0.6);
    let g = `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
    bars.forEach((b, i) => { const cx = m.l + slot * i + slot / 2, top = y(Math.max(b.a, b.b)), bot = y(Math.min(b.a, b.b)); const h = Math.max(1.5, bot - top);
      g += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${b.t === 'total' ? 'var(--s1)' : 'var(--s4)'}"/>`;
      if (i < bars.length - 1) g += `<line class="grid" x1="${(cx + bw / 2).toFixed(1)}" x2="${(cx + slot - bw / 2).toFixed(1)}" y1="${y(b.b).toFixed(1)}" y2="${y(b.b).toFixed(1)}"/>`;
      g += svgT(cx, top - 6, Math.round(b.v) === 0 ? '0' : eur(b.v).replace(/[\s\u00a0\u202f]*€/, ''), 'cap', 'middle');
      const words = String(b.l).split(' '); const l1 = words.length > 2 ? words.slice(0, Math.ceil(words.length / 2)).join(' ') : words[0], l2 = words.length > 2 ? words.slice(Math.ceil(words.length / 2)).join(' ') : words.slice(1).join(' ');
      g += svgT(cx, H - 26, l1, 'axis', 'middle') + (l2 ? svgT(cx, H - 11, l2, 'axis', 'middle') : ''); });
    return `<svg class="chart bridge" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(aria)}">${g}</svg>`;
  }
  // running totals by day: series = [{ vals, dash: '' | '6 4' | '1 4', color, w, end: label }], hline = { v, label }
  function dayLineSvg(o) {
    const W = 760, H = 250, m = { l: 8, r: 8, t: 30, b: 28 }; const pw = W - m.l - m.r, ph = H - m.t - m.b; const n = o.n;
    const vals = [].concat(...o.series.map((s) => s.vals.filter((v) => v != null)), o.hline ? [o.hline.v] : []); const ticks = niceTicks(0, Math.max(1, ...vals), 4); const top = ticks[ticks.length - 1];
    const x = (i) => m.l + ((i + 0.5) / n) * pw, y = (v) => m.t + ph - (v / top) * ph; let g = '';
    ticks.forEach((t) => { g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>` + (t > 0 ? svgT(m.l, y(t) - 5, compact(t), 'axis', 'start') : ''); }); // scale labels sit on the grid lines, so both charts can use the full card width
    [0, 6, 13, 20, n - 1].filter((d, i, a) => d < n && a.indexOf(d) === i).forEach((d) => { g += svgT(x(d), H - 8, o.start ? String(+C.dayAdd(o.start, d).slice(8)) : String(d + 1), 'axis', 'middle'); });
    const ends = [], lab = [];
    if (o.hline) { g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(o.hline.v).toFixed(1)}" y2="${y(o.hline.v).toFixed(1)}" stroke="var(--ink-3)" stroke-dasharray="2 3"/>`; ends.push({ yy: y(o.hline.v), xx: W - m.r, t: o.hline.label, c: 'var(--muted)' }); }
    if (o.today != null) g += `<line class="today" x1="${x(o.today).toFixed(1)}" x2="${x(o.today).toFixed(1)}" y1="${m.t}" y2="${m.t + ph}"/>`;
    o.series.forEach((s) => { const ix = s.vals.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0); if (ix.length < 2) return; g += `<path d="M${ix.map((i) => x(i).toFixed(1) + ',' + y(s.vals[i]).toFixed(1)).join('L')}" class="ln" fill="none" stroke="${s.color}" style="stroke-width:${s.w || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`; if (s.end) lab.push({ yy: y(s.vals[ix[ix.length - 1]]), xx: x(ix[ix.length - 1]), t: s.end, c: s.color }); });
    lab.sort((p, q) => p.yy - q.yy); lab.forEach((e, i) => { g += svgT(e.xx - 6, i === 0 ? e.yy - 9 : e.yy + 17, e.t, 'cap', 'end').replace('class="cap"', 'class="cap" fill="' + e.c + '"'); }); // end labels sit inside the plot: the higher line above, the other below
    ends.sort((a, b) => a.yy - b.yy); let prev = -99; ends.forEach((e) => { const yy = Math.max(e.yy, prev + 13); prev = yy; g += svgT(e.xx + 6, yy + 4, e.t, 'cap').replace('class="cap"', 'class="cap" fill="' + e.c + '"'); });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.aria)}">${g}</svg>`;
  }
  // one small bar per day; away days are lighter; the three largest days carry their amount
  function dayStripSvg(vals, away, startDate, aria) {
    const W = 760, H = 112, m = { l: 8, r: 8, t: 22, b: 20 }; const n = vals.length, pw = W - m.l - m.r, ph = H - m.t - m.b; const mx = Math.max(1, ...vals); const slot = pw / n, bw = Math.max(2, slot * 0.7);
    const top3 = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter((p) => p[0] > 0).map((p) => p[1]); let g = `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}"/>`;
    vals.forEach((v, i) => { const h = Math.max(v > 0 ? 1.5 : 0, (v / mx) * ph); const cx = m.l + slot * i + slot / 2; g += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(m.t + ph - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${away.has(i) ? 'var(--s4)' : 'var(--s1)'}" opacity="${away.has(i) ? 0.55 : 1}"/>`; if (top3.includes(i)) g += svgT(cx, m.t + ph - h - 5, compact(v), 'cap', 'middle'); });
    [0, 6, 13, 20, n - 1].filter((i, k, a) => i < n && a.indexOf(i) === k).forEach((i) => { g += svgT(m.l + slot * i + slot / 2, H - 5, String(+C.dayAdd(startDate, i).slice(8)), 'axis', 'middle'); });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(aria)}">${g}</svg>`;
  }
  const NAVL = { report: 'Month', time: 'Over time', assume: 'Assumptions', worth: 'Wealth', hold: 'Wealth', update: 'Update', setup: 'Settings' };
  const GICON = { time: 'forecast', update: 'close', assume: 'assump' };
  // what each page is made of: sections in order; the heading of the first one is the page title
  const HOOKS = { report: ['report'], assume: [], time: ['time'], worth: ['worth'], hold: ['hold'] };
  const runAfter = () => (HOOKS[ui.view] || [ui.view]).forEach((h) => { if (after[h]) after[h](); });
  const grpOf = (v) => GROUPS.find((g) => g[2].includes(v)) || GROUPS[0];
  ui.lastSub = {};
  function closeBadge() { const c = D && D.close; if (!c || !c.total) return ''; return c.done >= c.total ? `<span class="tab-b ok-b">${icon('check', 'sm')}</span>` : `<span class="tab-b">${c.done}/${c.total}</span>`; }
  function tabsHtml() {
    return GROUPS.map(([k, l, vs]) => { const on = vs.includes(ui.view); const to = ui.lastSub[k] || vs[0]; return `<a href="#${to}" data-grp="${k}" class="tab ${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${icon(GICON[k] || k)}<span>${l}</span>${k === 'update' ? closeBadge() : ''}</a>`; }).join('');
  }
  // the six groups; a group's pages are the segmented control in the page header, in both orientations
  function sideHtml() {
    return GROUPS.map(([k, l, vs]) => { const on = vs.includes(ui.view); const to = ui.lastSub[k] || vs[0]; return `<a href="#${to}" data-grp="${k}" class="nav-i ${on ? 'on' : ''}" ${on ? 'aria-current="true"' : ''}>${icon(GICON[k] || k)}<span>${esc(l)}</span>${k === 'update' ? closeBadge() : ''}</a>`; }).join('');
  }
  function navRefresh() {
    const set = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
    set('tabs', tabsHtml()); set('side-nav', sideHtml());
  }
  // one component for empty, loading and error states
  function stateHtml(kind, title, text, act) {
    return `<section class="card empty ${kind}" role="${kind === 'err' ? 'alert' : 'status'}">${kind === 'load' ? '<span class="spin" aria-hidden="true"></span>' : icon(kind === 'err' ? 'alert' : 'import', 'lg')}<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>${act || ''}</section>`;
  }
  // ---------- page scaffold: title, the month where the page has one, one primary action; then the group's pages ----------
  // Month and its Transactions share one cycle (ui.month); it opens on the current cycle
  const cycleKeys = () => { const s = new Set(D.keys); if (D.now) s.add(D.now.key); return [...s].sort(); };
  function sharedMonth() { const ks = cycleKeys(); if (!ui.month || !ks.includes(ui.month)) ui.month = D.now ? D.now.key : ks[ks.length - 1]; return ui.month; }
  // cycle code and status for one cycle: Nov26C (open, to date), Oct26A (closed). Status reads "day 22 of 30" or "Closed".
  const cycleCode = (k) => M.colCode(k, D.complete.includes(k) ? 'A' : 'C');
  function cycleStatus(k) {
    if (D.complete.includes(k)) return 'Closed';
    const r = C.monthRange(k, S.cfg.cutoff); const total = daysBetween(r.from, r.to) + 1; const day = Math.max(1, Math.min(total, daysBetween(r.from, D.today) + 1));
    return D.today > r.to ? 'Not closed' : `day ${day} of ${total}`;
  }
  function periodHtml() {
    const ks = cycleKeys(); if (!ks.length) return ''; const m = sharedMonth(); const i = ks.indexOf(m);
    return `<div class="per" role="group" aria-label="Cycle"><button type="button" class="btn-icon" data-act="per" data-v="-1" aria-label="Previous cycle" ${i <= 0 ? 'disabled' : ''}>${icon('chevL')}</button>
      <select id="per-sel" class="sel per-code" aria-label="Cycle">${ks.slice().reverse().map((k) => `<option value="${k}" ${k === m ? 'selected' : ''}>${cycleCode(k)}</option>`).join('')}</select>
            <button type="button" class="btn-icon" data-act="per" data-v="1" aria-label="Next cycle" ${i >= ks.length - 1 ? 'disabled' : ''}>${icon('chevR')}</button></div>`;
  }
  // one line under the title: what the page covers
  const coverage = () => { const ap = Object.values(S.live || {}).map((e) => e.date).sort().pop(); return `${D.sgTo ? `Statements to ${fmtDate(D.sgTo)}` : 'No statement yet'}${ap ? `, Apple Pay to ${fmtDate(ap)}` : ''}`; };
  function pageSub() {
    const v = ui.view; if (!D.keys.length && !['update', 'setup'].includes(v)) return '';
    if (v === 'report') return '';
    if (v === 'update' || v === 'setup') return coverage();
    if (v === 'assume') return 'Inputs for the 5-year forecast';
    if (v === 'time') return coverage();
    if (v === 'worth') return '';
    if (v === 'hold') return coverage();
    return '';
  }
  function pageAction() {
    const v = ui.view; const btn = (act, label, ic, extra) => `<button type="button" class="btn" data-act="${act}"${extra || ''}>${ic ? icon(ic, 'sm') : ''}${label}</button>`;
    if (v === 'report') return D.now ? `<label class="btn">${icon('import', 'sm')}Update from Apple Pay log<input type="file" id="ap-file" accept=".txt,.csv,text/plain,text/csv" hidden></label><button type="button" class="btn-icon plus-b" data-act="focus-add" aria-label="Add a purchase">${icon('plus')}</button>` : '';
    if (v === 'time') return `<a class="btn" href="#assume">${icon('pen', 'sm')}Assumptions</a>`;
    if (v === 'worth') return btn('go-bal', 'Update balances', 'pen');
    if (v === 'update') return btn('go-bal', 'Update balances', 'pen');
    if (v === 'setup') return btn('backup', 'Export all data', 'save');
    return '';
  }
  function pageHead() {
    const g = grpOf(ui.view); const per = ui.view === 'report' ? periodHtml() : ''; const sub = pageSub(); const act = pageAction();
    const back = ui.from && ui.from !== ui.view && NAVL[ui.from] ? `<div class="back-row"><button type="button" class="btn-ghost" data-act="back">${icon('chevL', 'sm')} Back to ${esc(NAVL[ui.from])}</button></div>` : '';
    return `${back}<header class="ph"><div class="ph-l"><h1 class="ph-t">${esc(NAVL[ui.view])}</h1>${per}</div>${act ? `<div class="ph-a">${act}</div>` : ''}${sub ? `<p class="ph-s">${esc(sub)}</p>` : ''}</header>
    ${g[2].length > 1 ? `<nav class="seg-ctl ph-seg" aria-label="${esc(g[1])} pages">${g[2].map((v) => `<a href="#${v}" class="${v === ui.view ? 'on' : ''}" ${v === ui.view ? 'aria-current="page"' : ''}>${esc(NAVL[v])}</a>`).join('')}</nav>` : ''}`;
  }
  // sticky offset for everything that pins under the header (0 when the sidebar is showing)
  function setHdr() {
    const t = document.querySelector('.top'); const wide = window.matchMedia('(min-width: 1024px)').matches;
    document.documentElement.style.setProperty('--hdr', wide || !t ? '0px' : t.offsetHeight + 'px');
  }
  const askBtn = () => '';
  function shell() {
    return `<div class="app"><aside class="side"><div class="side-brand"><span class="brand-mark">L</span><b>Ledger</b></div><nav id="side-nav" aria-label="Sections">${sideHtml()}</nav>${askBtn('side-ask')}${syncPill(true)}</aside>
    <div class="pane"><header class="top"><div class="top-row"><span class="brand-mark" aria-hidden="true">L</span><nav class="tabs" id="tabs" aria-label="Sections">${tabsHtml()}</nav>${askBtn('top-ask')}${syncPill()}</div></header>
    <main id="main" class="main"></main></div></div><div id="toast" class="toast" role="status" hidden><span id="toast-t"></span><button type="button" class="toast-u" id="toast-u" hidden>Undo</button></div>`;
  }
  function toast(msg, undo) {
    const t = document.getElementById('toast'); if (!t) return; document.getElementById('toast-t').textContent = msg;
    const u = document.getElementById('toast-u'); u.hidden = !undo; u.onclick = undo ? () => { t.hidden = true; undo(); } : null;
    t.hidden = false; clearTimeout(ui.toastT); ui.toastT = setTimeout(() => { t.hidden = true; }, undo ? 7000 : 3200);
  }
  // undo for deletes: copy the saved document just before the change; the toast's Undo button puts it back
  const SKEY = { model: 'cfg', rules: 'rules' };
  function snap(name) { const k = SKEY[name], copy = JSON.stringify(S[k]); return () => { S[k] = JSON.parse(copy); persist(name); changed(); toast('Restored'); }; }
  const after = {};
  // Supabase only: email and password of the user you created in your project
  function signInHtml() {
    return `<section class="card signin"><div class="card-h"><h2>Sign in</h2><span class="muted sm">Your Supabase account</span></div>
      <form id="signin-f" class="col"><label class="ctl"><span class="ctl-l">Email</span><input class="inp" id="si-email" type="email" autocomplete="username" required></label>
      <label class="ctl"><span class="ctl-l">Password</span><input class="inp" id="si-pw" type="password" autocomplete="current-password" required></label>
      ${ui.signInErr ? `<p class="sm neg">${esc(ui.signInErr)}</p>` : ''}<div class="row end"><button class="btn" type="submit">Sign in</button></div></form></section>`;
  }
  document.addEventListener('submit', async (ev) => {
    if (!ev.target || ev.target.id !== 'signin-f') return; ev.preventDefault();
    const err = await ui.signIn(document.getElementById('si-email').value.trim(), document.getElementById('si-pw').value);
    if (err) { ui.signInErr = err; render(); return; } ui.signIn = null; ui.signInErr = null; setSync('starting'); render(); connect();
  });
  function render() {
    if (!D) derive();
    const app = document.getElementById('app');
    if (!app.firstChild) app.innerHTML = shell(); else navRefresh();
    ui.lastSub[grpOf(ui.view)[0]] = ui.view;
    const main = document.getElementById('main');
    const part = (id, title, body, act) => `<section class="part" id="${id}"><div class="part-h"><h2>${esc(title)}</h2>${act || ''}</div>${body}</section>`;
    const fn = { report: () => vReport() + part('transactions', 'Transactions', vLines()), time: vTime, assume: vAssume,
      worth: vWorth, hold: vHold,
      update: () => monthStrip() + part('freshness', 'Data', vUpdate()) + part('closelist', 'Close the cycle', vClose()) + balSheetHtml(), setup: vSettings }[ui.view] || vReport;
    const same = main.dataset.view === ui.view; const openK = same ? [...main.querySelectorAll('details[open][data-k]')].map((d) => d.dataset.k) : [];
    const y = window.scrollY; const sameView = main.dataset.view === ui.view; const keep = {}; main.querySelectorAll('[data-keep][id]').forEach((el) => { keep[el.id] = el.scrollTop; }); main.innerHTML = sync === 'signin' ? signInHtml() : pageHead() + fn();
    if (same) Object.entries(keep).forEach(([id, t]) => { const el = document.getElementById(id); if (el) el.scrollTop = t; }); main.dataset.view = ui.view; if (!same) { main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); } setHdr();
    openK.forEach((k) => { const d = main.querySelector(`details[data-k="${k}"]`); if (d) d.open = true; });
    window.scrollTo({ top: sameView ? y : 0, behavior: 'instant' });
    runAfter();
    if (ui.sect) { const el = document.getElementById(ui.sect); ui.sect = null; if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' }); }
  }
