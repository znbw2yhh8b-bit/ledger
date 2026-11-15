'use strict';
  // ---------- the forecast: a thin layer over the one engine in model.js (M.forecast) ----------
  // Over time (Forecast tab) and Wealth (year-end columns, chart, goals) read fcRun() and nothing else, so both show the same figures.
  // Annual, 5 fiscal years, from the October-close balances. Assumptions live in cfg.assume: inc (income lines), costL (cost lines, each in one of the six buckets), order (savings order), general.mr; returns and risk on each account.
  // years are fiscal years of cycles, November to October, named by the year they end in: FY26 = Nov25 to Oct26 cycles, FY27 = Nov26 to Oct27.
  // The forecast starts from the balances at the close of the last October cycle (Oct26A) and runs five full fiscal years (FY27F ... FY31F); the pay rise in the November cycle lands at the start of each year.
  const fcKey = () => (D.now ? D.now.key : C.budgetMonth(D.today, S.cfg.cutoff)); // the current cycle
  const fcY1 = () => M.fyOf(fcKey()); // the first forecast year: the current fiscal year, in full
  const fcFrac = () => 0; // full years only: the start point is the October close, not today
  const fcStartKey = () => (fcY1() - 1) + '-10'; // the October cycle that closed the last fiscal year
  // starting balances: each account at the October close (check-in point, else statements / automatic balances / typed past balance), today's balance when none is known
  function fcBal0() {
    const k = fcStartKey(), R = C.monthRange(k, S.cfg.cutoff); const pts = (S.snapshots && S.snapshots.points) || {};
    const d = Object.keys(pts).filter((x) => x <= R.to && x > R.from).sort().pop(); const pt = d ? pts[d] : null; const miss = [];
    const b = M.balRows(S.cfg.accounts, (a) => { let v = pt && pt[a.key] != null ? +pt[a.key] : typeof wAcctAt === 'function' ? wAcctAt(a, R.to, k) : null; if (v == null) { v = +a.balance || 0; if (Math.abs(v) >= 0.5) miss.push(a.name); } return v; });
    D.fcMiss = miss; return b;
  }
  const fcBalNow = () => M.balRows(S.cfg.accounts, (a) => a.balance); // today's balances, for goals
  // the usual month by category (median of the recent closed cycles), for the Usual column on Assumptions and for the first set of annual figures
  function fcUsualCats() { const k = D.now ? D.now.key : C.budgetMonth(D.today, S.cfg.cutoff); const U = usualOf(k); const o = {}; if (U) U.cats.forEach((c) => { if (c.bucket && c.amt) o[c.cat] = c.amt; }); return o; }
  // the annual assumptions; made once from the earlier monthly ones (those stay stored, untouched) and saved
  function fcAssume() {
    const A = S.cfg.assume; if (Array.isArray(A.inc) && Array.isArray(A.costL)) return A;
    const s = M.seedAnnual(A, fcUsualCats(), D.payC, S.cfg.netPay, fcY1()); A.inc = s.inc; A.costL = s.costs; persist('model'); return A;
  }
  function fcRun() {
    if (D.fc) return D.fc; refreshRows(); const A = fcAssume();
    return (D.fc = M.forecast({ inc: A.inc, costs: A.costL, order: A.order, accounts: S.cfg.accounts, bal0: fcBal0(), y1: fcY1(), frac: fcFrac(), infl: A.general && A.general.infl != null ? +A.general.infl : 0.02 }));
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
