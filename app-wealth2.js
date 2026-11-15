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
  // ---------- balances by roll-forward ----------
  // Each actual column's balance = the previous column's balance + the moves into each account from the statements (MTD for today), then reconciled to the balances
  // the statements and your check-ins give (the "source"):
  //  - market-valued accounts (PEA, PEE, PERCOL, other investments, assets you added): the difference is the market gain, booked by itself;
  //  - current accounts, Livret A, LDDS: the difference stays open until you book it (interest, a missed line...) on the Reconcile card; booked amounts are kept in overrides.recon.
  // The first column (and an account seen for the first time) starts from its source balance. With no source, the rolled balance stands (marked estimated).
  const W_BOOK = ['cash', 'la', 'ld']; const W_TOL = 1;
  function wActCols() {
    const th = tmThis(); const pts = (S.snapshots && S.snapshots.points) || {}; const cols = []; const book = (S.overrides && S.overrides.recon) || {};
    D.complete.filter((k) => k >= W_START && k < th).forEach((k) => { const R = C.monthRange(k, S.cfg.cutoff); const d = Object.keys(pts).filter((x) => x <= R.to && x > R.from).sort().pop();
      cols.push({ key: k, h: otCode(k, 'A'), kind: 'A', s: d ? wBal(pts[d]) : wHistBal(R.to, k), col: tmFromStmt(k), raw: M.colFromStatement(stmtOf(k), k, 'A', D.txs) }); });
    cols.push({ key: th, h: otCode(th, 'C'), kind: 'C', s: wBal(null), cls: 'tm-now', raw: M.colFromStatement(stmtOf(th), th, 'C', D.txs), est: true });
    cols.forEach((c, i) => { const p = cols[i - 1]; const src = c.s || {}; c.paid = {}; WG.forEach(([k]) => { c.paid[k] = k === 'dep' ? 0 : +(c.raw.assets[k] || 0); });
      c.b = {}; c.roll = {}; c.diff = {}; c.gain = {}; c.open = {}; c.estK = {}; const bk = book[c.key] || {};
      WG.forEach(([k]) => { const sv = src[k] != null ? +src[k] : null;
        if (!p || p.b[k] == null) { c.b[k] = sv; c.gain[k] = null; if (p && sv != null) c.roll[k] = null; return; }
        const roll = p.b[k] + c.paid[k]; c.roll[k] = roll; const d = sv == null ? null : sv - roll; c.diff[k] = d;
        if (!W_BOOK.includes(k)) { c.gain[k] = d == null ? 0 : d; if (d == null && Math.abs(roll) >= 0.5) c.estK[k] = true; }
        else { const bv = bk[k] != null ? +bk[k] : 0; c.gain[k] = bv; c.open[k] = d == null ? null : Math.abs(d - bv) >= W_TOL ? d - bv : 0; }
        c.b[k] = roll + c.gain[k]; });
      c.b.total = C.sum(WG, ([k]) => c.b[k] || 0); c.paid.total = C.sum(WG, ([k]) => c.paid[k] || 0); c.gain.total = p ? C.sum(WG, ([k]) => c.gain[k] || 0) : null;
      c.est = c.kind === 'C' || Object.keys(c.estK).length > 0; });
    return cols;
  }
  function wCols() {
    const cols = wActCols(); const f = fcRun(); f.years.forEach((y, i) => { const b = {}; WG.forEach(([k]) => { b[k] = y.bal[k] || 0; }); b.total = y.bal.total;
      cols.push({ key: 'y' + y.y, h: y.code, kind: 'F', cls: 'tm-plan', b, paid: y.assets, gain: y.gain, lo: f.low[i], hi: f.high[i], real: f.real[i] }); });
    return cols;
  }
  // one account between two cycle ends, for the Reconcile detail: its balance at each end and where it came from, and its own statement lines between the two dates
  function wAcctSrc(a, end, k) { const pts = (S.snapshots && S.snapshots.points) || {}; const R = C.monthRange(k, S.cfg.cutoff); const d = Object.keys(pts).filter((x) => x <= R.to && x > R.from).sort().pop();
    if (d && pts[d][a.key] != null) return { v: +pts[d][a.key], how: 'check-in ' + fmtDate(d) + (d !== end ? ' (not the cycle end)' : '') + (isUsd(a) ? ', USD at that day\'s typed rate' : '') };
    const st = Object.values(S.stmts || {}).filter((x) => x.closing != null && wStKey(x) === a.key && x.from <= end && x.to >= end).sort((p, q) => q.to.localeCompare(p.to))[0];
    if (st) return { v: C.r2(st.closing - C.sum((st.tx || []).filter((t) => t.date > end), (t) => +t.amt || 0)), how: 'statement to ' + fmtDate(st.to) + ', less lines after ' + fmtDate(end) };
    const v = wAcctAt(a, end, k); return v == null ? { v: null, how: 'no statement covers ' + fmtDate(end) } : { v, how: 'automatic or typed past balance' }; }
  function wAcctLines(a, from, to) { const m = new Map(); Object.values(S.stmts || {}).filter((x) => wStKey(x) === a.key).forEach((x) => (x.tx || []).forEach((t) => { if (t.date > from && t.date <= to) m.set(t.id || t.date + t.amt + t.desc, t); })); return [...m.values()]; }
  function reconDetail(c, k, prevKey) {
    if (!prevKey) return ''; const e0 = C.monthRange(prevKey, S.cfg.cutoff).to, e1 = c.kind === 'C' ? D.today : C.monthRange(c.key, S.cfg.cutoff).to;
    const accs = S.cfg.accounts.filter((a) => a.tier !== 'receivable' && wGroupOf(a) === k);
    const rows = accs.map((a) => { const s0 = wAcctSrc(a, e0, prevKey), s1 = c.kind === 'C' ? { v: +a.balance || 0, how: 'balance today' + (a.asOf ? ' (as of ' + fmtDate(a.asOf) + ')' : '') } : wAcctSrc(a, e1, c.key); const ls = wAcctLines(a, e0, e1); const mv = C.sum(ls, (t) => +t.amt || 0);
      const fx = C.sum(ls.filter((t) => /Exchange rate effect/.test(t.desc || '')), (t) => +t.amt || 0); const exp = s0.v == null ? null : s0.v + mv; const d = exp == null || s1.v == null ? null : s1.v - exp;
      return `<tr><th scope="row" class="tm-l">${esc(a.name.replace(/\s*••\d+/, ''))}${isUsd(a) ? ' <span class="muted">USD</span>' : ''}</th><td class="num">${tmNum(s0.v)}</td><td class="num">${tmNum(mv)}${Math.abs(fx) >= 0.5 ? `<small>FX ${tmNum(fx)}</small>` : ''}</td><td class="num">${tmNum(s1.v)}</td><td class="num">${tmNum(d, true)}</td></tr><tr class="muted sm"><td colspan="5">${esc(fmtDate(e0))}: ${esc(s0.how)} · ${esc(fmtDate(e1))}: ${esc(s1.how)} · ${ls.length} lines</td></tr>`; }).join('');
    return `<details class="w-rd"><summary class="sm">By account, ${esc(fmtDate(e0))} → ${esc(fmtDate(e1))}</summary><div class="tm-w"><table class="tm-t ot-t"><thead><tr><th class="tm-l">Account</th><th class="num">Start</th><th class="num">Its lines</th><th class="num">End</th><th class="num">Gap</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted sm">Gap ≠ 0 on one account: a line missing from its statement or the balance taken on another day. All gaps 0 but a difference above: a move between these accounts and another group (savings, investments) that the plan does not see, or a cost in "Between my accounts".</p></details>`;
  }
  // open differences on current accounts, Livret A and LDDS: rolled balance vs the statement / check-in, with a button to book each one
  function reconCard(cols) {
    const items = []; cols.filter((c) => c.kind !== 'F').forEach((c) => W_BOOK.forEach((k) => { const o = c.open && c.open[k]; if (o != null && Math.abs(o) >= W_TOL) items.push({ c, k, o }); }));
    const lab = (k) => (WG.find((g) => g[0] === k) || [0, k])[1]; const booked = (S.overrides && S.overrides.recon) || {};
    const nb = Object.values(booked).reduce((n, x) => n + Object.keys(x || {}).length, 0);
    const rows = items.map(({ c, k, o }) => { const i = cols.indexOf(c); const pk = i > 0 ? cols[i - 1].key : null;
      return `<tr><th scope="row" class="tm-l">${esc(lab(k))} · ${esc(c.h)}</th><td class="num">${tmNum(c.roll[k])}</td><td class="num">${tmNum(c.s[k])}</td><td class="num">${tmNum(o, true)}</td><td><button type="button" class="btn sm" data-act="w-book" data-m="${c.key}" data-k="${k}" data-v="${C.r2(o)}">Book</button></td></tr><tr><td colspan="5">${reconDetail(c, k, pk)}</td></tr>`; }).join('');
    return `<section class="card" id="w-recon"><div class="card-h"><h2>Reconcile</h2><span class="muted sm">Rolled balance vs statements and check-ins</span></div>
      ${items.length ? `<div class="tm-w"><table class="tm-t ot-t"><thead><tr><th class="tm-l">Account · cycle</th><th class="num">Rolled</th><th class="num">Statement</th><th class="num">Difference</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted sm">Book a difference as interest or an adjustment; it then rolls into every later balance. Investments reconcile by themselves (the difference is the market gain).</p>` : '<p class="muted sm">All balances tie to the statements and check-ins.</p>'}
      ${nb ? `<p class="sm"><button type="button" class="btn sm ghost" data-act="w-unbook">Clear ${nb} booked adjustment${nb > 1 ? 's' : ''}</button></p>` : ''}</section>`;
  }
  document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-act="w-book"],[data-act="w-unbook"]'); if (!b) return; S.overrides.recon = S.overrides.recon || {};
    if (b.dataset.act === 'w-unbook') { const old = S.overrides.recon; S.overrides.recon = {}; persist('overrides'); changed(); toast('Adjustments cleared', () => { S.overrides.recon = old; persist('overrides'); changed(); }); return; }
    const m = b.dataset.m, k = b.dataset.k, v = +b.dataset.v; const r = (S.overrides.recon[m] = S.overrides.recon[m] || {}); r[k] = C.r2((+r[k] || 0) + v); persist('overrides'); changed(); toast('Booked ' + eur(v, 2)); });
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
    pts.forEach((c, i) => { const x0 = m.l + i * bw + bw * 0.2, w = bw * 0.6, cx = x0 + w / 2; const v = known(c); const gs = fcGroups(c.b); let acc = 0; const op = c.kind === 'A' ? (c.est ? 0.5 : 1) : c.kind === 'C' ? 0.85 : 0.45;
      FC_GRP.forEach(([k, l, , col]) => { const gv = Math.max(0, gs[k] || 0); if (gv < 0.5) return; g += `<rect x="${x0.toFixed(1)}" y="${y(acc + gv).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.5, y(acc) - y(acc + gv)).toFixed(1)}" fill="${col}" opacity="${op}"><title>${esc(c.h)}, ${esc(l)}: ${esc(eur(gv))}</title></rect>`; acc += gv; });
      if (c.kind === 'C') g += `<rect x="${x0.toFixed(1)}" y="${y(acc).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y(0) - y(acc)).toFixed(1)}" fill="url(#w-h)" opacity=".5"/>`;
      if (c.lo != null && c.hi != null) g += `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(c.lo).toFixed(1)}" y2="${y(c.hi).toFixed(1)}" class="w-rng"/><line x1="${(cx - 4).toFixed(1)}" x2="${(cx + 4).toFixed(1)}" y1="${y(c.lo).toFixed(1)}" y2="${y(c.lo).toFixed(1)}" class="w-rng"/><line x1="${(cx - 4).toFixed(1)}" x2="${(cx + 4).toFixed(1)}" y1="${y(c.hi).toFixed(1)}" y2="${y(c.hi).toFixed(1)}" class="w-rng"/>`;
      if (c.kind === 'C') g += `<line class="today" x1="${(m.l + (i + 1) * bw).toFixed(1)}" x2="${(m.l + (i + 1) * bw).toFixed(1)}" y1="${m.t}" y2="${m.t + ph}"/>`;
      if (lab.has(i)) g += `<text class="axis" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(c.h.replace(/[ABC]$/, ''))}</text>`;
      if (i === pts.length - 1) { let a2 = 0; FC_GRP.forEach(([k, l]) => { const gv = Math.max(0, gs[k] || 0); if (y(a2) - y(a2 + gv) >= 9) g += `<text class="axis" x="${(x0 + w + 4).toFixed(1)}" y="${(y(a2 + gv / 2) + 4).toFixed(1)}">${esc(l.split(' ')[0])}</text>`; a2 += gv; }); } });
    const rp = pts.map((c, i) => (c.real != null ? `${(m.l + i * bw + bw / 2).toFixed(1)},${y(c.real).toFixed(1)}` : null)).filter(Boolean); if (rp.length > 1) g += `<polyline class="w-real" points="${rp.join(' ')}"/>`;
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Total wealth by cycle and year end">${g}</svg><p class="muted sm ot-key">Solid: actual, rolled forward and reconciled. Faded: some balances only rolled, no statement yet. Hatched: today. Light: forecast, with the P10–P90 range. Dashed: forecast in today's money.</p>`;
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
    const rr = []; WG.filter(([k]) => has(k) && k !== 'dep').forEach(([k, l]) => { rr.push([l, 'h'], ['Paid in', (c) => (c.paid ? c.paid[k] || 0 : null)], [W_BOOK.includes(k) ? 'Interest and adjustments' : 'Gain', (c) => (c.gain ? c.gain[k] : null)]); if (W_BOOK.includes(k)) rr.push(['Not reconciled', (c) => (c.open ? c.open[k] : null)]); });
    rr.push(['Total', 'h'], ['Paid in', (c) => (c.paid ? C.sum(WG, ([k]) => c.paid[k] || 0) : null), 'tot'], ['Gain', (c) => (c.gain ? c.gain.total : null), 'tot']);
    return `<section class="card w-tot"><div class="card-h"><h2>Net worth</h2></div>
        <div class="w-hero"><div class="w-fig"><span class="w-lbl">As of ${esc(fmtDate(D.today))}, EUR</span><b class="w-big">${tmNum(nw, true)}</b></div></div>
        ${liq}</section>
      <section class="card"><div class="card-h"><h2>By account</h2><span class="muted sm">Actual, today, then year ends</span></div><div class="chart-w" id="w-chart"></div>${wTable(cols, rows)}</section>
      <section class="card"><details class="w-ret" data-k="w-ret"${ui.dOpen['w-ret'] ? ' open' : ''}><summary class="card-h"><h2>Returns</h2><span class="muted sm">Previous balance + paid in + gain = balance</span></summary>${wTable(cols, rr)}</details></section>
      ${goalsCard()}
      ${reconCard(cols)}
      <div class="grid2 even">${paulCard()}${famCard()}</div>${balSheetHtml()}`;
  }
  after.worth = () => {
    const cols = wCols(); const el = document.getElementById('w-chart'); if (el) wChart(el, cols);
    document.querySelectorAll('.w-w').forEach((w) => { const nc = w.querySelector('thead th.tm-now'); if (nc) w.scrollLeft = Math.max(0, nc.offsetLeft + nc.offsetWidth - w.clientWidth / 2); });
  };
