'use strict';
  // ---------- the forecast: a thin layer over the one engine in model.js (M.forecast) ----------
  // Over time (Forecast tab) and Wealth (year-end columns, chart, goals) read fcRun() and nothing else, so both show the same figures.
  // Annual, 5 fiscal years, from the October-close balances. Assumptions live in cfg.assume: inc (income lines), costL (cost lines, each in one of the six buckets), order (savings order), general.mr; returns and risk on each account.
  // years are fiscal years of cycles, November to October, named by the year they end in: FY26 = Nov25 to Oct26 cycles, FY27 = Nov26 to Oct27.
  // The forecast starts from the balances at the close of the last October cycle (Oct26A) and runs five full fiscal years (FY27F ... FY31F); the pay rise in the November cycle lands at the start of each year.
  const fcKey = () => (D.now ? D.now.key : C.budgetMonth(D.today, S.cfg.cutoff)); // the current cycle
  // The forecast starts from the latest closed cycle (closed on Update), Wealth's balances at its end. The rest of that fiscal year is the first column
  // (FY27E: the closed cycles of the year as actuals, the cycles left as plan), then five full fiscal years. From an October close it is five full years, as before.
  function fcStartKey() {
    if (D._fcStart) return D._fcStart; const rv = (S.overrides && S.overrides.reviewed) || {};
    const closed = typeof wActCols === 'function' ? wActCols().filter((c) => c.kind === 'A' && !c.toClose && rv[c.key]).map((c) => c.key) : [];
    const k = closed.sort().pop() || Object.keys(rv).filter((x) => rv[x]).sort().pop() || (M.fyOf(fcKey()) - 1) + '-10';
    return (D._fcStart = k);
  }
  const fcCyclesIn = (k) => { const m = +k.slice(5, 7); return m >= 11 ? m - 10 : m + 2; }; // a cycle's place in its fiscal year: Nov = 1 ... Oct = 12
  const fcY1 = () => M.fyOf(fcStartKey()) + 1; // the first full forecast year
  const fcFrac = () => (12 - fcCyclesIn(fcStartKey())) / 12; // what is left of the fiscal year the start cycle closes into
  const fcYStart = () => (fcFrac() > 0.005 ? fcY1() - 1 : fcY1()); // the first year the forecast covers, part or full
  // starting balances: the Wealth page's rolled-forward, reconciled balances at the October close (wActCols); an account with none there takes today's balance
  function fcBal0() {
    const k = fcStartKey(); const col = typeof wActCols === 'function' ? wActCols().find((c) => c.key === k && c.kind === 'A') : null; const miss = [];
    const b = M.balRows(S.cfg.accounts, (a) => a.balance); if (col) Object.keys(b).forEach((x) => { if (col.b[x] != null) b[x] = col.b[x]; else if (Math.abs(b[x]) >= 0.5) miss.push(x); }); else miss.push('all accounts');
    D.fcMiss = miss; return b;
  }
  const fcBalNow = () => M.balRows(S.cfg.accounts, (a) => a.balance); // today's balances, for goals
  // the usual month by category (median of the recent closed cycles), for the Usual column on Assumptions and for the first set of annual figures
  function fcUsualCats() { const k = D.now ? D.now.key : C.budgetMonth(D.today, S.cfg.cutoff); const U = usualOf(k); const o = {}; if (U) U.cats.forEach((c) => { if (c.bucket && c.amt) o[c.cat] = c.amt; }); return o; }
  // the annual assumptions; made once from the earlier monthly ones (those stay stored, untouched) and saved
  function fcAssume() {
    const A = S.cfg.assume; if (Array.isArray(A.inc) && Array.isArray(A.costL)) return A;
    const s = M.seedAnnual(A, fcUsualCats(), D.payC, S.cfg.netPay, fcYStart()); A.inc = s.inc; A.costL = s.costs; persist('model'); return A;
  }
  // the rest of the part year: each line's year total less what the year's closed cycles already show, never below zero, so a lump already paid
  // (the October half of the bonus, participation) is not planned again and the year adds up to the assumption. Lines with no actual to match keep a share of the year.
  function fcRest(A) {
    if (!(fcFrac() > 0.005)) return null; const y0 = fcY1() - 1; const ks = D.complete.filter((k) => M.fyOf(k) === y0 && k <= fcStartKey()); if (!ks.length) return null;
    const act = { pay: 0, bonus: 0, dir: {}, cost: {} };
    ks.forEach((k) => { const c = tmFromStmt(k); act.pay += c.in.spendable || 0; act.bonus += c.in.bonus || 0; Object.keys(c.cost).forEach((b) => { if (b !== 'total') act.cost[b] = (act.cost[b] || 0) + (c.cost[b] || 0); });
      const st = stmtOf(k); const by = st.income.directBy || { pee: st.income.direct || 0 }; Object.entries(by).forEach(([x, v]) => { act.dir[x] = (act.dir[x] || 0) + (+v || 0); }); });
    const rest = (yr, done) => Math.max(0, yr - done); const out = { inc: {}, cost: {} }; const on = (l) => l.on !== false;
    (A.inc || []).filter(on).forEach((l) => { const yr = M.lineAt(l, y0); if (l.id === 'pay') out.inc[l.id] = rest(yr, act.pay); else if (l.id === 'bonus') out.inc[l.id] = rest(yr, act.bonus);
      else if (l.acct && act.dir[l.acct] && !(A.inc || []).some((x) => x !== l && on(x) && x.acct === l.acct)) out.inc[l.id] = rest(yr, act.dir[l.acct]); });
    C.BUCKET6.forEach(([b]) => { const yr = C.sum((A.costL || []).filter((l) => on(l) && l.bucket === b), (l) => M.lineAt(l, y0)); if (yr || act.cost[b]) out.cost[b] = rest(yr, act.cost[b] || 0); });
    return out;
  }
  function fcRun() {
    if (D.fc) return D.fc; refreshRows(); const A = fcAssume();
    const f = M.forecast({ inc: A.inc, costs: A.costL, order: A.order, accounts: S.cfg.accounts, bal0: fcBal0(), y1: fcY1(), frac: fcFrac(), rest: fcRest(A), infl: A.general && A.general.infl != null ? +A.general.infl : 0.02 });
    // the part year: named E (estimate), its closed cycles as actuals plus the cycles left as plan
    if (fcFrac() > 0.005 && f.years[0]) { const nA = fcCyclesIn(fcStartKey()); f.years[0].code = M.yearCode(f.years[0].y, 'E'); f.years[0].sub = nA + 'A + ' + (12 - nA) + 'F'; f.years[0].actKeys = D.complete.filter((k) => M.fyOf(k) === f.years[0].y && k <= fcStartKey()); }
    f.startKey = fcStartKey(); return (D.fc = f);
  }
  // goals: where each one stands and the date it is reached on the expected path (a straight line between year-ends); null when not within the 5 years
  function goalStatus() {
    const f = fcRun(); const b0 = fcBalNow(); const nw0 = Object.values(b0).reduce((s, v) => s + (+v || 0), 0);
    const val = (b, keys) => (keys.includes('*') ? b.total : C.sum(keys, (k) => (k === 'liquid' ? (b.cash || 0) + (b.la || 0) : b[k] || 0)));
    return (S.cfg.goals || []).map((g) => { const keys = g.keys && g.keys.length ? g.keys : ['*']; const now = val({ ...b0, total: nw0 }, keys); const tgt = +g.target || 0; let date = null;
      if (now >= tgt) date = D.today; else { let pv = now, pt = Date.parse(D.today + 'T12:00:00Z'); for (const r of f.years) { const v = val(r.bal, keys); const t = Date.parse(C.monthRange(r.y + '-10', S.cfg.cutoff).to + 'T12:00:00Z'); if (t <= pt) { pv = v; continue; } if (v >= tgt) { const q = v > pv ? (tgt - pv) / (v - pv) : 1; date = new Date(pt + q * (t - pt)).toISOString().slice(0, 10); break; } pv = v; pt = t; } }
      return { id: g.id, name: g.name, target: tgt, now, pct: tgt > 0 ? Math.max(0, now / tgt) : 0, date, reached: now >= tgt, by: g.by || null }; });
  }
  // the four groups every wealth split uses (Over time chart, Wealth bar, chart and table): forecast rows in each
  const FC_GRP = [['cur', 'Current accounts', ['cash'], 'var(--s5)'], ['sav', 'Savings', ['la', 'ld'], 'var(--s1)'], ['inv', 'Investments', ['pea', 'other'], 'var(--s2)'], ['lock', 'Locked', ['pee', 'pc', 'dep'], 'var(--s4)']];
  // the assets you added beyond the known accounts join the forecast as rows of their own, in the group of their tier
  function refreshRows() {
    const ex = S.cfg.accounts.filter((a) => M.extraKeys([a]).length); M.setRows(S.cfg.accounts);
    FC_GRP.forEach((g) => { g[2] = g[2].filter((k) => !k.startsWith('x:') && (M.BASE_ROWS.includes(k) || k === 'dep')); });
    ex.forEach((a) => { const g = FC_GRP.find((x) => x[0] === (a.tier === 'savings' ? 'sav' : a.tier === 'invest' ? 'inv' : 'lock')); if (!g[2].includes(a.key)) g[2].splice(g[2].length - (g[0] === 'lock' ? 1 : 0), 0, a.key); });
    if (typeof WG !== 'undefined') { const base = WG.filter(([k]) => M.BASE_ROWS.includes(k) || k === 'dep'); WG.length = 0; base.forEach((x) => WG.push(x)); ex.forEach((a) => WG.splice(WG.length - 1, 0, [a.key, a.name.replace(/\s*••\d+/, ''), FC_GRP.find((g) => g[2].includes(a.key))[0]])); }
  }
  const fcGroups = (b) => { const o = {}; FC_GRP.forEach(([g, , ks]) => { o[g] = b ? C.sum(ks, (k) => +b[k] || 0) : null; }); return o; };
