'use strict';
  // ---------- Over time: two tabs (Actuals | Forecast). Actuals by cycle from the statements; Forecast by year from the engine (fcRun, the same figures as Wealth) ----------
  // Every figure comes from the engine (model.js) or the statements; this page computes nothing of its own beyond sums and averages.
  const OT_ROWS = [['h', 'Money in'], ['in.spendable', 'Net pay'], ['in.bonus', 'Bonus'], ['in.direct', 'Other'], ['in.total', 'Money in', 'tot'],
    ['h', 'Costs']].concat(TM_B.map(([id, n]) => ['cost.' + id, n, 'ot-bk']), [['cost.total', 'Costs', 'tot'], ['left', 'Left over', 'tot']]);
  const otAvg = (cs) => { if (!cs.length) return null; const o = tmZero(); OT_ROWS.forEach(([id]) => { if (id === 'h') return; const [g, f] = id === 'left' ? ['left'] : id.split('.'); const v = C.sum(cs, (c) => tmGet(c, id) || 0) / cs.length; if (f) o[g][f] = v; else o.left = v; }); o.nw = null; return o; };
  const otSum = (cs) => { const a = otAvg(cs); if (!a) return null; OT_ROWS.forEach(([id]) => { if (id === 'h') return; if (id === 'left') a.left *= cs.length; else { const [g, f] = id.split('.'); a[g][f] *= cs.length; } }); return a; };
  const otCode = (k, s) => `${ML(k).slice(0, 3)}${k.slice(2, 4)}${s}`;
  // a generic table: cols = [{ c, h, sub, cls, fixed: 'r', act }]
  function otTable(cols, extraRows) {
    const rows = OT_ROWS;
    let rEnd = 0; const fixed = cols.filter((q) => q.fixed); const rOff = {}; for (let i = fixed.length - 1; i >= 0; i--) { rOff[cols.indexOf(fixed[i])] = rEnd; rEnd += 96; }
    const st = (i) => (rOff[i] != null ? ` style="right:${rOff[i]}px"` : '');
    const cl = (q, i) => `num ${q.cls || ''}${q.fixed ? ' ot-fx' : ''}`;
    const head = `<tr><th scope="col" class="tm-l">EUR</th>${cols.map((q, i) => `<th scope="col" class="${cl(q, i)}"${st(i)}>${q.act ? `<button type="button" class="tm-hb" data-act="tm-month" data-m="${q.act}">${esc(q.h)}</button>` : esc(q.h)}${q.sub ? `<small>${esc(q.sub)}</small>` : ''}</th>`).join('')}</tr>`;
    const body = rows.concat(extraRows || []).map(([id, label, kls, get]) => {
      if (id === 'h') return `<tr class="tm-g"><th scope="rowgroup" class="tm-l">${label}</th><td colspan="${cols.length}"></td></tr>`;
      return `<tr class="${kls || ''}"><th scope="row" class="tm-l">${esc(label)}</th>${cols.map((q, i) => { const v = get ? get(q, i) : tmGet(q.c, id); return `<td class="${cl(q, i)}"${st(i)}>${tmNum(v, kls === 'tot')}</td>`; }).join('')}</tr>`;
    }).join('');
    return `<div class="tm-w ot-w"><table class="tm-t ot-t"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  // ---- Actuals ----
  // the closed cycles of the current fiscal year (Nov–Oct): YTD2
  // year to date, the current cycle included: YTD1 calendar year (Jan–), YTD2 fiscal year (Nov–Oct)
  const otYtd1 = (closed, th) => closed.filter((k) => k.slice(0, 4) === th.slice(0, 4)).concat(th);
  const otYtd2 = (closed, th) => closed.filter((k) => M.fyOf(k) === M.fyOf(th)).concat(th);
  function otActualCols(portrait) {
    const th = tmThis(); const closed = D.complete.filter((k) => k >= MONTH_START && k < th); const cs = closed.map((k) => ({ c: tmFromStmt(k), h: otCode(k, 'A'), act: k, k }));
    cs.push({ c: tmFromStmt(th), h: otCode(th, 'C'), cls: 'tm-now', act: th, k: th });
    const l6 = closed.slice(-6).map(tmFromStmt); const y = th.slice(0, 4); const ytd = otYtd1(closed, th).map(tmFromStmt); const ytd2 = otYtd2(closed, th).map(tmFromStmt); const ltm = closed.slice(-12).map(tmFromStmt);
    const fx = [{ c: otAvg(l6), h: 'L6M avg', sum: 1, cls: 'tm-u ot-sum' }, { c: otSum(ytd), h: 'YTD1', sub: 'Jan' + th.slice(2, 4) + '–', sum: 1, cls: 'tm-u' }, { c: otSum(ytd2), h: 'YTD2', sub: 'FY' + String(M.fyOf(th)).slice(2), sum: 1, cls: 'tm-u' }, { c: otSum(ltm), h: 'LTM', sum: 1, cls: 'tm-u' }];
    return cs.concat(fx.filter((q) => q.c));
  }
  // ---- Forecast: YTD1 and YTD2 (actuals, the same cycles and figures as the Actuals tab), then 5 fiscal year-ends ----
  // an actual YTD column: the Actuals-tab sums (money in, costs, left over) plus where the money went by account, from the same statements (M.colFromStatement)
  function fcYtd(ks) { if (!ks.length) return null; const a = otSum(ks.map(tmFromStmt)); if (!a) return null; const to = {};
    ks.forEach((k) => { const r = M.colFromStatement(stmtOf(k), k, 'A', D.txs); Object.entries(r.assets).forEach(([x, v]) => { if (x !== 'total') to[x] = (to[x] || 0) + (+v || 0); }); });
    const dir = {}; ks.forEach((k) => { const st = stmtOf(k); const by = st.income.directBy || { pee: st.income.direct || 0 }; Object.entries(by).forEach(([x, v]) => { if (+v) dir[x] = (dir[x] || 0) + +v; }); });
    a.dir = dir; a.to = to; a.to.total = Object.keys(to).filter((x) => x !== 'total').reduce((t, x) => t + to[x], 0); return a; }
  const fcCols = (f) => { const cs = f.years.map((y, i) => ({ h: y.code, sub: y.sub, y, i, cls: 'tm-plan', e: y.actKeys && y.actKeys.length ? fcYtd(y.actKeys) : null })); const th = tmThis(); const closed = D.complete.filter((k) => k >= MONTH_START && k < th);
    const k1 = otYtd1(closed, th), k2 = otYtd2(closed, th); const a1 = fcYtd(k1), a2 = fcYtd(k2);
    if (a2) cs.unshift({ h: 'YTD2', sub: 'FY' + String(M.fyOf(th)).slice(2) + ', ' + k2.length + ' of 12', a: a2, cls: 'tm-u' });
    if (a1) cs.unshift({ h: 'YTD1', sub: 'Jan' + th.slice(2, 4) + ', ' + k1.length + ' of 12', a: a1, cls: 'tm-u' }); return cs; };
  function fcTable(f) {
    const cols = fcCols(f); const names = []; f.years.forEach((y) => Object.keys(y.items).forEach((n) => { if (!names.includes(n)) names.push(n); }));
    // actual money in on the forecast's lines: net pay and bonus as on Actuals; money paid straight into an account (participation...) on the first line that goes straight to one, else on its own row
    const inc = (fcAssume().inc || []).filter((l) => l.on !== false); const nm = (l) => (l.name || '').trim() || 'Income';
    const payN = (inc.find((l) => l.id === 'pay') ? nm(inc.find((l) => l.id === 'pay')) : 'Net pay'), bonN = (inc.find((l) => l.id === 'bonus') ? nm(inc.find((l) => l.id === 'bonus')) : 'Bonus');
    // money paid straight into an account goes on the forecast line that goes to that same account (PEE: Participation); an account with no such line gets its own row
    const accN = (k) => ((S.cfg.accounts.find((x) => x.key === k) || {}).name || k).replace(/\s*••\d+/, '');
    const dirKeys = [...new Set(cols.filter((q) => q.a).flatMap((q) => Object.keys(q.a.dir).filter((k) => Math.abs(q.a.dir[k]) >= 0.5)))];
    const dirRow = {}; dirKeys.forEach((k) => { const l = inc.find((x) => x.acct === k); dirRow[k] = l ? nm(l) : 'Paid into ' + accN(k); });
    [payN, bonN].forEach((n) => { if (cols.some((q) => q.a) && !names.includes(n)) names.push(n); }); dirKeys.forEach((k) => { if (!names.includes(dirRow[k])) names.push(dirRow[k]); });
    const actItem = (a, n) => (n === payN ? a.in.spendable : n === bonN ? a.in.bonus : 0) + C.sum(dirKeys.filter((k) => dirRow[k] === n), (k) => a.dir[k] || 0);
    const AC = [['cash', 'Current accounts'], ['la', 'Livret A'], ['ld', 'LDDS'], ['pea', 'PEA'], ['other', 'Other investments'], ['pee', 'PEE'], ['pc', 'PERCOL']].concat(S.cfg.accounts.filter((a) => M.extraKeys([a]).length).map((a) => [a.key, a.name]))
      .filter(([k]) => f.years.some((y) => Math.abs(y.assets[k] || 0) >= 0.5) || cols.some((q) => q.a && Math.abs(q.a.to[k] || 0) >= 0.5));
    // any other account the actuals paid into (e.g. a cash account you added) gets its own row, so the rows add up to the total
    cols.filter((q) => q.a).forEach((q) => Object.keys(q.a.to).forEach((k) => { if (k !== 'total' && Math.abs(q.a.to[k]) >= 0.5 && !AC.some(([x]) => x === k)) AC.push([k, accN(k)]); }));
    // each row: [class, label, forecast value, actual value (YTD columns; none = blank)]
    const R = [['h', 'Money in']].concat(names.map((n) => ['', n, (q) => q.y.items[n] || 0, (a) => actItem(a, n)]), [['tot', 'Money in', (q) => q.y.in.total, (a) => a.in.total], ['h', 'Costs']],
      C.BUCKET6.map(([k, n]) => ['ot-bk', n, (q) => q.y.cost[k], (a) => a.cost[k]]), [['tot', 'Costs', (q) => q.y.cost.total, (a) => a.cost.total], ['tot', 'Left over', (q) => q.y.left, (a) => a.left], ['h', 'To assets']],
      AC.map(([k, n]) => ['', n, (q) => q.y.assets[k], (a) => a.to[k] || 0]), [['tot', 'To assets', (q) => q.y.assets.total, (a) => a.to.total], ['h', 'Wealth'], ['', 'Market gains', (q) => q.y.gain.total],
      ['tot', 'Total wealth', (q) => q.y.bal.total], ['', "Total wealth, today's money", (q) => f.real[q.i]], ['h', 'Simulated markets (PEA)'], ['', 'Wealth low (P10)', (q) => f.low[q.i]], ['', 'Wealth median (P50)', (q) => f.mid[q.i]], ['', 'Wealth high (P90)', (q) => f.high[q.i]], ['h', 'Stress test'], ['', 'Wealth, 2008 replay', (q) => f.stress[q.i]]]);
    const head = `<tr><th scope="col" class="tm-l">EUR</th>${cols.map((q) => `<th scope="col" class="num ${q.cls}">${esc(q.h)}${q.sub ? `<small>${esc(q.sub)}</small>` : ''}</th>`).join('')}</tr>`;
    const body = R.map(([k, l, get, act]) => (k === 'h' ? `<tr class="tm-g"><th scope="rowgroup" class="tm-l">${l}</th><td colspan="${cols.length}"></td></tr>`
      : `<tr class="${k}"><th scope="row" class="tm-l">${esc(l)}</th>${cols.map((q) => `<td class="num ${q.cls}">${tmNum(q.a ? (act ? act(q.a) : null) : q.e && act && get ? get(q) + (act(q.e) || 0) : get(q), k === 'tot')}</td>`).join('')}</tr>`)).join('');
    return `<div class="tm-w ot-w"><table class="tm-t ot-t"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  // ---- charts: plain SVG, direct labels ----
  // one style for all three charts: blue bars, current cycle hatched, axis from zero, direct labels
  function otBars(el, cols, metric) {
    const pct = metric === 'left'; const W = Math.max(300, el.clientWidth || 640), H = 250, m = { l: 56, r: pct ? 48 : 16, t: 20, b: 26 }; const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const v = (q) => (metric === 'left' ? q.c.left : q.c.cost.total); const vals = cols.map(v).filter((x) => x != null);
    if (vals.length < 3) { el.innerHTML = '<p class="muted sm">Needs three cycles with data.</p>'; return; }
    const tk = niceTicks(Math.min(0, ...vals), Math.max(1, ...vals), 4); const top = tk[tk.length - 1], bot = tk[0];
    const y = (x) => m.t + ph - ((x - bot) / (top - bot || 1)) * ph; const bw = pw / cols.length; const step = Math.ceil(cols.length / 12); let g = '';
    tk.forEach((t) => { g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${esc(compact(t))}</text>`; });
    g += `<defs><pattern id="ot-h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#0a64d6" stroke-width="2"/></pattern></defs>`;
    cols.forEach((q, i) => { const val = v(q); const x0 = m.l + i * bw + bw * 0.2, w = bw * 0.6; const cx = x0 + w / 2;
      if (val != null) { const now = q.cls === 'tm-now'; g += `<rect x="${x0.toFixed(1)}" y="${Math.min(y(0), y(val)).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, Math.abs(y(0) - y(val))).toFixed(1)}" rx="2" fill="${now ? 'url(#ot-h)' : '#0a64d6'}"${now ? ' stroke="#0a64d6"' : ''}><title>${esc(q.h)}: ${esc(eur(val))}</title></rect>`; }
      if (i % step === 0 || i === cols.length - 1) g += `<text class="axis" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(q.h.replace(/[ABC]$/, ''))}</text>`; });
    if (bot < 0) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink-2)"/>`;
    if (pct) { // left over as % of money in, on its own scale at the right
      const ps = cols.map((q) => (q.c.in.total > 0 ? q.c.left / q.c.in.total : null)); const pv = ps.filter((x) => x != null);
      const pt = niceTicks(Math.min(0, ...pv), Math.max(0.1, ...pv), 4); const pT = pt[pt.length - 1], pB = pt[0]; const yp = (x) => m.t + ph - ((x - pB) / (pT - pB || 1)) * ph;
      pt.forEach((t) => { g += `<text class="axis" x="${W - m.r + 6}" y="${yp(t) + 4}">${Math.round(t * 100)}%</text>`; });
      const pts = ps.map((p, i) => (p == null ? null : [m.l + i * bw + bw / 2, yp(p), p])).filter(Boolean);
      g += `<path d="${pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('')}" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
      pts.forEach(([a, b, p]) => { g += `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="3" fill="var(--card,#fff)" stroke="var(--ink)" stroke-width="1.5"/><text class="axis" x="${a.toFixed(1)}" y="${(b - 8).toFixed(1)}" text-anchor="middle" fill="var(--ink)">${Math.round(p * 100)}%</text>`; });
    }
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(metric)} by cycle">${g}</svg>${pct ? '<p class="muted sm ot-key">Bars: left over, EUR. Line: % of money in.</p>' : ''}`;
  }
  // forecast chart: wealth stacked by the four groups, today then year-ends, with the low-to-high range; or left over by year
  function otWealth(el, f) {
    const W = Math.max(300, el.clientWidth || 640), H = 260, m = { l: 56, r: 64, t: 16, b: 26 }; const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const pts = [{ h: 'Today', b: f.start, left: null }].concat(f.years.map((y, i) => ({ h: y.code, b: y.bal, left: y.left, lo: f.low[i], hi: f.high[i] }))); const n = pts.length;
    const metric = ui.otFm || 'nw'; const x = (i) => m.l + (i / (n - 1)) * pw; let g = '';
    const all = metric === 'nw' ? pts.map((p) => p.b.total).concat(f.low, f.high) : pts.slice(1).map((p) => p.left);
    const tk = niceTicks(Math.min(0, ...all), Math.max(1, ...all), 4); const top = tk[tk.length - 1], bot = tk[0]; const y = (v) => m.t + ph - ((v - bot) / (top - bot || 1)) * ph;
    tk.forEach((t) => { g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${esc(compact(t))}</text>`; });
    const line = (vs) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    if (metric === 'nw') {
      let base = pts.map(() => 0); const G = pts.map((p) => fcGroups(p.b));
      FC_GRP.forEach(([k, l, , col]) => { const t2 = pts.map((p, i) => base[i] + (G[i][k] || 0)); if (t2.every((v, i) => Math.abs(v - base[i]) < 1)) return;
        g += `<path d="${line(t2)}${base.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}Z" fill="${col}" opacity=".55"/>`;
        const mid = (t2[n - 1] + base[n - 1]) / 2; if (y(base[n - 1]) - y(t2[n - 1]) >= 9) g += `<text class="axis" x="${x(n - 1) + 4}" y="${y(mid) + 4}">${esc(l.split(' ')[0])}</text>`; base = t2; });
      const yr = pts.slice(1); g += `<path d="M${x(0).toFixed(1)},${y(pts[0].b.total).toFixed(1)}${yr.map((p, i) => `L${x(i + 1).toFixed(1)},${y(p.hi).toFixed(1)}`).join('')}${yr.map((p, i) => [i + 1, p.lo]).reverse().map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}Z" class="tm-band"/>`;
      g += `<path d="${line(pts.map((p) => p.b.total))}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
    } else { const ys = pts.slice(1).map((p) => p.left); g += `<path d="${ys.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="var(--s1)" stroke-width="2"/>`; }
    pts.forEach((p, i) => { g += `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(p.h)}</text>`; });
    const last = pts[n - 1]; const lv = metric === 'nw' ? last.b.total : last.left; g += `<text class="axis" x="${x(n - 1) - 4}" y="${y(lv) - 6}" text-anchor="end">${esc(compact(lv))}</text>`;
    el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${metric === 'nw' ? 'Wealth today and at each year end, by group, with the low-to-high range' : 'Left over each year'}">${g}</svg>`;
  }
  const otSeg = (a, cur, opts) => `<div class="seg-ctl" role="group">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-ot="${a}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
  function vTime() {
    if (!D.keys.length) return emptyState(); const tab = ui.otTab === 'fc' ? 'fc' : 'act'; const portrait = window.innerWidth < window.innerHeight;
    const tabs = otSeg('tab', tab, [['act', 'Actuals'], ['fc', 'Forecast']]);
    if (tab === 'act') { const cols = otActualCols(portrait); const met = ui.otAm === 'left' ? 'left' : 'cost';
      return `<div class="row ot-top">${tabs}</div><section class="card"><div class="card-h"><h2>${met === 'left' ? 'Left over' : 'Costs'}</h2>${otSeg('am', met, [['cost', 'Costs'], ['left', 'Left over']])}</div><div class="chart-w" id="ot-chart"></div></section>
        <section class="card" id="sec-table"><div class="card-h"><h2>Actuals</h2><span class="muted sm">Swipe left for L6M avg, YTD1 (calendar), YTD2 (fiscal year), both with the current cycle to date, LTM</span></div>${otTable(cols)}</section>`; }
    const f = fcRun();
    return `<div class="row ot-top">${tabs}</div>
      <section class="card"><div class="card-h"><h2>${ui.otFm === 'left' ? 'Left over' : 'Wealth'}</h2>${otSeg('fm', ui.otFm || 'nw', [['nw', 'Wealth'], ['left', 'Left over']])}</div><div class="chart-w" id="ot-chart"></div></section>
      <section class="card" id="sec-table"><div class="card-h"><h2>Forecast</h2><span class="muted sm">Fiscal years Nov–Oct, from the ${esc(M.colCode(f.startKey, 'A'))} close${D.fcMiss && D.fcMiss.length ? ' (today used for ' + esc(D.fcMiss.join(', ')) + ')' : ''}${f.frac < 1 && f.frac > 0.005 ? `; ${esc(f.years[0].code)} is the full year: ${esc(f.years[0].sub)} (closed cycles as actuals, the rest as plan)` : ''}; P10–P90 from ${f.N.toLocaleString('en')} simulated markets</span></div>${fcTable(f)}</section>`;
  }
  after.time = () => {
    const el = document.getElementById('ot-chart'); const tab = ui.otTab === 'fc' ? 'fc' : 'act';
    if (el && tab === 'act') otBars(el, otActualCols(true).filter((q) => !q.sum), ui.otAm === 'left' ? 'left' : 'cost');
    if (el && tab === 'fc') otWealth(el, fcRun());
    const w = document.querySelector('#sec-table .ot-w'); const nc = w && w.querySelector('thead th.tm-now'); if (w && nc && tab === 'act') { const ths = [...w.querySelectorAll('thead th')]; const lab = ths[0].offsetWidth; const act = ths.slice(1, ths.indexOf(nc) + 1); const need = (w.clientWidth - lab) / act.length; if (act[0].offsetWidth < need) act.forEach((t) => { t.style.minWidth = need + 'px'; }); } if (w && nc && tab === 'act') w.scrollLeft = Math.max(0, nc.offsetLeft + nc.offsetWidth - w.clientWidth);
  };
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ot]'); if (!b) return; const a = b.dataset.ot, v = b.dataset.v;
    if (a === 'tab') ui.otTab = v; else if (a === 'am') ui.otAm = v; else if (a === 'fm') ui.otFm = v;
    render();
  });
