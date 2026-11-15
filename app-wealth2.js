'use strict';
  // ---------- Wealth: one page. Total, split in four groups, by account (actual, today, forecast year-ends), returns, goals, Paul, family and tax ----------
  // Actual columns come from the balances typed at each cycle close; F columns are fcRun(), the same figures as the Forecast tab on Over time.
  const WG = [['cash', 'Current accounts'], ['la', 'Livret A'], ['ld', 'LDDS'], ['pea', 'PEA'], ['other', 'Other investments'], ['pee', 'PEE'], ['pc', 'PERCOL'], ['dep', 'Rent deposit']].map(([k, l]) => [k, l, FC_GRP.find((g) => g[2].includes(k))[0]]);
  const WLQ = FC_GRP.map(([k, l]) => [k, l]);
  const wGroupOf = (a) => (a.tier === 'receivable' ? null : a.tier === 'cash' ? 'cash' : WG.some(([k]) => k === a.key) ? a.key : 'dep');
  // balances by group: from a snapshot point, or today's typed balances
  function wBal(pt) { const o = {}; WG.forEach(([k]) => { o[k] = null; }); let any = false;
    S.cfg.accounts.filter((a) => a.tier !== 'receivable').forEach((a) => { const g = wGroupOf(a); if (!g) return; const v = pt ? pt[a.key] : +a.balance || 0; if (v == null) return; o[g] = (o[g] || 0) + +v; any = true; });
    if (!any) return null; o.total = pt && pt.nw != null ? +pt.nw : C.sum(WG, ([k]) => o[k] || 0); return o; }
  // an account's balance at a past cycle end when no check-in was made then. Sources, in order:
  // 1 a statement covering that day (its closing less the lines after the day); 2 for the Livret A, the nearest known balance before it plus the transfers since;
  // 3 the automatic statement balances (snapshots.auto); 4 a past balance you typed on the account (a.past = { bal, until: last cycle it applies to }). Unknown stays blank.
  const wStKey = (st) => st.acctKey || ({ REV: 'rev', TR: 'tr' })[st.account] || (String(st.account).startsWith('SG') && st.role !== 'savings' ? 'sg' : null);
  function wLaAt(end) {
    const an = []; Object.values(S.stmts || {}).filter((x) => x.acctKey === 'la').forEach((x) => { if (x.closing != null) an.push([x.to, +x.closing]); (x.checkpoints || []).forEach((c) => an.push([c.date, +c.bal])); });
    Object.entries((S.snapshots || {}).auto || {}).forEach(([d, v]) => { if (v && v.la != null) an.push([d, +v.la]); }); Object.entries((S.snapshots || {}).points || {}).forEach(([d, v]) => { if (v && v.la != null) an.push([d, +v.la]); });
    const ex = an.find((a) => a[0] === end); if (ex) return ex[1]; const before = an.filter((a) => a[0] < end).sort((p, q) => p[0].localeCompare(q[0])).pop(); if (!before) return null;
    return C.r2(before[1] + C.sum(D.txs.filter((t) => t.cat === 'Livret A' && t.date > before[0] && t.date <= end), (t) => -t.amt));
  }
  function wAcctAt(a, end, k) {
    const st = Object.values(S.stmts || {}).filter((x) => x.closing != null && wStKey(x) === a.key && x.from <= end && x.to >= end).sort((p, q) => q.to.localeCompare(p.to))[0];
    if (st) return C.r2(st.closing - C.sum((st.tx || []).filter((t) => t.date > end), (t) => +t.amt || 0));
    if (a.key === 'la') { const v = wLaAt(end); if (v != null) return v; }
    const au = ((S.snapshots || {}).auto || {})[end]; if (au && au[a.key] != null) return +au[a.key];
    if (a.past && k <= a.past.until) return +a.past.bal || 0;
    return null;
  }
  // balances by row at a past cycle end; a row (and the total) stays blank when one of its accounts is unknown
  function wHistBal(end, k) {
    const o = {}; WG.forEach(([k]) => { o[k] = 0; }); const miss = new Set(); let any = false;
    S.cfg.accounts.filter((a) => a.tier !== 'receivable').forEach((a) => { const g = wGroupOf(a); if (!g) return; const v = wAcctAt(a, end, k);
      if (v == null) { if (Math.abs(+a.balance || 0) >= 0.5) miss.add(g); return; } o[g] += v; any = true; });
    if (!any) return null; miss.forEach((g) => { o[g] = null; }); o.total = miss.size ? null : C.sum(WG, ([k]) => o[k] || 0); o.est = true; return o;
  }
  const W_START = '2026-05'; // Wealth history starts with the May26 cycle
  function wCols() {
    const th = tmThis(); const pts = (S.snapshots && S.snapshots.points) || {}; const cols = [];
    D.complete.filter((k) => k >= W_START && k < th).forEach((k) => { const end = C.monthRange(k, S.cfg.cutoff).to; const d = Object.keys(pts).filter((x) => x <= end && x > C.monthRange(k, S.cfg.cutoff).from).sort().pop();
      cols.push({ key: k, h: otCode(k, 'A'), kind: 'A', b: d ? wBal(pts[d]) : wHistBal(end, k), col: tmFromStmt(k), raw: M.colFromStatement(stmtOf(k), k, 'A', D.txs) }); });
    cols.push({ key: th, h: otCode(th, 'C'), kind: 'C', b: wBal(null), cls: 'tm-now', raw: M.colFromStatement(stmtOf(th), th, 'C', D.txs), est: true });
    const f = fcRun(); f.years.forEach((y, i) => { const b = {}; WG.forEach(([k]) => { b[k] = y.bal[k] || 0; }); b.total = y.bal.total;
      cols.push({ key: 'y' + y.y, h: y.code, kind: 'F', cls: 'tm-plan', b, paid: y.assets, gain: y.gain, lo: f.low[i], hi: f.high[i], real: f.real[i] }); });
    // actual returns: paid in from the statements, gain = end - start - paid in (blank until both balances exist)
    cols.forEach((c, i) => { if (c.kind !== 'A' && c.kind !== 'C') return; c.paid = { ...c.raw.assets }; const p = cols[i - 1]; c.gain = null;
      if (p && p.b && c.b && p.kind === 'A') { c.gain = {}; WG.forEach(([k]) => { c.gain[k] = c.b[k] == null || p.b[k] == null ? null : c.b[k] - p.b[k] - (c.paid[k] || 0); }); const full = WG.every(([k]) => k === 'cash' || (p.b[k] == null) === (c.b[k] == null) || Math.abs(c.b[k] || 0) < 0.5); c.gain.total = full && c.b.total != null && p.b.total != null ? c.b.total - p.b.total - C.sum(WG, ([k]) => c.paid[k] || 0) : null; } });
    return cols;
  }
  const wN = (v, tot) => (v == null ? '' : tmNum(v, tot));
  function wTable(cols, rows) {
    const head = `<tr><th scope="col" class="tm-l">EUR</th>${cols.map((c) => `<th scope="col" class="num ${c.cls || ''}">${c.kind === 'A' ? `<button type="button" class="tm-hb" data-act="tm-month" data-m="${c.key}">${esc(c.h)}</button>` : esc(c.h)}</th>`).join('')}</tr>`;
    const body = rows.map(([lab, get, cls]) => (get === 'h' ? `<tr class="tm-g"><th scope="rowgroup" class="tm-l">${lab}</th><td colspan="${cols.length}"></td></tr>` : `<tr class="${cls || ''}"><th scope="row" class="tm-l">${esc(lab)}</th>${cols.map((c) => `<td class="num ${c.cls || ''}">${wN(get(c), cls === 'tot')}</td>`).join('')}</tr>`)).join('');
    return `<div class="tm-w ot-w w-w"><table class="tm-t ot-t"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function wChart(el, cols) {
    const known = (c) => (c.b.total != null ? c.b.total : C.sum(WG, ([k]) => c.b[k] || 0)); const pts = cols.filter((c) => c.b && known(c) > 0); if (pts.length < 3) { el.innerHTML = '<p class="muted sm">Needs three balances.</p>'; return; }
    const W = Math.max(300, el.clientWidth || 640), H = 250, m = { l: 56, r: 72, t: 20, b: 26 }; const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vals = pts.map(known).concat(pts.map((c) => c.hi).filter((x) => x != null)); const tk = niceTicks(Math.min(0, ...vals), Math.max(1, ...vals), 4); const top = tk[tk.length - 1], bot = tk[0];
    const y = (x) => m.t + ph - ((x - bot) / (top - bot || 1)) * ph; const bw = pw / pts.length; const step = Math.ceil(pts.length / 12); let g = '';
    tk.forEach((t) => { g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${esc(compact(t))}</text>`; });
    g += `<defs><pattern id="w-h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="w-hl" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>`;
    const ci = pts.findIndex((c) => c.kind === 'C'), near = Math.ceil(46 / bw); const lab = new Set(pts.map((c, i) => i).filter((i) => (i % step === 0 || i === pts.length - 1) && (ci < 0 || Math.abs(i - ci) >= near))); if (ci >= 0) lab.add(ci); if (pts.length - 1 !== ci) [...lab].forEach((i) => { if (i !== pts.length - 1 && i !== ci && pts.length - 1 - i < near) lab.delete(i); });
    pts.forEach((c, i) => { const x0 = m.l + i * bw + bw * 0.2, w = bw * 0.6, cx = x0 + w / 2; const v = known(c); const gs = fcGroups(c.b); let acc = 0; const op = c.kind === 'A' ? (c.b.total != null ? 1 : 0.5) : c.kind === 'C' ? 0.85 : 0.45;
      FC_GRP.forEach(([k, l, , col]) => { const gv = Math.max(0, gs[k] || 0); if (gv < 0.5) return; g += `<rect x="${x0.toFixed(1)}" y="${y(acc + gv).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.5, y(acc) - y(acc + gv)).toFixed(1)}" fill="${col}" opacity="${op}"><title>${esc(c.h)}, ${esc(l)}: ${esc(eur(gv))}</title></rect>`; acc += gv; });
      if (c.kind === 'C') g += `<rect x="${x0.toFixed(1)}" y="${y(acc).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y(0) - y(acc)).toFixed(1)}" fill="url(#w-h)" opacity=".5"/>`;
      if (c.lo != null && c.hi != null) g += `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(c.lo).toFixed(1)}" y2="${y(c.hi).toFixed(1)}" class="w-rng"/><line x1="${(cx - 4).toFixed(1)}" x2="${(cx + 4).toFixed(1)}" y1="${y(c.lo).toFixed(1)}" y2="${y(c.lo).toFixed(1)}" class="w-rng"/><line x1="${(cx - 4).toFixed(1)}" x2="${(cx + 4).toFixed(1)}" y1="${y(c.hi).toFixed(1)}" y2="${y(c.hi).toFixed(1)}" class="w-rng"/>`;
      if (c.kind === 'C') g += `<line class="today" x1="${(m.l + (i + 1) * bw).toFixed(1)}" x2="${(m.l + (i + 1) * bw).toFixed(1)}" y1="${m.t}" y2="${m.t + ph}"/>`;
      if (lab.has(i)) g += `<text class="axis" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(c.h.replace(/[ABC]$/, ''))}</text>`;
      if (i === pts.length - 1) { let a2 = 0; FC_GRP.forEach(([k, l]) => { const gv = Math.max(0, gs[k] || 0); if (y(a2) - y(a2 + gv) >= 9) g += `<text class="axis" x="${(x0 + w + 4).toFixed(1)}" y="${(y(a2 + gv / 2) + 4).toFixed(1)}">${esc(l.split(' ')[0])}</text>`; a2 += gv; }); } });
    const rp = pts.map((c, i) => (c.real != null ? `${(m.l + i * bw + bw / 2).toFixed(1)},${y(c.real).toFixed(1)}` : null)).filter(Boolean); if (rp.length > 1) g += `<polyline class="w-real" points="${rp.join(' ')}"/>`;
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Total wealth by cycle and year end">${g}</svg><p class="muted sm ot-key">Solid: actual. Faded: some accounts unknown. Hatched: today. Light: forecast, with the P10–P90 range. Dashed: forecast in today's money.</p>`;
  }
  function paulCard() {
    const p = D.paul; if (!p) return ''; const th = tmThis(); const ks = D.complete.filter((k) => k >= MONTH_START).concat([th]);
    const sent = ks.map((k) => ({ k, v: -C.sum(D.txs.filter((t) => t.month === k && t.cat === 'Paid for Paul' && t.amt < 0), (t) => t.amt) }));
    const mx = Math.max(1, ...sent.map((x) => x.v));
    const bars = sent.some((x) => x.v > 0) ? `<div class="pl-bars">${sent.map((x, i) => `<div class="pl-b"><div class="pl-f" style="height:${Math.round((x.v / mx) * 100)}%"></div><span class="axis">${sent.length > 8 && (sent.length - 1 - i) % 2 ? '&nbsp;' : esc(otCode(x.k, '').slice(0, 5))}</span></div>`).join('')}</div>` : '';
    return `<section class="card"><div class="card-h"><h2>Paul</h2><span class="muted sm">Not in net worth</span></div>${bars}
      <table class="tm-t ot-t w-kv"><tbody><tr><th class="tm-l">Sent since ${esc(fmtDate(p.asOf))}</th><td class="num">${tmNum(p.sent)}</td></tr><tr><th class="tm-l">Repaid</th><td class="num">${tmNum(p.back)}</td></tr><tr class="tot"><th class="tm-l">Balance today</th><td class="num">${tmNum(p.owed, true)}</td></tr></tbody></table></section>`;
  }
  function famCard() {
    const cfg = S.cfg; const y = D.today.slice(0, 4); const par = -C.sum(D.txs.filter((t) => t.cat === 'Support for parents' && t.date.slice(0, 4) === y && t.amt < 0), (t) => t.amt);
    const cap = +cfg.parentsCap > 0 ? +cfg.parentsCap : 7200; const mr = cfg.assume && cfg.assume.general.mr != null ? cfg.assume.general.mr : 0.3; const ded = Math.min(par, cap);
    return `<section class="card"><div class="card-h"><h2>Family and tax</h2><span class="muted sm">Support to parents, ${y}</span></div>
      <table class="tm-t ot-t w-kv"><tbody><tr><th class="tm-l">Paid this year</th><td class="num">${tmNum(par)}</td></tr><tr><th class="tm-l">Ceiling</th><td class="num">${tmNum(cap)}</td></tr><tr><th class="tm-l">Room left</th><td class="num">${tmNum(Math.max(0, cap - par))}</td></tr><tr class="tot"><th class="tm-l">Tax saved at ${Math.round(mr * 100)}%</th><td class="num">${tmNum(ded * mr, true)}</td></tr></tbody></table></section>`;
  }
  function vWorth() {
    if (!D.keys.length) return emptyState(); const cols = wCols(); const cur = cols.find((c) => c.kind === 'C'); const lastA = cols.filter((c) => c.kind === 'A' && c.b && c.b.total != null).pop();
    const nw = cur.b ? cur.b.total : D.nw; const ch = lastA ? nw - lastA.b.total : null;
    // liquidity
    const lq = WLQ.map(([k, l]) => ({ k, l, v: C.sum(WG.filter((g) => g[2] === k), ([g]) => cur.b[g] || 0) })).filter((x) => Math.abs(x.v) >= 0.5); const lt = C.sum(lq, (x) => Math.max(0, x.v)) || 1;
    // today, by account: each account with a balance, grouped by how fast it can be reached (same balances as the Nov26C column)
    const acs = S.cfg.accounts.filter((a) => a.tier !== 'receivable' && wGroupOf(a)).map((a) => ({ n: a.name.replace(/\s*••\d+/, ''), v: +a.balance || 0, q: WG.find((g) => g[0] === wGroupOf(a))[2] })).filter((a) => Math.abs(a.v) >= 0.5);
    const amx = Math.max(1, ...acs.map((a) => a.v)); const pct = (v) => `${Math.round((v / lt) * 100)}%`;
    const lqBar = (v, i) => `<span class="lq-tr"><span class="lq-f lq-c${i}" style="width:${Math.max(0, (v / amx) * 100).toFixed(1)}%"></span></span>`;
    const liq = `<div class="lq-list">${lq.map((x) => { const i = WLQ.findIndex((w) => w[0] === x.k); const mine = acs.filter((a) => a.q === x.k); const one = mine.length === 1 || x.k === 'cur'; const solo = mine.length === 1;
        return `<div class="lq-row lq-g"><span class="lq-n"><i class="lq-dot lq-c${i}"></i>${esc(x.l)}${solo ? `<span class="muted">${esc(mine[0].n)}</span>` : ''}</span>${one ? lqBar(x.v, i) : '<span></span>'}<span class="num">${tmNum(x.v, true)}</span><span class="num muted">${pct(x.v)}</span></div>${one ? '' : mine.map((a) => `<div class="lq-row lq-a"><span class="lq-n">${esc(a.n)}</span>${lqBar(a.v, i)}<span class="num">${tmNum(a.v)}</span><span class="num muted">${pct(a.v)}</span></div>`).join('')}`; }).join('')}</div>`;
    const has = (k) => cols.some((c) => c.b && Math.abs(c.b[k] || 0) >= 0.5);
    const rows = WG.filter(([k]) => has(k)).map(([k, l]) => [l, (c) => (c.b ? c.b[k] : null)]).concat([['Total wealth', (c) => (c.b ? c.b.total : null), 'tot'], ["Total wealth, today's money", (c) => (c.kind === 'F' ? c.real : null), ''], ['Wealth low (P10)', (c) => (c.kind === 'F' ? c.lo : 0), ''], ['Wealth high (P90)', (c) => (c.kind === 'F' ? c.hi : 0), '']]);
    const rr = []; WG.filter(([k]) => has(k) && k !== 'dep').forEach(([k, l]) => { rr.push([l, 'h'], ['Paid in', (c) => (c.paid ? c.paid[k] || 0 : null)], ['Gain', (c) => (c.gain && k !== 'cash' ? c.gain[k] : null)]); });
    rr.push(['Total', 'h'], ['Paid in', (c) => (c.paid ? C.sum(WG, ([k]) => c.paid[k] || 0) : null), 'tot'], ['Gain', (c) => (c.gain ? c.gain.total : null), 'tot']);
    return `<section class="card w-tot"><div class="card-h"><h2>Net worth</h2></div>
        <div class="w-hero"><div class="w-fig"><span class="w-lbl">As of ${esc(fmtDate(D.today))}, EUR</span><b class="w-big">${tmNum(nw, true)}</b></div></div>
        ${liq}</section>
      <section class="card"><div class="card-h"><h2>By account</h2><span class="muted sm">Actual, today, then year ends</span></div><div class="chart-w" id="w-chart"></div>${wTable(cols, rows)}</section>
      <section class="card"><details class="w-ret" data-k="w-ret"${ui.dOpen['w-ret'] ? ' open' : ''}><summary class="card-h"><h2>Returns</h2><span class="muted sm">Start + paid in + gain = end</span></summary>${wTable(cols, rr)}</details></section>
      ${goalsCard()}
      <div class="grid2 even">${paulCard()}${famCard()}</div>${balSheetHtml()}`;
  }
  after.worth = () => {
    const cols = wCols(); const el = document.getElementById('w-chart'); if (el) wChart(el, cols);
    document.querySelectorAll('.w-w').forEach((w) => { const nc = w.querySelector('thead th.tm-now'); if (nc) w.scrollLeft = Math.max(0, nc.offsetLeft + nc.offsetWidth - w.clientWidth / 2); });
  };
