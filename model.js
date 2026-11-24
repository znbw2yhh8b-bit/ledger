/* Ledger model: spending buckets, normalised run-rate.
   Pure functions. Browser: window.Model. Node: module.exports. */
(function (root) {
  'use strict';
  const C = root.Core || (typeof require !== 'undefined' ? require('./core.js') : null);
  const { sum, r2, addMonths } = C;

  // ---------- buckets ----------
  const BUCKETS = [['income', 'Income'], ['essentials', 'Essentials'], ['lifestyle', 'Lifestyle'], ['family', 'Family'], ['tax', 'Income tax'], ['saving', 'Moved to savings'], ['internal', 'Between my accounts']];
  const SPEND = ['essentials', 'lifestyle', 'family', 'tax'];
  const DEFAULT_MAP = {
    'Salary': 'income', 'Bonus': 'income', 'Other income & refunds': 'income',
    'Rent': 'essentials', 'Energy': 'essentials', 'Internet & mobile': 'essentials', 'Home insurance': 'essentials', 'Bank fees': 'essentials',
    'Groceries': 'essentials', 'Transport': 'essentials', 'Health & pharmacy': 'essentials',
    'Eating out & cafés': 'lifestyle', 'Shopping & leisure': 'lifestyle', 'Trips & holidays': 'lifestyle', 'Spending in Lebanon': 'lifestyle', 'Subscriptions': 'lifestyle', 'Other spending': 'lifestyle', 'Card bill (closed)': 'lifestyle',
    'Spent via Revolut': 'lifestyle', 'Spent via Trade Republic': 'lifestyle', 'To classify': 'lifestyle',
    'Support for parents': 'family', 'Paid for Paul': 'saving', 'Income tax': 'tax',
    'Livret A': 'saving', 'LDDS': 'saving', 'Livret A & LDDS': 'saving', 'PEA & investments': 'saving', 'Epsor (PEE / PERCOL)': 'saving', 'Other own accounts': 'saving', 'Between my accounts': 'internal',
  };
  const RENAMED = { 'Transport & travel': 'Transport' };
  const bucketOf = (cfg, c) => ((cfg.bucketMap || {})[c]) || DEFAULT_MAP[c] || 'lifestyle';

  // a line can be flagged as a one-off when it is spending or occasional income (not pay, not a top-up of a spending account)
  const NOFLAG = ['Salary', 'Bonus', 'Spent via Revolut', 'Spent via Trade Republic'];
  const flaggable = (cfg, t) => !NOFLAG.includes(t.cat) && ['income', 'essentials', 'lifestyle', 'family', 'tax'].includes(bucketOf(cfg, t.cat));
  // one month as a P&L, raw and normalised: the bonus part of pay and flagged one-offs are taken out
  // ref = the regular net salary around that month (a bonus is paid together with the salary)
  function monthPL(txs, key, cfg, oneoff, ref) {
    const m = C.monthSummary(txs, key, { proj: { peaMonthly: cfg.trPea || 0 } });
    const byCat = { ...m.byCat }; const norm = { ...m.byCat };
    let bonus = 0;
    if ((byCat.Bonus || 0) > 0) { const pay = (byCat.Salary || 0) + byCat.Bonus; const regular = ref ? Math.min(pay, ref) : (byCat.Salary || 0); bonus = r2(pay - regular); norm.Salary = r2(regular); norm.Bonus = 0; }
    const offs = txs.filter((t) => t.month === key && oneoff && oneoff[t.id] && flaggable(cfg, t));
    for (const t of offs) norm[t.cat] = r2((norm[t.cat] || 0) - t.amt);
    const fold = (bc) => { const o = {}; BUCKETS.forEach(([b]) => { o[b] = 0; }); for (const [c, v] of Object.entries(bc)) { const b = bucketOf(cfg, c); o[b] += v; } return o; };
    const rb = fold(byCat), nb = fold(norm);
    const shape = (b) => { const o = { income: r2(b.income) }; SPEND.forEach((k) => { o[k] = r2(-b[k]); }); o.saving = r2(-b.saving); o.surplus = r2(o.income - sum(SPEND, (k) => o[k])); o.rate = o.income > 0 ? o.surplus / o.income : 0; return o; };
    return { key, n: m.n, byCat, normCat: norm, raw: shape(rb), norm: shape(nb), offs, bonus, itemised: m.itemised };
  }
  // regular salary for each month: the salary of the nearest month without a bonus
  function salaryRefs(txs, keys) {
    const sal = keys.map((k) => { let s = 0, b = 0; for (const t of txs) { if (t.month !== k) continue; if (t.cat === 'Salary') s += t.amt; else if (t.cat === 'Bonus') b += t.amt; } return { s, b }; });
    const out = {};
    keys.forEach((k, i) => { let best = null, bd = 1e9; sal.forEach((x, j) => { if (x.s > 0 && !(x.b > 0) && Math.abs(j - i) < bd) { bd = Math.abs(j - i); best = x.s; } }); out[k] = best; });
    return out;
  }
  // average of normalised months; categories handled by plan events are left out of the spending run-rate
  function runRate(pls, cfg, excludeCats) {
    const n = pls.length || 1; const o = { income: 0, essentials: 0, lifestyle: 0, family: 0, tax: 0, saving: 0, surplus: 0 }; const cats = {};
    for (const p of pls) { Object.keys(o).forEach((k) => { o[k] += p.norm[k] / n; }); for (const [c, v] of Object.entries(p.normCat)) cats[c] = (cats[c] || 0) + v / n; }
    const plan = { essentials: 0, lifestyle: 0, family: 0 };
    for (const [c, v] of Object.entries(cats)) { const b = bucketOf(cfg, c); if (plan[b] != null && !(excludeCats || []).includes(c)) plan[b] += -v; }
    Object.keys(plan).forEach((k) => { plan[k] = Math.max(0, r2(plan[k])); });
    Object.keys(o).forEach((k) => { o[k] = r2(o[k]); }); o.rate = o.income > 0 ? o.surplus / o.income : 0;
    return { avg: o, cats, plan, months: pls.map((p) => p.key) };
  }
  // transactions that look like one-offs: big, not rent, not a top-up of a spending account, not a family or tax line
  function suggestOneoffs(txs, key, cfg) {
    return txs.filter((t) => t.month === key && t.amt <= -250 && ['essentials', 'lifestyle'].includes(bucketOf(cfg, t.cat)) && t.cat !== 'Rent' && flaggable(cfg, t));
  }

  // ---------- assumptions: one list of lines ----------
  // Every planned amount is a line {id, group: in | cost | save, name, amount, every: month | year | once, months, start, end, growth, acct, on}.
  // basis 'usual' = a cost category that follows the usual month unless the line gives an amount (a year); basis 'payslip' = amount comes from the payslip.
  // forecast:false = shown and used for what is due this month, but not added into the yearly forecast (the usual month already holds it).
  const A6 = 6;
  const mkLine = (x) => ({ on: true, every: 'month', months: [], start: null, end: null, growth: null, acct: null, forecast: true, ...x });
  const JUNK_COSTS = ['interent', 'Internet', 'Card bill (Amex)', 'Card bill (closed)'];
  // version 6: money lent to Paul is no longer a planned cost, and the closed Amex account has no plan line
  const dropClosed = (ls) => (ls || []).filter((l) => l.id !== 'paul' && l.cat !== 'Paid for Paul' && !JUNK_COSTS.includes(l.cat) && !JUNK_COSTS.includes(l.name));
  // One-time conversion of the three earlier plan structures (top-level events, plan{}, p2{}) into cfg.assume. Pure and safe to run twice.
  // The newest copy of each value wins: events (edited last) over plan{}; p2{} overrides what it set. Old lines that only plan{} still held come over switched off.
  function migrate6(saved) {
    if (!saved || (saved.v >= A6 && saved.assume)) return saved;
    if (saved.assume && saved.v === 5) return { ...saved, assume: { ...saved.assume, lines: dropClosed(saved.assume.lines) }, v: A6 };
    const o = { ...saved }; const p = o.p2 || {}; const old = o.plan || {}; const ev = (id) => (o.events || []).find((e) => e.id === id);
    const lines = []; const L = (x) => { lines.push(mkLine(x)); return lines[lines.length - 1]; };
    const evBase = (e, extra) => ({ id: e.id, name: e.name, amount: +e.amount || 0, every: e.every || 'month', months: (e.months || []).slice(), start: e.start || null, end: e.end || null, on: e.on !== false, ...(e.note ? { note: e.note } : {}), ...(e.deduct ? { deduct: e.deduct } : {}), ...extra });
    const hasEx = Array.isArray(p.extras);
    L({ id: 'netpay', group: 'in', name: 'Net pay', basis: 'payslip', amount: p.pay != null ? +p.pay : null, every: 'year', growth: 0.03, acct: 'sg' });
    const bo = ev('bonus'); if (bo) L({ ...evBase(bo, { group: 'in', var: true, basis: 'payslip', acct: 'wf', forecast: !hasEx }) });
    const pt = ev('part'); if (pt) L({ ...evBase(pt, { group: 'in', acct: pt.to || 'pee', forecast: !hasEx }) });
    if (hasEx) p.extras.forEach((e, i) => L({ id: 'x' + (i + 1), group: e.kind === 'cost' || (e.kind == null && +e.amt < 0) ? 'cost' : 'in', name: e.name || '', amount: Math.abs(+e.amt || 0), every: 'year', months: [], start: e.from ? e.from + '-01' : null, end: e.to ? e.to + '-12' : null, acct: e.acct || 'wf', var: !!e.var }));
    const par = ev('par'); if (par) { const n = Math.max(1, (par.months || []).length); L({ ...evBase(par, { group: 'cost', cat: par.cat || 'Support for parents', bucket: 'family', growth: p.parentsRise ? +p.parentsRise : null }), ...(p.parents != null ? { amount: (+p.parents || 0) / n } : {}) }); }
    else if (p.parents) L({ id: 'par', group: 'cost', name: 'Support for your parents', cat: 'Support for parents', bucket: 'family', amount: +p.parents, every: 'year', start: null });
    ['paul', 'leb', 'tax25'].forEach((id) => { const e = ev(id); if (e) L(evBase(e, { group: 'cost', cat: e.cat || null, bucket: e.bucket || 'lifestyle', forecast: false })); });
    (o.events || []).filter((e) => !['bonus', 'part', 'par', 'paul', 'leb', 'tax25', 'peaplan', 'percol'].includes(e.id)).forEach((e) => L(evBase(e, { group: e.kind === 'income' ? 'in' : e.kind === 'transfer' ? 'save' : 'cost', acct: e.to || null, cat: e.cat || null, bucket: e.bucket || null, rule: e.kind === 'transfer' ? 'fixed' : undefined, forecast: false })));
    // where savings go: the waterfall p2{} held (or the one the earlier engine built from events)
    const pe = ev('peaplan'), pc = ev('percol');
    let wf = p.wf; if (!wf) { wf = []; if (pe && pe.on !== false) wf.push({ acct: 'pea', rule: 'fixed', amt: (+pe.amount || 0) * 12 }); if (pc && pc.on !== false) wf.push({ acct: pc.to || 'pc', rule: 'fixed', amt: (+pc.amount || 0) * (pc.months || [1]).length, ded: true }); (o.alloc || []).forEach((k) => { const a = (o.accounts || []).find((x) => x.key === k); if (a && a.cap && a.capOn !== 'deposits') wf.push({ acct: k, rule: 'cap' }); }); wf.push({ acct: 'pea', rule: 'rest' }); }
    let usedPea = false; const nm = { ld: 'LDDS', la: 'Livret A', pea: 'PEA', pc: 'PERCOL', pee: 'PEE', other: 'other investments' };
    wf.forEach((s, i) => {
      const a = nm[s.acct] || s.acct;
      if (s.rule === 'fixed' && s.acct === 'pea' && !usedPea) { usedPea = true; L({ id: 'peaplan', group: 'save', name: 'PEA monthly investment', rule: 'fixed', acct: 'pea', amount: 500, every: 'month', start: (pe && pe.start) || null, ded: s.ded ? true : undefined }); }
      else L({ id: 'w' + (i + 1), group: 'save', name: s.rule === 'fixed' ? `Into ${a}` : s.rule === 'cap' ? `Fill ${a} to its ceiling` : `The rest into ${a}`, rule: s.rule, acct: s.acct, ...(s.rule === 'fixed' ? { amount: +s.amt || 0, every: 'year' } : {}), ...(s.ded ? { deduct: +s.amt || 0 } : {}), ...(s.ded ? { ded: true } : {}) });
    });
    if (!usedPea) lines.splice(lines.findIndex((l) => l.group === 'save'), 0, mkLine({ id: 'peaplan', group: 'save', name: 'PEA monthly investment', rule: 'fixed', acct: 'pea', amount: 500, every: 'month', start: (pe && pe.start) || null, forecast: false }));
    if (pc && !wf.some((s) => s.acct === (pc.to || 'pc') && s.rule === 'fixed')) L(evBase(pc, { group: 'save', rule: 'fixed', acct: pc.to || 'pc', forecast: false, ded: true }));
    // usual-month categories the plan changed: amount a year, own growth, switched off
    Object.entries(p.costs || {}).forEach(([c, v]) => { if (JUNK_COSTS.includes(c) || !v || (v.amt == null && v.infl == null && !v.removed)) return; L({ id: 'c:' + c, group: 'cost', name: c, cat: c, basis: 'usual', amount: v.amt != null ? +v.amt : null, every: 'year', growth: v.infl != null ? +v.infl : null, on: !v.removed, forecast: true }); });
    // lines only the second plan structure still held: kept, switched off
    const seen = new Set(lines.map((l) => l.id));
    ((old.income || {}).other || []).filter((x) => !seen.has(x.id)).forEach((x) => L({ id: x.id, group: 'in', name: x.name, amount: +x.amount || 0, every: x.every || 'year', months: (x.months || []).slice(), start: x.start || null, end: x.end || null, acct: (o.accounts || []).some((a) => a.key === x.to) ? x.to : null, on: false, forecast: false, note: 'From an earlier plan, switched off' }));
    Object.values(old.spending || {}).forEach((g) => (g.lines || []).filter((x) => !seen.has(x.id)).forEach((x) => L({ id: x.id, group: 'cost', name: x.name, cat: x.cat || null, bucket: 'lifestyle', amount: +x.amount || 0, every: x.every || 'year', months: (x.months || []).slice(), start: x.start || null, end: x.end || null, on: false, forecast: false, note: 'From an earlier plan, switched off' })));
    o.assume = { horizon: +p.horizon || 10, scenario: p.scenario || 'base', real: !!p.real, infl: p.infl != null ? +p.infl : (o.inflation != null ? +o.inflation : 0.02), mr: p.mr != null ? +p.mr : (o.taxRate != null ? +o.taxRate : 0.30), bufMonths: p.bufMonths != null ? +p.bufMonths : 1, efIn: p.efIn === 'la' ? 'la' : 'cash', ...(p.scen ? { scen: p.scen } : {}), ...(p.target ? { target: p.target } : {}), lines };
    // the Trade Republic transfer keeps carrying the PEA part it carried before (closed months are not re-cut)
    if (o.trPea == null) o.trPea = o.peaPlan != null ? +o.peaPlan : (pe ? +pe.amount || 0 : 250);
    ['events', 'plan', 'planBackupV3', 'p2', 'peaPlan', 'raise', 'raiseMonth', 'horizon', 'inflation', 'taxRate', 'alloc', 'at'].forEach((k) => { delete o[k]; });
    if (o.seen) { delete o.seen.bonus1; delete o.seen.leb; }
    o.assume.lines = dropClosed(o.assume.lines); o.v = A6; return o;
  }

  // ---------- assumptions, version 7: one table per block, one row per driver ----------
  // income: net pay a month (null = from the payslip settings) with a rise each October pay; bonus as one net yearly total split June / October; participation (lands in the November cycle)
  // costs: per category { budget (a month; null = follows the usual month), growth (a year; null = inflation), on }
  // lines: dated lines { id, kind: cost | save | in, name, amount (each time), months (cycle months by name, 1 to 12), from, to ('YYYY-MM'), bucket, cat, growth, acct, deduct, var, on }
  // order: the savings order { id, rule: keep (current accounts up to amount) | fixed (amount a month) | year (amount a year) | cap (to the ceiling) | target (up to a balance) | share (fraction of what is left) | rest | out (take amount out), acct, amount, from, to (years), on }
  // cases: deltas for bonus paid (share), costs, returns and pay rise. general: inflation, horizon, marginal tax rate. The start day and the usual-month window live in cfg.cutoff and cfg.runMonths.
  const A_VERSION = 7;
  const ALLM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mkDated = (x) => ({ on: true, kind: 'cost', months: [], from: null, to: null, growth: null, acct: null, deduct: 0, ...x });
  const defaultOrder = () => [
    { id: 'keep', rule: 'keep', name: 'Keep in current accounts up to', amount: 3000, on: true },
    { id: 'peaplan', rule: 'fixed', acct: 'pea', name: 'PEA, fixed a month', amount: 500, from: '2026-11', on: true },
    { id: 'w-ld', rule: 'cap', acct: 'ld', name: 'LDDS, fill to its ceiling', on: true },
    { id: 'w-la', rule: 'cap', acct: 'la', name: 'Livret A, fill to its ceiling', on: true },
    { id: 'w-rest', rule: 'rest', acct: 'pea', name: 'The rest to PEA', on: true },
  ];
  const defaultCases = () => ({ prudent: { bonus: 0.5, costs: 0.10, ret: -0.02, raise: -0.01 }, base: { bonus: 1, costs: 0, ret: 0, raise: 0 }, optimistic: { bonus: 1, costs: -0.05, ret: 0.01, raise: 0.005 } });
  const defaultAssume = () => ({
    v: A_VERSION, case: 'base', general: { infl: 0.02, horizon: 10, mr: 0.30 },
    income: { netPay: { month: null, growth: 0.03, baseYear: new Date().getFullYear() - 1 }, bonus: { year: null, junePct: 50, growth: 0 }, part: { year: 1913, growth: 0 } },
    costs: {},
    lines: [
      mkDated({ id: 'par', name: 'Support for your parents', cat: 'Support for parents', bucket: 'family', amount: 1813, months: [3, 6, 9, 12], from: '2026-12', deduct: 1800 }),
      mkDated({ id: 'leb', name: 'Flights to Lebanon, 3 trips a year', bucket: 'trips', amount: 450, months: [1, 5, 9], from: '2027-01', note: LEB_NOTE }),
      mkDated({ id: 'tax25', name: 'Income tax 2025 balance', bucket: 'tax', amount: 357, months: [11, 12], from: '2026-11', to: '2026-12' }),
      mkDated({ id: 'percol', kind: 'save', name: 'PERCOL voluntary payment', acct: 'pc', amount: 2400, months: [12], from: '2026-12', deduct: 2400 }),
    ],
    order: defaultOrder(), cases: defaultCases(),
  });
  const B3 = { essentials: 'home', lifestyle: 'lifestyle', family: 'family', tax: 'tax' };
  // One-time conversion of version 6 (a list of lines) into the table shape. Pure and safe to run twice: a model already at version 7 comes back as it is.
  function toV7(o) {
    if (!o || (o.v >= A_VERSION && o.assume && o.assume.income)) return o;
    const old = o.assume; if (!old || !Array.isArray(old.lines)) return o; const L = old.lines; const find = (id) => L.find((l) => l.id === id);
    const A = defaultAssume(); A.lines = []; A.order = []; A.case = old.scenario || 'base'; A.general = { infl: old.infl != null ? +old.infl : 0.02, horizon: +old.horizon || 10, mr: old.mr != null ? +old.mr : 0.30 };
    const np = find('netpay'); A.income.netPay = { month: np && np.amount != null ? Math.round(np.amount / 12 * 100) / 100 : null, growth: np && np.growth != null ? +np.growth : 0.03, baseYear: new Date().getFullYear() - 1 };
    const bo = find('bonus'); A.income.bonus = { year: !bo || bo.basis === 'payslip' ? null : +bo.amount || 0, junePct: 50, growth: 0 }; if (bo && bo.on === false) A.income.bonus.year = 0;
    const pt = find('part'); A.income.part = { year: pt && pt.on !== false ? +pt.amount || 0 : 0, growth: 0 };
    const mons = (l) => (l.every === 'month' ? ALLM.slice() : l.every === 'once' ? (l.start ? [+l.start.slice(5, 7)] : []) : (l.months || []).length ? l.months.slice() : ALLM.slice());
    const per = (l) => (l.every === 'year' && !(l.months || []).length ? (+l.amount || 0) / 12 : +l.amount || 0); // a yearly amount with no months is spread over twelve
    const win = (l) => ({ from: l.start || null, to: l.every === 'once' ? l.start || null : l.end || null });
    const kind = (l) => (l.group === 'in' ? 'in' : l.group === 'save' ? 'save' : 'cost');
    L.forEach((l) => {
      if (['netpay', 'bonus', 'part'].includes(l.id)) return;
      if (l.group === 'cost' && l.basis === 'usual') { A.costs[l.cat] = { budget: l.amount != null ? Math.round(+l.amount / 12 * 100) / 100 : null, growth: l.growth != null ? +l.growth : null, on: l.on !== false }; return; }
      if (l.group === 'save') {
        if (l.rule === 'fixed' && l.id !== 'percol' && !(l.every === 'year' && (l.months || []).length)) { A.order.push({ id: l.id, rule: 'fixed', acct: l.acct, name: l.name, amount: l.every === 'year' ? Math.round((+l.amount || 0) / 12 * 100) / 100 : +l.amount || 0, ...(l.start ? { from: l.start } : {}), on: l.on !== false }); return; }
        if (l.rule === 'cap' || l.rule === 'rest') { A.order.push({ id: l.id, rule: l.rule, acct: l.acct, name: l.name, on: l.on !== false }); return; }
        A.lines.push(mkDated({ id: l.id, kind: 'save', name: l.name, acct: l.acct, amount: per(l), months: mons(l), ...win(l), deduct: l.deduct || 0, on: l.on !== false })); return;
      }
      const bucket = l.id === 'leb' ? 'trips' : C.bucket6Of(l.cat || '') || B3[l.bucket] || (l.group === 'cost' ? 'lifestyle' : undefined);
      A.lines.push(mkDated({ id: l.id, kind: kind(l), name: l.name, ...(l.cat ? { cat: l.cat } : {}), ...(l.group === 'cost' ? { bucket } : {}), acct: l.group === 'in' && l.acct && l.acct !== 'wf' ? l.acct : null, amount: per(l), months: mons(l), ...win(l), growth: l.growth != null ? +l.growth : null, deduct: l.group === 'cost' ? +l.deduct || 0 : 0, ...(l.var ? { var: true } : {}), ...(l.note ? { note: l.note } : {}), on: l.on !== false }));
    });
    A.order.unshift({ id: 'keep', rule: 'keep', name: 'Keep in current accounts up to', amount: +o.buffer || 3000, on: true });
    if (!A.order.some((r) => r.rule === 'fixed' && r.acct === 'pea')) A.order.splice(1, 0, { id: 'peaplan', rule: 'fixed', acct: 'pea', name: 'PEA, fixed a month', amount: 0, on: false });
    if (old.scen) { Object.entries(old.scen).forEach(([k, v]) => { if (A.cases[k]) ['ret', 'raise', 'bonus', 'costs'].forEach((f) => { if (v && v[f] != null) A.cases[k][f] = +v[f]; }); }); }
    if (old.target) A.target = old.target; if (old.real) A.real = true;
    const r = { ...o, v: A_VERSION, assume: A }; delete r.p2old;
    // Paul: what he owes is a memo, not an account; money sent to him is a Family cost. The PEA value is typed, not rebuilt from holdings (the holdings stay as history).
    const pa = (r.accounts || []).find((a) => a.key === 'paul'); if (pa && !r.paul) r.paul = { base: +pa.balance || 0, asOf: pa.asOf || null };
    r.accounts = (r.accounts || []).filter((a) => a.key !== 'paul' && a.tier !== 'receivable').map((a) => { const b = { ...a }; if (b.key === 'pea') delete b.fromHold; return b; });
    r.balanceFirst = true; return r;
  }
  function migrate(saved) { return toV7(migrate6(saved)); }

  // ---------- pay: from gross salary to net pay after withholding ----------
  // social = employee contributions as a share of gross; taxable = net taxable as a share of gross; pas = withholding rate
  function defaultPay() {
    return { salary: 90000, fixed: 33, social: 0.219, taxable: 0.821, pas: 0.176, bonus: 20000, bonusGrowth: 0.10, julShare: 0.38,
      lines: [
        { id: 'nav', name: 'Navigo refund from EY (50%)', amount: 62.43, cash: true },
        { id: 'mealme', name: 'Meal vouchers, your share taken from pay', amount: -100, cash: true },
        { id: 'meal', name: 'Meal voucher card (Swile), total loaded', amount: 250, cash: false },
      ] };
  }
  function payCalc(p) {
    const gm = (+p.salary || 0) / 12 + (+p.fixed || 0); const social = gm * (+p.social || 0); const before = gm - social;
    const taxable = gm * (+p.taxable || 0); const pas = taxable * (+p.pas || 0);
    const lines = (p.lines || []).filter((l) => l.cash !== false); const linesCash = sum(lines, (l) => +l.amount || 0);
    const benefits = sum((p.lines || []).filter((l) => l.cash === false), (l) => +l.amount || 0);
    const bg = +p.bonus || 0; const bonusNet = bg * (1 - (+p.social || 0)) - bg * (+p.taxable || 0) * (+p.pas || 0); const jul = p.julShare != null ? +p.julShare : 0.5;
    return { gm: r2(gm), social: r2(social), before: r2(before), taxable: r2(taxable), pas: r2(pas), linesCash: r2(linesCash), benefits: r2(benefits), net: r2(before - pas + linesCash), bonusGross: bg, bonusNet: r2(bonusNet), bonusJul: Math.round(bonusNet * jul), bonusOct: Math.round(bonusNet * (1 - jul)) };
  }

  // ---------- configuration ----------
  // three return trips to Lebanon a year, paid when booked; the note holds the buying advice
  const LEB_NOTE = 'Direct, about 4 h 20: MEA from Paris-CDG several times a day; Air France (CDG) and Transavia (Orly) are back since late September 2026 after a seven-month suspension. One stop, often €50–150 cheaper but 7–10 hours door to door: Pegasus or AJet via Istanbul Sabiha Gökçen, Turkish Airlines via Istanbul, Royal Jordanian via Amman, Aegean via Athens; bags are extra on the low-cost ones. Cheapest months to fly: January to March and November. Dearest: July–August, Christmas to New Year and Easter. Buy about 6 weeks ahead for off-peak trips and 3 to 5 months ahead for summer, Christmas and Easter; Tuesday and Wednesday departures are usually cheaper. Because European airlines suspended Beirut for months in 2026, prefer MEA or a single ticket with a changeable fare over two separate low-cost tickets. Budget here: €450 per return, bought in January (Easter trip), May (summer trip) and September (Christmas trip).';
  function defaults() {
    return {
      v: A_VERSION, cutoff: 23, buffer: 3000, trPea: 250, netPay: 4757, swr: 0.04, balanceFirst: true, paul: { base: 8500, asOf: '2026-10-22' },
      runMonths: 6, basis: 'runrate',
      targets: { essentials: 0.50, lifestyle: 0.20, family: 0.12, saving: 0.18 },
      bucketMap: {}, assume: defaultAssume(),
      accounts: [
        { key: 'sg', name: 'SG current account ••2341', tier: 'cash', balance: 1394, asOf: '2026-11-02' },
        { key: 'tr', name: 'Trade Republic cash', tier: 'cash', balance: 340, asOf: '2026-11-02' },
        { key: 'fo', name: 'Fortuneo', tier: 'cash', balance: 0, asOf: '2026-10-30' },
        { key: 'rev', name: 'Revolut', tier: 'cash', balance: 0, asOf: '2026-10-30' },
        { key: 'la', name: 'Livret A ••3118', tier: 'savings', balance: 22949, asOf: '2026-11-02', ret: 0.017, cap: 22950 },
        { key: 'ld', name: 'LDDS ••0757', tier: 'savings', balance: 2010, asOf: '2026-11-02', ret: 0.017, cap: 12000 },
        { key: 'pea', name: 'PEA (Trade Republic)', tier: 'invest', balance: 256, asOf: '2026-11-02', ret: 0.06, vol: 0.15, cap: 150000, capOn: 'deposits' },
        { key: 'other', name: 'Other investments (CTO)', tier: 'invest', balance: 0, asOf: '2026-10-30', ret: 0.06, vol: 0.15 },
        { key: 'pee', name: 'Epsor PEE', tier: 'locked', balance: 1600, asOf: '2026-11-02', ret: 0.045, vol: 0.08 },
        { key: 'pc', name: 'Epsor PERCOL', tier: 'locked', balance: 1694, asOf: '2026-11-02', ret: 0.06, vol: 0.15 },
        { key: 'dep', name: 'Rent deposit', tier: 'other', balance: 2300, asOf: '2026-11-02' },
      ],
      goals: [
        { id: 'g-ld', name: 'LDDS full', target: 12000, keys: ['ld'] },
        { id: 'g-50', name: 'Net worth €50,000', target: 50000, keys: ['*'] },
        { id: 'g-100', name: 'Net worth €100,000', target: 100000, keys: ['*'], by: '2030-12' },
      ],
    };
  }
  function mergeConfig(saved) {
    const d = defaults(); if (!saved) return d;
    const o = { ...d, ...migrate(saved), targets: { ...d.targets, ...(saved.targets || {}) } };
    if (!Array.isArray(o.accounts)) o.accounts = d.accounts;
    if (!o.assume || !o.assume.income) o.assume = d.assume;
    if (!Array.isArray(o.goals)) o.goals = d.goals;
    return o;
  }
  // first run: carry over balances and choices from the previous version's settings
  function fromPrevious(old) {
    const d = defaults(); if (!old) return d;
    const s = C.mergeSettings(old); const P = s.proj;
    const map = { sg: 'sg', tr: 'tr', fo: 'fo', rev: 'rev', la: 'la', ld: 'ld', pea: 'pea', other: 'other', pee: 'pee', pc: 'pc', dep: 'dep', paul: 'paul' };
    for (const a of d.accounts) { const o = (s.accounts || []).find((x) => x.key === map[a.key]); if (o) { a.balance = +o.balance || 0; a.asOf = o.asOf; } }
    d.netPay = Math.round(C.netPay(s) * 100) / 100; d.buffer = s.buffer || d.buffer; d.cutoff = s.cutoff || 23; d.trPea = P.peaMonthly || 250;
    const A = d.assume; const ln = (id) => A.lines.find((e) => e.id === id);
    A.income.netPay.growth = P.raise != null ? P.raise : A.income.netPay.growth; A.general.infl = P.inflation || A.general.infl;
    const par = ln('par'); par.amount = (+s.parents.amount || 0) + (s.parents.fee || 0); par.deduct = +s.parents.amount || 0; par.months = s.parents.months || par.months; if (!s.parents.amount) par.on = false;
    const pc = ln('percol'); pc.amount = P.percolDec || 0; pc.deduct = P.percolDec || 0; if (!P.percolDec) pc.on = false;
    A.income.bonus.year = P.bonus ? Math.round(P.bonus * (P.bonusNetRatio || 0.8)) : 0;
    const t25 = (s.recurring || []).find((r) => r.id === 'tax25'); const tx = ln('tax25'); if (t25 && !t25.off) { tx.amount = -t25.amt; if (t25.from) tx.from = t25.from.slice(0, 7); if (t25.until) tx.to = t25.until.slice(0, 7); } else if (t25) tx.on = false;
    A.income.part.year = Math.round((P.participation || 0) * (1 - 0.097));
    if (Array.isArray(s.goals) && s.goals.length) d.goals = s.goals.map((g) => ({ ...g, keys: (g.keys || ['*']).map((k) => (k === 'cashsave' ? 'liquid' : k)) }));
    return d;
  }

  // ================= ENGINE: one set of figures =================
  // Actual side: a cycle runs from the start day (cfg.cutoff, 23) to the day before it and is named by its end month: 2026-11 = 23 Oct to 22 Nov.
  // Column codes: Oct26A closed cycle, Nov26C current cycle to date; forecast fiscal year-ends (Oct cycle close) FY27F ... FY31F, starting from the Oct26A balances.
  // Forecast side: annual only, 5 years, from today's balances. Over time and Wealth both read forecast() below.
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const keyY = (k) => +String(k).slice(0, 4), keyM = (k) => +String(k).slice(5, 7);
  const colCode = (key, kind) => MN[keyM(key) - 1] + String(keyY(key)).slice(2) + kind;
  const yearCode = (y, kind) => 'FY' + String(y).slice(2) + kind; // fiscal year Nov–Oct, named by its end year: FY26 = Nov25 to Oct26
  const fyOf = (d) => keyY(d) + (keyM(d) >= 11 ? 1 : 0); // the fiscal year (Nov–Oct, named by its end year) a cycle key or date YYYY-MM falls in
  const BASE_ROWS = ['cash', 'la', 'ld', 'pea', 'other', 'pee', 'pc'];
  const ACCT_ROWS = BASE_ROWS.slice(); // where money left over can go: the known accounts, then every other asset you added (Gold, Other cash...)
  const extraKeys = (accounts) => (accounts || []).filter((a) => a.tier !== 'cash' && a.tier !== 'receivable' && a.key !== 'dep' && !BASE_ROWS.includes(a.key)).map((a) => a.key);
  function setRows(accounts) { const ex = extraKeys(accounts); if (ACCT_ROWS.length === BASE_ROWS.length + ex.length && ex.every((k, i) => ACCT_ROWS[BASE_ROWS.length + i] === k)) return; ACCT_ROWS.length = 0; ACCT_ROWS.push(...BASE_ROWS, ...ex); }
  const HOLD = ['dep']; // held, never grows or receives: the rent deposit and any account the forecast does not know
  const BIDS = C.BUCKET6.map((b) => b[0]);
  const FC_YEARS = 5;
  const zeroA = () => { const o = {}; ACCT_ROWS.forEach((k) => { o[k] = 0; }); return o; };
  const zeroCost = () => { const o = {}; BIDS.forEach((b) => { o[b] = 0; }); return o; };
  const sumO = (o) => Object.values(o).reduce((s, v) => s + (v || 0), 0);
  // a line's value in year y: nothing before its start year, then the amount grown by its rate each year after
  const lineAt = (l, y) => { const f = +l.from || 0; if (l.on === false || (f && y < f)) return 0; return (+l.amount || 0) * Math.pow(1 + (+l.growth || 0), f ? y - f : 0); };
  // balances by forecast row from the accounts: current accounts together, the known savings and investment accounts by key, everything else held as is
  function balRows(accounts, pick) {
    setRows(accounts); const b = { ...zeroA(), dep: 0 }; (accounts || []).forEach((a) => { if (a.tier === 'receivable') return; const v = +pick(a) || 0; if (a.tier === 'cash') b.cash += v; else if (ACCT_ROWS.includes(a.key)) b[a.key] += v; else b.dep += v; });
    return b;
  }
  // inp = { inc: [{ name, amount, from, growth, acct }], costs: [{ bucket, amount, from, growth }], order: [...], accounts: [...], bal0: { cash, la, ..., dep }, y1: first forecast year }
  // mkt (optional): the PEA's return for each of the 5 years on one simulated path (every other account keeps its fixed rate); lean: totals only
  // the periods: what is left of this year (inp.frac of it), then FC_YEARS full years from inp.y1
  // ly is the year whose line values apply. For what is left of this year it is this year; only when no line starts this year or earlier (a plan made before this column existed) does the rest of this year use next year's lines.
  function periods(inp) { const fr = Math.max(0, Math.min(1, +inp.frac || 0)); const y0 = inp.y1 - 1; const ls = (inp.inc || []).concat(inp.costs || []).filter((l) => l.on !== false && +l.amount);
    const early = ls.length && !ls.some((l) => !l.from || +l.from <= y0); const P = fr > 0.005 ? [{ y: y0, f: fr, ly: early ? inp.y1 : y0 }] : []; for (let i = 0; i < FC_YEARS; i++) P.push({ y: inp.y1 + i, f: 1, ly: inp.y1 + i }); return P; }
  const monthsOf = (inp) => periods(inp).map((p) => Math.max(1, Math.round(p.f * 12)));
  function forecastPath(inp, mkt, lean) {
    setRows(inp.accounts); const T = {}; (inp.accounts || []).forEach((x) => { T[x.key] = x; }); const b = { ...zeroA(), dep: 0 }; Object.keys(b).forEach((k) => { b[k] = +(inp.bal0 || {})[k] || 0; });
    const dep = {}; ACCT_ROWS.forEach((k) => { if (k !== 'cash' && k !== 'la' && k !== 'ld') dep[k] = b[k]; }); const room = (k) => { const x = T[k]; if (!x || !x.cap) return Infinity; return Math.max(0, x.cap - (x.capOn === 'deposits' ? (dep[k] || 0) : b[k])); };
    const order = (inp.order || []).filter((r) => r.on !== false); const rows = [];
    const P = periods(inp);
    for (let i = 0; i < P.length; i++) {
      const { y, f, ly } = P[i]; const start = { ...b }; const into = zeroA(); const put = (k, v) => { if (!(k in into)) k = 'cash'; b[k] += v; into[k] += v; if (k in dep) dep[k] += v; };
      const items = {}; let inT = 0; const direct = zeroA();
      // the rest of a year already partly closed: a line or bucket given in inp.rest takes that amount (its year total less what the closed cycles already show) instead of a share of the year
      const R0 = i === 0 && f < 1 && inp.rest ? inp.rest : null;
      (inp.inc || []).forEach((l) => { const v = R0 && R0.inc && l.id in R0.inc ? R0.inc[l.id] : lineAt(l, ly) * f; if (!v) return; const nm = (l.name || '').trim() || 'Income'; items[nm] = (items[nm] || 0) + v; inT += v; if (l.acct && l.acct !== 'cash' && ACCT_ROWS.includes(l.acct)) direct[l.acct] += v; });
      const cost = zeroCost(); (inp.costs || []).forEach((l) => { if (l.bucket in cost && !(R0 && R0.cost && l.bucket in R0.cost)) cost[l.bucket] += lineAt(l, ly) * f; }); if (R0 && R0.cost) Object.keys(R0.cost).forEach((k) => { if (k in cost) cost[k] += R0.cost[k]; }); const costT = sumO(cost); const left = inT - costT;
      let avail = left; ACCT_ROWS.forEach((k) => { if (direct[k]) { put(k, direct[k]); avail -= direct[k]; } });
      const byRule = {}; let short = 0;
      for (const r of order) {
        if (r.from && ly < keyY(r.from)) continue; if (r.to && ly > keyY(r.to)) continue; const amt = Math.max(0, +r.amount || 0);
        if (r.rule === 'keep') { const X = amt; avail += b.cash - X; into.cash -= b.cash - X; b.cash = X; byRule[r.id] = -(b.cash - X); continue; }
        if (!ACCT_ROWS.includes(r.acct) || r.acct === 'cash') continue;
        // take out: money moved from the account back into what is left (it ends in current accounts unless a later rule places it)
        if (r.rule === 'out') { if (f < 1) continue; const v = Math.min(amt, Math.max(0, b[r.acct])); if (v > 0) { put(r.acct, -v); avail += v; byRule[r.id] = -v; } continue; }
        if (r.rule === 'cap' && !(T[r.acct] && T[r.acct].cap)) continue; if (avail <= 0) { if (r.rule === 'fixed' || r.rule === 'year') short += (r.rule === 'fixed' ? amt * 12 : amt) * f; continue; }
        const want = r.rule === 'fixed' ? amt * 12 * f : r.rule === 'year' ? amt * f : r.rule === 'target' ? Math.max(0, amt - b[r.acct]) : r.rule === 'share' ? avail * Math.min(1, amt) : avail;
        const v = Math.min(want, avail, room(r.acct)); if ((r.rule === 'fixed' || r.rule === 'year') && want > v + 0.5) short += want - v; if (v > 0) { put(r.acct, v); avail -= v; byRule[r.id] = v; }
      }
      if (avail > 0) put('cash', avail);
      else if (avail < 0) { for (const k of ['cash', 'la', 'ld', 'other', 'pea']) { if (avail >= 0) break; const t = Math.min(-avail, Math.max(0, b[k])); if (t > 0) { put(k, -t); avail += t; } } if (avail < 0) put('cash', avail); }
      // returns: a yearly rate on the start balance and half a year on what went in; with rand, markets move (growth lowered by half the variance)
      const gain = zeroA();
      ACCT_ROWS.forEach((k) => { if (k === 'cash') return; const x = T[k]; if (!x) return; const ret = +x.ret || 0;
        const r = mkt && k === 'pea' ? mkt[i] : Math.pow(1 + ret, f) - 1; gain[k] = start[k] * r + into[k] * r / 2; b[k] += gain[k]; });
      const total = sumO(b);
      if (lean) { rows.push(total); continue; }
      rows.push({ y, code: yearCode(y, 'F'), byRule, short, items, in: { total: inT }, cost: { ...cost, total: costT }, left, assets: { ...into, total: sumO(into) }, gain: { ...gain, total: sumO(gain) }, start: { ...start, total: sumO(start) }, bal: { ...b, total } });
    }
    return rows;
  }
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // world equities, monthly total returns in EUR (MSCI World), Jan 1970 to Aug 2026, in basis points. Source: the owner's export, 14 Nov 2026.
  const MKT0 = '1970-01';
  const MKT = [-554,312,31,-934,-631,-246,620,330,323,-148,224,496,394,90,439,335,-454,-16,-247,27,-267,-467,105,691,245,240,103,143,209,-265,131,366,-132,126,514,168,15,-532,-627,-424,-191,-699,-728,-43,279,56,-694,212,673,-207,-599,-512,-648,-64,-490,-733,-785,676,-467,-404,1059,709,40,668,127,83,-19,247,-251,537,305,133,814,-229,110,-158,-74,371,-105,-198,-74,-584,-107,619,-295,6,-118,36,-200,362,-442,189,156,-365,-40,-209,-443,-266,229,497,437,-5,575,-63,-24,-845,-9,190,399,-144,416,97,-65,169,-286,433,114,-704,266,37,497,97,-603,782,38,325,179,397,275,550,783,90,-262,712,362,270,403,364,130,68,-1172,0,627,-78,3,-293,-96,652,-586,101,82,790,139,812,705,18,140,396,403,867,-37,629,-46,379,208,-281,532,384,308,-468,97,139,-407,83,11,1126,432,289,-299,611,808,392,369,-719,586,0,-293,-265,236,-111,353,220,-63,471,673,328,-204,442,-216,546,-474,-282,529,53,503,146,601,448,-108,172,346,672,-431,-1759,-834,114,350,884,161,64,-105,355,699,-340,346,400,-64,99,770,58,0,285,171,63,642,-93,438,-700,248,-106,-749,-558,-442,-273,870,-7,-216,-1338,-1043,609,-362,327,388,741,560,612,360,-270,483,-254,-24,146,-796,384,-119,41,-219,45,196,-615,-455,-18,134,130,842,71,226,489,629,105,253,203,636,536,-577,394,-315,482,802,-170,-631,337,-192,-192,-126,311,-369,86,-294,301,-354,32,72,148,239,-89,376,71,421,-313,367,453,302,117,158,320,128,-29,-502,21,480,99,423,56,394,554,-86,381,583,615,750,-404,265,-700,-34,393,513,651,459,28,-277,310,6,-1370,-300,500,900,420,551,56,682,535,-237,595,-373,95,-184,732,642,863,-328,105,870,69,-483,62,46,715,-381,238,-897,-518,206,-802,-219,684,331,-315,-444,-900,-856,291,761,159,-106,-104,353,-644,-388,-1162,-664,-34,-1125,732,471,-994,-600,-144,-136,655,-48,523,300,580,-566,620,-164,91,362,140,91,22,-117,241,-233,-16,-56,-19,84,133,214,144,28,-213,694,286,348,-11,393,-227,556,197,170,189,27,-52,-590,119,20,193,272,338,-146,227,287,-246,101,221,396,-115,-366,-6,125,116,-613,-102,-857,-253,-500,710,173,-947,-149,446,-923,-914,-625,-562,-92,-901,218,1149,269,-70,844,315,135,-282,254,616,-111,437,691,125,-217,-315,183,-109,157,216,431,443,-21,244,-359,-33,116,-205,-48,-827,-223,642,180,364,313,280,195,-7,-266,353,381,-12,21,-116,134,27,233,338,493,104,55,-302,372,-183,290,288,200,78,-174,275,33,57,379,141,46,368,196,112,234,116,545,647,284,-182,259,-424,386,-868,-359,975,362,-454,-627,-45,212,142,281,-66,412,-9,27,-1,440,331,38,431,18,-74,-53,-130,-36,-69,241,336,35,14,136,-224,-303,318,390,30,244,198,121,-523,77,-834,742,366,295,370,-520,444,256,-102,351,11,439,69,103,-783,-1307,1174,238,208,-96,586,-154,-298,1013,177,11,269,682,156,45,420,173,298,-204,507,24,461,-385,-290,365,-343,-154,-580,994,-228,-695,539,219,-685,542,-44,66,77,176,426,189,-100,-184,-313,625,378,319,435,336,-288,318,344,61,25,84,84,776,-98,349,-89,-802,-406,624,92,371,74,248,365,18,-77,79,171,-387,768,507,146,-28,160].map((x) => x / 10000);
  const MKT_L = MKT.map((x) => Math.log(1 + x)); const MKT_M = MKT_L.reduce((s, x) => s + x, 0) / MKT_L.length; const MKT_S = Math.sqrt(MKT_L.reduce((s, x) => s + (x - MKT_M) * (x - MKT_M), 0) / MKT_L.length);
  const FC_N = 10000, FC_SEED = 20261111, BLK = [6, 12];
  // one path of 60 months for the PEA: blocks of 6 to 12 consecutive historical months (wrapping round the end), so crashes, streaks and recoveries keep their order;
  // the months are then rescaled to the PEA's return and risk (history gives the shape, the assumptions give the level and the spread). Returns the 60 monthly log returns.
  function mktMonths(r, ret, vol, n) {
    n = n || FC_YEARS * 12;
    const sig = Math.sqrt(Math.log(1 + (vol * vol) / ((1 + ret) * (1 + ret)))); const m = (Math.log(1 + ret) - (sig * sig) / 2) / 12; const k = sig / Math.sqrt(12) / MKT_S; const out = [];
    while (out.length < n) { const len = BLK[0] + Math.floor(r() * (BLK[1] - BLK[0] + 1)); let j = Math.floor(r() * MKT_L.length); for (let t = 0; t < len && out.length < n; t++, j = (j + 1) % MKT_L.length) out.push(m + (MKT_L[j] - MKT_M) * k); }
    return out;
  }
  // monthly log returns cut into the periods' month counts, as one return per period
  const yearly = (L, ms) => { ms = ms || Array(FC_YEARS).fill(12); const y = []; let j = 0; ms.forEach((m) => { let s = 0; for (let t = 0; t < m; t++) s += L[j++] || 0; y.push(Math.exp(s) - 1); }); return y; };
  // stress: the PEA replays world equities from Jan 2008 (as they happened, not rescaled), every other account at its fixed rate
  const STRESS_FROM = '2008-01';
  function stressYears(ms) { const j0 = (keyY(STRESS_FROM) - keyY(MKT0)) * 12 + keyM(STRESS_FROM) - keyM(MKT0); const n = ms.reduce((a, b) => a + b, 0); return yearly(MKT_L.slice(j0, j0 + n), ms); }
  // the forecast: the expected path (every table and the identities, PEA at its return), plus 10,000 simulated PEA markets with a fixed seed for the low (P10), median (P50) and high (P90) year-end wealth,
  // the stress path, and total wealth in today's euros (inp.infl a year, counted from today)
  function forecast(inp) {
    const years = forecastPath(inp); const r = seeded(FC_SEED); const tot = years.map(() => []); const pea = (inp.accounts || []).find((a) => a.key === 'pea') || {}; const ret = +pea.ret || 0, vol = +pea.vol || 0;
    const ms = monthsOf(inp); const nm = ms.reduce((a, b) => a + b, 0);
    for (let n = 0; n < FC_N; n++) forecastPath(inp, vol > 0 ? yearly(mktMonths(r, ret, vol, nm), ms) : null, true).forEach((v, i) => tot[i].push(v));
    tot.forEach((x) => x.sort((p, q) => p - q)); const q = (x, p) => x[Math.min(x.length - 1, Math.floor(p * x.length))];
    const infl = +inp.infl || 0;
    return { y1: inp.y1, start: { ...inp.bal0, total: sumO(inp.bal0) }, years, N: FC_N, low: tot.map((x) => q(x, 0.1)), mid: tot.map((x) => q(x, 0.5)), high: tot.map((x) => q(x, 0.9)),
      stress: forecastPath(inp, stressYears(ms), true), infl, frac: periods(inp)[0].f, real: years.map((y, i) => { const t = periods(inp).slice(0, i + 1).reduce((a, p) => a + p.f, 0); return y.bal.total / Math.pow(1 + infl, t); }) };
  }
  // checks on the simulated markets (tests only): same seed same result, flows the same on every path, only the PEA moves, 60 months, P10 <= P50 <= P90, average PEA return close to its assumption
  function mcChecks(inp) {
    const bad = []; const pea = (inp.accounts || []).find((a) => a.key === 'pea') || {}; const ret = +pea.ret || 0, vol = +pea.vol || 0;
    const a = forecast(inp), b = forecast(inp); if (JSON.stringify([a.low, a.mid, a.high]) !== JSON.stringify([b.low, b.mid, b.high])) bad.push('not reproducible');
    const r = seeded(7); const ms = monthsOf(inp); const nm = ms.reduce((a, b) => a + b, 0); const L = mktMonths(r, ret, vol, nm); if (L.length !== nm) bad.push('not ' + nm + ' months');
    const base = forecastPath(inp); [yearly(mktMonths(r, ret, vol, nm), ms), yearly(mktMonths(r, ret, vol, nm), ms)].forEach((m) => { const p = forecastPath(inp, m);
      p.forEach((c, i) => { if (Math.abs(c.assets.total - base[i].assets.total) > 0.01 || Math.abs(c.in.total - base[i].in.total) > 0.01) bad.push(c.code + ': flows differ on a path');
        ACCT_ROWS.forEach((k) => { if (k !== 'pea' && Math.abs(c.bal[k] - base[i].bal[k]) > 0.01) bad.push(c.code + ': ' + k + ' moved with the market'); }); }); });
    a.low.forEach((v, i) => { if (!(v <= a.mid[i] && a.mid[i] <= a.high[i])) bad.push('year ' + (i + 1) + ': P10 <= P50 <= P90 fails'); });
    if (vol > 0) { const r2 = seeded(11); let s = 0; const n = 20000; for (let i = 0; i < n; i++) s += Math.exp(mktMonths(r2, ret, vol).slice(0, 12).reduce((p, x) => p + x, 0)) - 1; if (Math.abs(s / n - ret) > 0.005) bad.push('average PEA return ' + (s / n).toFixed(4) + ' vs ' + ret); }
    return bad;
  }
  // every identity the pages rely on; returns the failures (empty = all hold). tol in euros.
  function fcChecks(f, tol) {
    const bad = []; const t = tol == null ? 0.01 : tol; const near = (x, y) => Math.abs(x - y) <= t;
    f.years.forEach((c) => {
      if (!near(c.in.total, sumO(c.items))) bad.push(c.code + ': money in');
      if (!near(c.cost.total, BIDS.reduce((s, k) => s + c.cost[k], 0))) bad.push(c.code + ': costs');
      if (!near(c.left, c.in.total - c.cost.total)) bad.push(c.code + ': left over');
      if (!near(c.assets.total, c.left)) bad.push(c.code + ': to assets is not left over');
      if (!near(c.start.total + c.assets.total + c.gain.total, c.bal.total)) bad.push(c.code + ': start + paid in + gain is not end');
    });
    f.years.forEach((c, i) => { if (i && !near(f.years[i - 1].bal.total, c.start.total)) bad.push(c.code + ': start is not last year end'); });
    if (f.years.length && !near(f.start.total, f.years[0].start.total)) bad.push('first year does not start from today');
    return bad;
  }
  // first-time annual assumptions from the old monthly ones: costs = usual month x 12 per bucket plus the dated cost lines, income = pay, bonus, participation and the dated income
  // usualCats: { category: monthly amount }; pay: { net, bonusNet } from the payslip settings. Pure: the caller saves the result.
  function seedAnnual(a, usualCats, pay, netPay, y1) {
    const covered = new Set((a.lines || []).filter((l) => l.on !== false && l.kind === 'cost' && l.cat).map((l) => l.cat)); const per = {}; BIDS.forEach((k) => { per[k] = 0; });
    new Set([...Object.keys(usualCats || {}), ...Object.keys(a.costs || {})]).forEach((c) => { const k = C.bucket6Of(c); if (!k || /Card bill/.test(c) || covered.has(c)) return; const o = (a.costs || {})[c] || {}; if (o.on === false) return;
      per[k] += (o.budget != null && o.budget !== '' ? +o.budget : (usualCats || {})[c] || 0) * 12; });
    const live = (l) => l.on !== false && (!l.from || keyY(l.from) <= y1) && (!l.to || keyY(l.to) >= y1); const nOf = (l) => (l.months || []).length; const inc = []; const g = (a.general || {}); let taxSaved = 0;
    (a.lines || []).filter(live).forEach((l) => { const v = (+l.amount || 0) * nOf(l); if (!v) return;
      if (l.kind === 'cost') { per[l.bucket || C.bucket6Of(l.cat || '') || 'lifestyle'] += v; taxSaved += (+l.deduct || 0) * nOf(l) * (g.mr != null ? +g.mr : 0.3); }
      else if (l.kind === 'in') inc.push({ id: 'i' + l.id, name: l.name || 'Income', amount: Math.round(v), from: y1, growth: +l.growth || 0, acct: ACCT_ROWS.includes(l.acct) && l.acct !== 'cash' ? l.acct : null }); });
    const I = a.income || {}, np = I.netPay || {}, bo = I.bonus || {}, pt = I.part || {}; const g0 = +np.growth || 0;
    const pay0 = np.month != null && np.month !== '' ? +np.month : pay && pay.net ? pay.net : netPay || 0; const bonus0 = bo.year != null && bo.year !== '' ? +bo.year : pay && pay.bonusNet ? pay.bonusNet : 0;
    const head = [{ id: 'pay', name: 'Net pay', amount: Math.round(pay0 * 12), from: y1, growth: g0, acct: null }];
    if (bonus0) head.push({ id: 'bonus', name: 'Bonus', amount: Math.round(bonus0), from: y1, growth: +bo.growth || 0, acct: null });
    if (+pt.year) head.push({ id: 'part', name: 'Participation', amount: Math.round(+pt.year), from: y1, growth: +pt.growth || 0, acct: 'pee' });
    if (taxSaved > 0) inc.push({ id: 'taxsaved', name: 'Tax saved on support to parents', amount: Math.round(taxSaved), from: y1, growth: 0, acct: null });
    const costs = BIDS.map((k) => ({ id: 'c' + k, bucket: k, amount: Math.round(per[k]), from: y1, growth: g.infl != null ? +g.infl : 0.02 }));
    return { inc: head.concat(inc), costs };
  }
  // an actual column (closed cycle, or the current cycle so far) from a statement
  const LOCK_PC = /PERCOL|PER COL/i;
  function colFromStatement(st, key, kind, txs) {
    const by = st.byCat || {}; const oth = by['Other income & refunds'] || 0; const direct = st.income.direct || 0; const cost = zeroCost(); const cats = {};
    Object.entries(by).forEach(([c, v]) => { const b = C.bucket6Of(c); if (b && v) { cost[b] += -v; cats[c] = (cats[c] || 0) - v; } });
    const costT = sumO(cost); const w = st.where; let pc = 0; (txs || []).filter((t) => t.month === key && t.cat === 'Epsor (PEE / PERCOL)' && t.amt < 0 && LOCK_PC.test(`${t.desc} ${(t.det || []).join(' ')}`)).forEach((t) => { pc += -t.amt; });
    pc += w.lockedPc || 0; const assets = { cash: w.cur, la: w.la, ld: w.ldds, pea: w.pea, pee: w.locked - pc, pc, other: 0 }; Object.entries(w.extra || {}).forEach(([k, v]) => { assets[k] = (assets[k] || 0) + v; });
    return { key, kind, code: colCode(key, kind), in: { pay: st.income.spendable - oth, bonus: st.income.bonus, other: oth + direct, total: st.income.total }, cost: { ...cost, total: costT }, cats, left: st.left, direct: { ...zeroA(), ...(st.income.directBy || { pee: direct }) }, assets: { ...assets, total: sumO(assets) } };
  }

  const Model = { setRows, extraKeys, BASE_ROWS, defaultPay, payCalc, BUCKETS, SPEND, DEFAULT_MAP, RENAMED, NOFLAG, bucketOf, flaggable, monthPL, salaryRefs, runRate, suggestOneoffs, defaults, defaultAssume, migrate, mergeConfig, fromPrevious, A_VERSION, MN, colCode, yearCode, fyOf, ACCT_ROWS, FC_YEARS, balRows, lineAt, forecast, forecastPath, fcChecks, mcChecks, mktMonths, seedAnnual, colFromStatement, seeded, gauss };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model; else root.Model = Model;
})(typeof window !== 'undefined' ? window : globalThis);

