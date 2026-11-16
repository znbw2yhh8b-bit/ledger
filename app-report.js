'use strict';
  // the report starts with Nov 2025: earlier months only have partial statements
  function cashCheckCard(k) {
    const b = cashBridge(k); if (!b) return '';
    const bad = b.diff != null && Math.abs(b.diff) >= 0.01; const names = b.accts.map((a) => esc((S.cfg.accounts.find((x) => x.key === RC_KEY({ account: a, role: 'current' })) || { name: a }).name.replace(/\s*••\d+/, ''))).join(', ');
    const st = b.diff == null ? '<span class="chip chip-warn">Not checked</span>' : bad ? `<span class="chip chip-bad">${icon('alert', 'sm')}${eur(Math.abs(b.diff), 2)} not explained</span>` : `<span class="chip chip-good">${icon('check', 'sm')}Matches statements</span>`;
    const um = b.unmatched.length ? `<p class="sm rc-bad-t">${b.unmatched.map((t) => `${fmtDate(t.date)}: ${chE(t.amt, 2)} sent to ${t.unmatched === 'REV' ? 'Revolut' : 'Trade Republic'} never arrived there, so it counts as spending.`).join(' ')} If it is on that account, add the missing line; if it was for Paul or someone else, change its category in Transactions on the Month page.</p>${b.unmatched.map((t) => `<button type="button" class="btn-sm" data-act="rc-add" data-v="${esc(t.id)}">It is on ${t.unmatched === 'REV' ? 'Revolut' : 'Trade Republic'}: add the missing line</button>`).join('')}` : '';
    return `<section class="card cb-card"><div class="card-h"><h2>Cash check</h2>${st}</div>
      <div class="cb-eq"><div><span class="t-l">Left over</span><b class="num">${eur(b.sur)}</b></div><i>−</i><div><span class="t-l">Into savings</span><b class="num">${eur(b.sav)}</b></div><i>${b.intl < 0 ? '−' : '+'}</i><div><span class="t-l">Between your accounts</span><b class="num">${eur(Math.abs(b.intl))}</b></div><i>=</i><div><span class="t-l">Change in cash</span><b class="num">${eur(b.change)}</b></div></div>
      <p class="sm muted">${b.stmt != null ? `${names}: ${eur(b.open, 2)} at the start, ${eur(b.close, 2)} at the end${b.ownIn ? `, plus ${eur(b.ownIn, 2)} sent to ${[...new Set(b.own.map((t) => esc(acct(t.toOwn).name)))].join(', ')} (no statement there)` : ''}: ${eur(b.stmt, 2)}.` : 'No statement balances cover this month.'}${b.liveSum ? ` Includes ${eur(-b.liveSum, 2)} you added here that is not on a statement yet.` : ''} As booked, so the bonus and one-offs are in.</p>${um}</section>`;
  }
  // ---------- Month: one closed month in depth (Today is the same layout for the month in progress) ----------
  const MONTH_START = '2025-11';
  const awayManual = () => S.cfg.away || undefined;
  // the days away of one month, read from spending only
  function awayOfMonth(k) { D.awayC = D.awayC || {}; if (!D.awayC[k]) { const r = C.monthRange(k, S.cfg.cutoff); D.awayC[k] = C.daysAway(D.txs, r.from, r.to, awayManual()); } return D.awayC[k]; }
  // income you add on Month that goes straight to a savings or locked account (participation, abondement): kept in overrides.paidIn, never on a bank statement
  // every account the forecast knows except current accounts, so assets you add (gold, other investments) appear here too, as on Assumptions
  const PAID_BASE = [['la', 'Livret A'], ['ld', 'LDDS'], ['pea', 'PEA'], ['other', 'Other investments'], ['pee', 'PEE'], ['pc', 'PERCOL']];
  const PAID_TO_F = () => { const accs = S.cfg.accounts || []; const nm = (a) => String(a.name || a.key).replace(/\s*••\d+/, ''); return PAID_BASE.map(([k, d]) => { const a = accs.find((x) => x.key === k); return [k, a ? nm(a) : d]; }).concat(accs.filter((a) => M.extraKeys([a]).length).map((a) => [a.key, nm(a)])); };
  const paidInOf = (k) => Object.values((S.overrides || {}).paidIn || {}).filter((e) => C.budgetMonth(e.date, S.cfg.cutoff) === k).sort((a, b) => b.date.localeCompare(a.date));
  function directOf(k) { const o = {}; paidInOf(k).forEach((e) => { o[e.to] = (o[e.to] || 0) + e.amt; }); return o; }
  function stmtOf(k) { D.stC = D.stC || {}; if (!D.stC[k]) D.stC[k] = C.statement(D.txs, k, { trPea: S.cfg.trPea, bonus: D.pl[k] ? D.pl[k].bonus : 0, direct: directOf(k) }); return D.stC[k]; }
  // the usual month: median of the closed months before this one, without days away, one-offs and the bonus
  function usualOf(key) {
    D.usC = D.usC || {}; const k2 = key + '|' + (S.cfg.runMonths || 6); if (D.usC[k2]) return D.usC[k2];
    let ks = D.complete.filter((k) => k < key && k >= MONTH_START); if (!ks.length) ks = D.complete.filter((k) => k !== key && k >= MONTH_START);
    const u = ks.length ? C.usualMonth(ks.map((k) => ({ key: k, txs: D.txs.filter((t) => t.month === k) })), S.cfg.runMonths || 6, (S.overrides || {}).oneoff, (k) => awayOfMonth(k).away, S.cfg.trPea) : null;
    return (D.usC[k2] = u);
  }
  // net worth at a month end, from the balances you recorded (not the automatic estimates)
  function nwAt(date) { const pts = (S.snapshots && S.snapshots.points) || {}; const k = Object.keys(pts).filter((d) => pts[d] && pts[d].nw != null && d <= date).sort().pop(); return k && daysBetween(k, date) <= 20 ? pts[k].nw : null; }
  const cellH = (v) => (v == null ? '<span class="muted">–</span>' : eur(v));
  // ---------- Month: one page for a cycle, closed or current. Actual | Usual; every figure from the statements ----------
  // day-to-day = purchases in the Everyday, Lifestyle and Trips buckets (the same buckets the usual month calls flexible)
  const inFlex = (t) => ['everyday', 'lifestyle', 'trips'].includes(C.bucket6Of(t.cat));
  const MASSET = [['cash', 'Current accounts'], ['la', 'Livret A'], ['ld', 'LDDS'], ['pea', 'PEA'], ['pee', 'PEE'], ['pc', 'PERCOL']];
  const FLAG_BIG = 200; // a purchase at or above this, outside rent, bills, tax and transfers, is flagged as large
  const far = (v, u) => u != null && v - u > 20 && (u <= 0 ? true : (v - u) / u > 0.1); // rule H: more than 10% and more than 20 above
  // the same medians the old watched lines used: grocery trips, average ticket, eating-out times, average bill, over the usual months before this one
  function mealStats(key) {
    D.mc = D.mc || {}; if (D.mc[key]) return D.mc[key];
    const one = (k) => { const w = watchedMonth(k, D.txs.filter((t) => t.month === k), {}); const g = (w.find((x) => x.id === 'groceries') || { sub: [] }).sub; const e = (w.find((x) => x.id === 'eating') || { sub: [] }).sub; const v = (a, l) => (a.find((x) => x.label === l) || {}).value; return [v(g, 'Shop visits'), v(g, 'Average basket'), v(e, 'Times'), v(e, 'Average bill')]; };
    const ks = D.complete.filter((k) => k < key && k >= MONTH_START).slice(-(S.cfg.runMonths || 6)); const rows = ks.map(one);
    const med = (i) => { const a = rows.map((r) => r[i]).filter((x) => x != null); return a.length ? C.median(a) : null; };
    return (D.mc[key] = { now: one(key), usual: [0, 1, 2, 3].map(med) });
  }
  // day to day, from the same lines and rules as the statement (C.flexDays). vals = every day (the strip); home = days at home only (the running line).
  // usual curve: median shape of the closed cycles before this one at home (days away and one-offs out), scaled to end on the usual Everyday + Lifestyle + Trips
  function dayInfo(key) {
    D.dc = D.dc || {}; const ck = key + '|' + D.txs.length + '|' + (S.cfg.runMonths || 6); if (D.dc[ck]) return D.dc[ck];
    const rg = C.monthRange(key, S.cfg.cutoff); const n = daysBetween(rg.from, rg.to) + 1; const aw = awayOfMonth(key).away; const oo = (S.overrides || {}).oneoff || {};
    const vals = C.flexDays(D.txs, key, rg.from, n, S.cfg.trPea); const awayIx = new Set(vals.map((_, i) => i).filter((i) => aw.has(C.dayAdd(rg.from, i))));
    const home = vals.map((v, i) => (awayIx.has(i) ? 0 : v));
    const ks = D.complete.filter((k) => k < key && k >= MONTH_START).slice(-(S.cfg.runMonths || 6));
    const past = ks.map((k) => { const r = C.monthRange(k, S.cfg.cutoff); const m = daysBetween(r.from, r.to) + 1; const a = awayOfMonth(k).away; const v = C.flexDays(D.txs, k, r.from, m, S.cfg.trPea, (t) => oo[t.id] || (t.amt < 0 && a.has(t.date))); const hd = m - [...a].filter((d) => d >= r.from && d <= r.to).length; return { cum: C.cumul(v), perHome: hd > 0 ? C.sum(v, (x) => x) / hd : null }; });
    let usual = past.length ? C.medCurve(past.map((p) => p.cum), n) : null;
    const U = usualOf(key); const uFlex = U ? C.sum(U.buckets.filter((b) => ['everyday', 'lifestyle', 'trips'].includes(b.id)), (b) => b.amt) : null;
    if (usual && uFlex != null) { const end = usual[n - 1]; usual = end > 0 ? usual.map((v) => v * uFlex / end) : usual.map((_, i) => uFlex * (i + 1) / n); }
    const ph = past.map((p) => p.perHome).filter((x) => x != null); const uPerHome = ph.length ? C.median(ph) : null;
    const open = !D.complete.includes(key); const upTo = open ? Math.max(0, Math.min(n - 1, daysBetween(rg.from, D.today))) : n - 1;
    const homeDays = Array.from({ length: upTo + 1 }, (_, i) => i).filter((i) => !awayIx.has(i)).length; const awayDays = upTo + 1 - homeDays;
    const homeSum = C.sum(home.slice(0, upTo + 1), (x) => x), awaySum = C.sum(vals.slice(0, upTo + 1), (x) => x) - homeSum;
    return (D.dc[ck] = { rg, n, vals, awayIx, usual, uFlex, cum: C.cumul(home, upTo), upTo, open, homeDays, awayDays, homeSum, awaySum, perHome: homeDays ? homeSum / homeDays : null, uPerHome });
  }
  // the one small ring of the app: spent, bills still due, left to spend
  function ringSvg(spent, due, left, aria, centre) {
    const R = 44, cx = 56, cy = 56, L = 2 * Math.PI * R; const tot = Math.max(1, spent + due + Math.max(0, left)); let off = 0; const seg = (v, c) => { const l = Math.max(0, v) / tot * L; const s = l > 0 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${c}" stroke-width="12" stroke-dasharray="${l.toFixed(2)} ${(L - l).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>` : ''; off += l; return s; };
    return `<svg class="ring" viewBox="0 0 112 112" width="112" height="112" role="img" aria-label="${esc(aria)}"><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--line)" stroke-width="12"/>${seg(spent, 'var(--s1)')}${seg(due, 'var(--s4)')}${seg(left, 'var(--s3)')}</svg>${centre ? `<div class="st-c"><div class="t-v">${esc(centre[0])}</div><div class="t-l">${esc(centre[1])}</div></div>` : ''}`;
  }
  // steering: the figure left to spend, then one bar split into spent, bills still due and left
  function steerBar(spent, due, left, aria, centre) {
    const tot = Math.max(1, spent + due + Math.max(0, left)); const pc = (v) => (Math.max(0, v) / tot * 100).toFixed(2) + '%';
    const neg = left < 0;
    return `<div class="sb"><div class="sb-v ${neg ? 'neg' : ''}">${esc(centre[0])}</div><div class="sb-l">${neg ? 'over the usual month' : esc(centre[1])}</div>
      <div class="sb-bar" role="img" aria-label="${esc(aria)}"><i style="width:${pc(spent)};background:var(--s1)"></i><i style="width:${pc(due)};background:var(--s4)"></i><i style="width:${pc(left)};background:var(--s3)"></i></div>
      <div class="legend sb-k"><span class="lg"><span class="lg-box" style="background:var(--s1)"></span>Spent ${eur(spent)}</span><span class="lg"><span class="lg-box" style="background:var(--s4)"></span>Bills due ${eur(due)}</span><span class="lg"><span class="lg-box" style="background:var(--s3)"></span>Left ${eur(Math.max(0, left))}</span></div></div>`;
  }
  function vReport() {
    const cfg = S.cfg; if (!D.keys.length) return emptyState();
    const key = sharedMonth(); const closed = D.complete.includes(key); const isNow = !!D.now && key === D.now.key; const st = stmtOf(key); const U = usualOf(key);
    const kind = closed ? 'A' : 'C'; const A = M.colFromStatement(st, key, kind, D.txs); const codeA = M.colCode(key, kind);
    const uB = (id) => (U ? (U.buckets.find((b) => b.id === id) || {}).amt : null); const uC = (c) => (U ? (U.cats.find((x) => x.cat === c) || {}).amt : null);
    const uMoney = U ? U.spendable : null, uCosts = U ? U.costs : null, uLeft = U ? U.spendable - U.costs : null;
    const rateA = A.in.total > 0 ? A.left / A.in.total : 0, rateU = uMoney > 0 && uLeft != null ? uLeft / uMoney : null;
    const lbl = ML(key, true).replace(/ \d{4}$/, '');
    // 1. key figures: the actual, the usual month beneath
    const tile = (l, v, b, neg) => `<div class="tile"><div class="t-l">${l}</div><div class="t-v ${neg ? 'neg' : ''}">${v}</div><div class="t-s">${b}</div></div>`;
    const bTxt = (v) => (v == null ? 'No usual yet' : 'Usual ' + eur(v));
    const tiles = '<div class="kpis k4">' + tile('Money in', eur(A.in.total), bTxt(uMoney)) + tile('Costs', eur(A.cost.total), bTxt(uCosts)) + tile('Left over', eur(A.left), bTxt(uLeft), A.left < 0) + tile('Saving rate', pctS(rateA), rateU == null ? 'No usual yet' : 'Usual ' + pctS(rateU), rateA < 0) + '</div>';
    // 2. steering, current cycle only
    let steer = '';
    if (isNow) {
      const N = D.now; const d = dueThisMonth(N); const dueL = d.items.filter((x) => x.amt < 0 && !x.paid && (!x.date || x.date >= D.today || x.late) && !(x.ev && x.ev.group === 'save')); const dueSum = C.sum(dueL, (x) => -x.amt);
      const spent = A.cost.total; const left = (uCosts || 0) - spent - dueSum; const daysLeft = Math.max(0, N.total - N.day); const perDay = daysLeft > 0 ? left / daysLeft : null;
      const DIs = dayInfo(key); const pace = N.day >= 7 && DIs.homeDays ? DIs.homeSum / DIs.homeDays : null; /* from day 7: day-to-day at home per day, so a trip does not inflate it */ const track = pace != null ? spent + dueSum + pace * daysLeft : null;
      const pair = (l, v, sub, cls) => `<div class="sv"><span class="sv-l">${l}</span><b class="num sv-v ${cls || ''}">${v}</b><span class="sv-s">${sub || ''}</span></div>`;
      ui.mTrack = track; ui.mDue = dueSum; ui.mDueHtml = d.items.filter((x) => !x.paid).map(dueRow).join(''); const li = (l, v) => `<li><span>${l}</span><b class="num">${v}</b></li>`;
      steer = `<section class="card" id="steer"><div class="card-h"><h2>Steering</h2><span class="muted sm">${esc(codeA)}</span></div>
        ${steerBar(spent, dueSum, left, `Costs ${eurT(spent)} so far, bills still due ${eurT(dueSum)}, ${left >= 0 ? eurT(left) + ' left to spend' : eurT(-left) + ' over the usual month'}.`, [eur(Math.abs(left)), 'left to spend'])}
        <hr class="st-hr"><ul class="st-l">${(left < 0 ? li('Usual per day', uCosts && N.total ? eur(uCosts / N.total) : '–') : li('Left per day', perDay == null ? '–' : eur(perDay)))}${li('Days left', `${daysLeft} out of ${N.total}`)}</ul>
        <details class="st-due"${ui.stDueOpen ? ' open' : ''}><summary><span>Bills still due · ${dueL.length}</span><b class="num">${eur(dueSum)}</b></summary><ul class="tx due">${dueL.length ? dueL.map(dueRow).join('') : '<li class="muted sm pad">Nothing left to come.</li>'}</ul></details></section>`;
    }
    // 3. waterfall: money in, one step per bucket, left over
    const steps = [{ l: 'Money in', v: A.in.total, t: 'total' }].concat(C.BUCKET6.map(([b, n]) => ({ l: n, v: Math.abs(A.cost[b] || 0), t: (A.cost[b] || 0) >= 0 ? 'down' : 'up' })).filter((x) => x.v >= 0.5), [{ l: 'Left over', v: A.left, t: 'total' }]);
    const bridge = `<section class="card"><div class="card-h"><h2>From money in to left over</h2><span class="muted sm">${esc(codeA)}, EUR</span></div>${bridgeSvg(steps, `Money in ${eurT(A.in.total)}, costs ${eurT(A.cost.total)}, left over ${eurT(A.left)}.`, isNow ? 540 : 0, isNow ? 300 : 0)}</section>`;
    // 4. the statement: Actual | Usual
    const open = ui.bkOpen || (ui.bkOpen = {});
    const row = (cls, label, a, u) => `<tr class="${cls}"><th scope="row" class="tm-l">${label}</th><td class="num">${tmNum(a, cls === 'tot')}</td><td class="num tm-u">${tmNum(u, cls === 'tot')}</td></tr>`;
    const grp = (l) => `<tr class="tm-g"><th scope="rowgroup" class="tm-l">${l}</th><td colspan="2"></td></tr>`;
    const catRows = (b) => {
      const names = new Set(); Object.keys(A.cats).concat(U ? U.cats.map((c) => c.cat) : []).forEach((c) => { if ((C.bucket6Of(c) || 'lifestyle') === b) names.add(c); });
      const rows = [...names].map((c) => ({ c, a: A.cats[c] || 0, u: uC(c) })).filter((x) => Math.abs(x.a) >= 0.5 || Math.abs(x.u || 0) >= 0.5).sort((x, y) => Math.max(y.a, y.u || 0) - Math.max(x.a, x.u || 0));
      const out = rows.map((x) => row('ot-sub', `<button type="button" class="lnk" data-act="cf-cell" data-m="${key}" data-c="${esc(x.c)}">${esc(x.c)}</button>`, x.a, x.u));
      const rest = (tot, get) => (tot == null ? null : tot - C.sum(rows, get)); const oa = rest(A.cost[b], (x) => x.a), ou = U ? rest(uB(b), (x) => x.u || 0) : null;
      if (Math.abs(oa || 0) >= 0.5 || Math.abs(ou || 0) >= 0.5) out.push(row('ot-sub', 'Other', oa, ou));
      return out.join('');
    };
    const bucketRows = C.BUCKET6.map(([b, n]) => { const o = !!open[b]; return row('ot-bk', `<button type="button" class="bk-t" data-act="bk-open" data-v="${b}" aria-expanded="${o}">${icon(o ? 'chevD' : 'chevR', 'sm')}${esc(n)}</button>`, A.cost[b], uB(b)) + (o ? catRows(b) : ''); }).join('');
    const assetRows = MASSET.concat(PAID_TO_F().filter(([k]) => !MASSET.some(([m]) => m === k) && Math.abs(A.assets[k] || 0) >= 0.5)).map(([k, n]) => row('', esc(n), A.assets[k] || 0, null)).join('');
    const stmt = `<div class="tm-w ot-w m-w"><table class="tm-t ot-t m-t"><thead><tr><th scope="col" class="tm-l">EUR</th><th class="num${closed ? '' : ' tm-now'}" scope="col">${esc(codeA)}</th><th class="num tm-u" scope="col">Usual</th></tr></thead><tbody>`
      + grp('Money in') + row('', 'Net pay', A.in.pay, U ? U.pay : null) + row('', 'Bonus', A.in.bonus, U ? 0 : null) + row('', 'Other', A.in.other - (st.income.direct || 0), U ? U.other : null) + (st.income.direct ? row('', 'Paid straight to savings', st.income.direct, U ? 0 : null) : '') + row('tot', 'Money in', A.in.total, uMoney)
      + grp('Costs') + bucketRows + row('tot', 'Costs', A.cost.total, uCosts)
      + row('tot', 'Left over', A.left, uLeft)
      + grp('To assets') + assetRows + row('tot', 'To assets', A.assets.total, null) + '</tbody></table></div>';
    const statement = `<section class="card" id="statement"><div class="card-h"><h2>Statement</h2><span class="muted sm">${closed ? 'Actual and usual month' : 'To date and usual month'}</span><button type="button" class="info" data-act="info" data-v="stmt" aria-label="How this is worked out" aria-expanded="${!!ui.info}">${icon('info', 'sm')}</button></div>${ui.info === 'stmt' ? `<p class="sm muted">Usual month: median of the last ${U ? U.n : 0} closed cycles, without days away, one-offs and the bonus.</p>` : ''}${stmt}</section>`;
    // 5. day to day
    const DI = dayInfo(key); const series = []; if (DI.usual) series.push({ vals: DI.usual, color: 'var(--s4)', w: 2, end: 'Usual' }); series.push({ vals: DI.cum, color: 'var(--s1)', w: 2, end: codeA, above: true });
    const flexA = C.sum(['everyday', 'lifestyle', 'trips'], (b) => A.cost[b] || 0); const chartT = C.sum(DI.vals, (x) => x); const gapT = Math.abs(chartT - flexA) > 1;
    const tie = gapT ? `<button type="button" class="tie-dot" data-act="info" data-v="tie" aria-label="Chart and statement differ" aria-expanded="${ui.info === 'tie'}"></button>` : '';
    const tieP = gapT && ui.info === 'tie' ? `<ul class="st-l tie-l"><li><span>Chart</span><b class="num">${eur(chartT)}</b></li><li><span>Statement</span><b class="num">${eur(flexA)}</b></li></ul>` : '';
    const daily = DI.vals.some((v) => v > 0) ? `<section class="card" id="daily"><div class="card-h"><h2>Day to day</h2>${tie}<span class="muted sm">${DI.awayIx.size ? 'Line at home; days away lighter' : 'Everyday, lifestyle and trips, EUR'}</span></div>${tieP}${dayStripSvg(DI.vals, DI.awayIx, DI.rg.from, `Everyday, lifestyle and trips spending for each day of ${codeA}: ${eurT(C.sum(DI.vals, (x) => x))} in total.`)}${DI.cum.filter((v) => v != null).length >= 3 ? dayLineSvg({ n: DI.n, start: DI.rg.from, today: DI.open ? DI.upTo : null, series, aria: `Running total of everyday, lifestyle and trips spending on days at home: ${eurT(DI.cum[DI.upTo] || 0)} so far${DI.usual ? ` against ${eurT(DI.usual[DI.upTo] || 0)} in a usual month` : ''}.` }) : ''}</section>` : '';
    // 6. metrics
    const MS = mealStats(key); const mN = (v, isEur) => (v == null ? '<span class="muted">–</span>' : isEur ? tmNum(v) : String(Math.round(v * 10) / 10));
    const mr = (l, a, u, cls) => `<tr class="${cls || ''}"><th scope="row" class="tm-l">${l}</th><td class="num">${a}</td><td class="num tm-u">${u}</td></tr>`;
    const mg = (l) => `<tr class="tm-g"><th scope="rowgroup" class="tm-l">${l}</th><td colspan="2"></td></tr>`;
    const uRate = uMoney > 0 && uLeft != null ? uLeft / uMoney : null;
    const extra = isNow && steer ? mg('This cycle') + mr('On track for', ui.mTrack == null ? '<span class="muted">–</span>' : tmNum(ui.mTrack), '<span class="muted">–</span>') + mr(`<button type="button" class="lnk" data-act="go-due">Bills still due</button>`, tmNum(ui.mDue || 0), '<span class="muted">–</span>') : '';
    const metrics = `<section class="card" id="metrics"><div class="card-h"><h2>Metrics</h2><span class="muted sm">Against the usual month</span></div><div class="tm-w ot-w m-w"><table class="tm-t ot-t m-t"><thead><tr><th scope="col" class="tm-l">EUR</th><th class="num${closed ? '' : ' tm-now'}" scope="col">${esc(codeA)}</th><th class="num tm-u" scope="col">Usual</th></tr></thead><tbody>`
      + mg('Key figures') + mr('Saving rate', pctS(rateA), uRate == null ? '–' : pctS(uRate), 'tot')
      + extra + mg('Day to day') + mr('Per day at home', DI.perHome == null ? '<span class="muted">–</span>' : tmNum(DI.perHome), DI.uPerHome == null ? '<span class="muted">–</span>' : tmNum(DI.uPerHome)) + mr('Days away', String(DI.awayDays), '<span class="muted">–</span>') + mr('Spent while away', tmNum(DI.awaySum), '<span class="muted">–</span>') + mg('Food') + mr('Grocery trips', mN(MS.now[0]), mN(MS.usual[0])) + mr('Average grocery ticket', mN(MS.now[1], true), mN(MS.usual[1], true)) + mr('Eating-out times', mN(MS.now[2]), mN(MS.usual[2])) + mr('Average eating-out ticket', mN(MS.now[3], true), mN(MS.usual[3], true))
      + `</tbody></table></div>${isNow && ui.dueOpen ? `<ul class="tx due">${ui.mDueHtml || '<li class="muted sm pad">Nothing left to come.</li>'}</ul>` : ''}</section>`;
    // 7. flags, each linking to its lines
    const fl = []; const flag = (txt, attrs) => fl.push(`<li><button type="button" class="flag-r" ${attrs}><span class="grow">${esc(txt)}</span>${icon('chevR', 'sm')}</button></li>`);
    C.BUCKET6.filter(([b]) => b !== 'tax').forEach(([b, n]) => { const u = uB(b); if (far(A.cost[b] || 0, u)) flag(`${n} is ${eurT((A.cost[b] || 0) - u)} above usual`, `data-act="cf-cell" data-m="${key}" data-b="${b}"`); });
    const sc = C.subsChange(D.txs, key); sc.started.forEach((x) => flag(`New subscription: ${C.titleCase(x)}`, `data-act="flag-q" data-m="${key}" data-q="${esc(x)}"`)); sc.stopped.forEach((x) => flag(`Subscription stopped: ${C.titleCase(x)}`, `data-act="flag-q" data-m="${key}" data-q="${esc(x)}"`));
    alertsInfo(subsInfo()).forEach((a) => fl.push(`<li class="flag-x"><button type="button" class="flag-r" data-act="flag-q" data-m="${key}" data-q="${esc(a.q || '')}"><span class="grow">${esc(String(a.t).replace(/<[^>]+>/g, '') + ': ' + a.d)}</span>${icon('chevR', 'sm')}</button><button type="button" class="btn-ghost" data-act="al-ok" data-v="${esc(a.id)}">Checked</button></li>`));
    D.txs.filter((t) => t.month === key && t.amt <= -FLAG_BIG && ['everyday', 'lifestyle', 'trips'].includes(C.bucket6Of(t.cat)) && t.cat !== 'Between my accounts').sort((x, y) => x.amt - y.amt).slice(0, 3).forEach((t) => flag(`Large purchase: ${C.titleCase(C.merchant(t))}, ${eurT(-t.amt)} on ${fmtDate(t.date)}`, `data-act="flag-q" data-m="${key}" data-q="${esc(t.desc)}"`));
    const todo = D.txs.filter((t) => t.month === key && t.cat === 'To classify').length; if (todo) flag(`${todo} line${todo > 1 ? 's' : ''} to classify`, `data-act="now-todo" data-m="${key}"`);
    const mm = monthMarks().find((m) => m.k === key); if (mm && mm.missing.length) fl.push(`<li><a class="flag-r" href="#update"><span class="grow">${esc('Missing statement: ' + mm.missing.join(', '))}</span>${icon('chevR', 'sm')}</a></li>`);
    const flags = fl.length ? `<section class="card" id="flags"><div class="card-h"><h2>Flags</h2><span class="muted sm">Tap one for its lines</span></div><ul class="flag-l">${fl.join('')}</ul></section>` : '';
    return `<div class="mbar" id="mbar"><div class="mbar-in" role="group" aria-label="Cycle">${periodBarHtml(key)}</div></div>${steer ? `<div class="m-half">${steer}${bridge}</div>` : bridge}<div class="m-grid"><div class="m-main">${statement}</div><div class="m-side">${metrics}</div></div>${daily}${sheetHtml()}`;
  }
  const periodBarHtml = (key) => { const ks = cycleKeys(); const i = ks.indexOf(key); return `<button type="button" class="btn-icon" data-act="per" data-v="-1" aria-label="Previous cycle" ${i <= 0 ? 'disabled' : ''}>${icon('chevL')}</button><b>${esc(cycleCode(key))}</b><button type="button" class="btn-icon" data-act="per" data-v="1" aria-label="Next cycle" ${i >= ks.length - 1 ? 'disabled' : ''}>${icon('chevR')}</button>`; };
  // the slim bar shows once the page header has scrolled out of view; the quick-add sheet takes focus when it opens
  after.report = () => {
    const bar = document.getElementById('mbar'), hd = document.querySelector('.ph');
    if (bar && hd && 'IntersectionObserver' in window) { if (window.__mbarIO) window.__mbarIO.disconnect(); window.__mbarIO = new IntersectionObserver(([e]) => { bar.classList.toggle('on', !e.isIntersecting); }, { rootMargin: '-1px 0px 0px 0px' }); window.__mbarIO.observe(hd); }
    if (ui.focusAdd) { ui.focusAdd = false; ui.sheetOpen = true; ui.sheetFocus = true; render(); return; }
    if (ui.sheetFocus) { ui.sheetFocus = false; const a = document.getElementById('q-amt'); if (a) a.focus(); }
  };
  function cashCheckHtml(k) { const b = cashBridge(k); if (!b) return ''; const ok = b.diff != null && Math.abs(b.diff) < 0.01; return ok ? '<p class="cash-ok ok">' + icon('check', 'sm') + ' Cash check: your accounts tie to the statements.</p>' : cashCheckCard(k); }
  // the shared empty, loading and error states for pages that need statements
  function emptyState() {
    if (sync === 'starting') return stateHtml('load', 'Opening your ledger…', 'Reading your saved data. This takes a few seconds.');
    if (sync === 'error') return stateHtml('err', 'Your data could not be opened or saved', 'Nothing is lost. Reload the page to try again.', `<a class="btn" href="#update">${icon('import', 'sm')} Add statements</a>`);
    return stateHtml('none', 'No statements yet', 'Add your SG statement (CSV) to see your months.', `<a class="btn" href="#update">${icon('import', 'sm')} Add statements</a>`);
  }


  // ---------- cash flow ----------
  const OUTB = ['essentials', 'lifestyle', 'family', 'tax'];
  // the open month: what is booked so far plus what the usual month still has to come
  function landing() {
    return null; // landing projection switched off
    const k = D.keys[D.keys.length - 1]; if (!k || D.complete.includes(k)) return null;
    const pl = D.pl[k]; const a = ui.norm ? pl.norm : pl.raw; const u = D.rr.avg; const L = {};
    L.income = Math.max(a.income, u.income || 0);
    OUTB.forEach((b) => { L[b] = Math.max(a[b] || 0, u[b] || 0); });
    L.surplus = L.income - OUTB.reduce((x, b) => x + L[b], 0) - (a.saving || 0) * 0 ;
    L.surplus = a.surplus + (L.income - a.income) - OUTB.reduce((x, b) => x + (L[b] - (a[b] || 0)), 0);
    L.rate = L.income > 0 ? L.surplus / L.income : 0; L.saving = a.saving;
    const r = C.monthRange(k, S.cfg.cutoff); const left = Math.max(0, daysBetween(D.today, r.to));
    return { key: k, a, L, left, r };
  }
  // habits of one month from its lines
  function kpis(k, land) {
    const cfg = S.cfg; const m = D.txs.filter((t) => t.month === k); const pl = D.pl[k]; const n = ui.norm ? pl.norm : pl.raw;
    const inc = land ? land.L.income : n.income; const outgo = land ? land.L.essentials + land.L.lifestyle + land.L.family : n.essentials + n.lifestyle + n.family;
    const eat = m.filter((t) => t.cat === 'Eating out & cafés' && t.amt < 0); const gro = m.filter((t) => t.cat === 'Groceries' && t.amt < 0);
    const flex = -C.sum(m.filter((t) => t.amt < 0 && (FLEX.includes(t.cat) || VIA.includes(t.cat))), (t) => t.amt);
    const r = C.monthRange(k, cfg.cutoff); const end = D.complete.includes(k) ? r.to : (D.today < r.to ? D.today : r.to); const days = Math.max(1, daysBetween(r.from, end) + 1);
    const eatS = -C.sum(eat, (t) => t.amt), groS = -C.sum(gro, (t) => t.amt);
    return { inc, outgo, pct: inc > 0 ? outgo / inc : null, eatN: eat.length, eatS, eatAvg: eat.length ? eatS / eat.length : 0, groN: gro.length, groS, groAvg: gro.length ? groS / gro.length : 0, perDay: flex / days, flex, days };
  }
  // ---------- indicators ----------
  const IND_FIXED = ['Rent', 'Energy', 'Internet & mobile', 'Home insurance', 'Subscriptions', 'Bank fees'];
  const medianOf = (a) => { if (!a.length) return 0; const v = a.slice().sort((x, y) => x - y); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const KIND = {
    groc: ['Groceries', (t) => t.cat === 'Groceries'],
    meals: ['Meals out (8 € and over)', (t) => t.cat === 'Eating out & cafés' && -t.amt >= 8],
    coffees: ['Coffees and snacks (under 8 €)', (t) => t.cat === 'Eating out & cafés' && -t.amt < 8],
    rides: ['Rides', (t) => /UBER|UBR\*|BOLT|G7|TAXI/i.test(t.desc || '')],
    big: ['Big purchases (over 150 €)', (t) => (FLEX.includes(t.cat) || VIA.includes(t.cat)) && -t.amt > 150],
  };
  function indicators(k) {
    const cfg = S.cfg; const pl = D.pl[k]; const n = pl.norm; const nc = pl.normCat || {}; const sp = (c) => -(nc[c] || 0);
    const r = C.monthRange(k, cfg.cutoff); const open = !D.complete.includes(k); const to = open && D.today < r.to ? D.today : r.to;
    const m = D.txs.filter((t) => t.month === k && t.amt < 0 && !(S.overrides.oneoff || {})[t.id]); const f = foodStats(k, r.from, to);
    const g = m.filter((t) => t.cat === 'Groceries'); const ga = g.map((t) => -t.amt); const days = Math.max(1, f.days);
    const e = m.filter((t) => t.cat === 'Eating out & cafés'); const meals = e.filter((t) => -t.amt >= 8); const cof = e.filter((t) => -t.amt < 8);
    const sum = (l) => -C.sum(l, (t) => t.amt); const ride = m.filter((t) => /UBER|UBR\*|BOLT|G7|TAXI/i.test(t.desc));
    const snack = m.filter((t) => /N\.S\.S/i.test(t.desc)); const big = m.filter((t) => (FLEX.includes(t.cat) || VIA.includes(t.cat)) && -t.amt > 150);
    const fixed = C.sum(IND_FIXED, sp); const inc = n.income;
    const flexT = sum(m.filter((t) => FLEX.includes(t.cat) || VIA.includes(t.cat)));
    return { k, part: k < '2026-05' || !!f.hidden, open,
      rate: n.rate, kept: n.surplus, fixedPct: inc > 0 ? fixed / inc : null, fixed, rentPct: inc > 0 ? sp('Rent') / inc : null,
      grocDay: f.perDay, food: f.food, foodPct: inc > 0 ? f.food / inc : null, foodFlex: flexT > 0 ? f.food / flexT : null, daysHome: f.days, daysAway: f.awayN, grocN: g.length, perWeek: g.length / (days / 7), topUp: g.length ? ga.filter((a) => a < 8).length / g.length : null, basket: medianOf(ga), grocS: sum(g),
      mealN: meals.length, mealS: sum(meals), mealAvgV: meals.length ? sum(meals) / meals.length : null, cofAvg: cof.length ? sum(cof) / cof.length : null, rideAvg: ride.length ? sum(ride) / ride.length : null, grocAvg: g.length ? sum(g) / g.length : null, bigAvg: big.length ? sum(big) / big.length : null, bigN: big.length, mealAvg: meals.length ? sum(meals) / meals.length : 0, cofN: cof.length, cofS: sum(cof), eatS: sum(e),
      rideN: ride.length, rideS: sum(ride), snackN: snack.length, snackS: sum(snack),
      paul: sp('Paid for Paul'), famPct: inc > 0 ? (sp('Paid for Paul') + sp('Support for parents')) / inc : null, bigS: sum(big), bigPct: flexT > 0 ? sum(big) / flexT : null, flexT };
  }
  // search: accent- and case-blind, every word must match somewhere; amounts match 12,50 / 12.50 / 12.5 / -12
  const qNorm = (x) => String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function qMatch(q, fields, amt) {
    const hay = qNorm(fields.join(' ')); const a = Math.abs(+amt || 0); const am = [a.toFixed(2), a.toFixed(2).replace('.', ','), String(a), String(a).replace('.', ',')];
    return qNorm(q).split(/\s+/).filter(Boolean).every((w) => {
      const n = w.replace(/^[-+−€]+|€$/g, '');
      if (/^\d+([.,]\d+)?$/.test(n)) { const v = n.replace(',', '.'); if (am.some((s) => s.replace(',', '.').startsWith(v))) return true; }
      return hay.includes(w);
    });
  }
  // the lines behind the figures: filtered by the month table, by To classify, or by search
  function vLines() {
    const cfg = S.cfg; if (!D.keys.length) return emptyState();
    // lines
    sharedMonth();
    const allM = !!ui.allMonths; let list = allM ? D.txs.slice() : D.txs.filter((t) => t.month === ui.month);
    if (ui.kind && KIND[ui.kind]) list = list.filter((t) => t.amt < 0 && KIND[ui.kind][1](t));
    else if (ui.cat) list = list.filter((t) => t.cat === ui.cat);
    else if (ui.bucket) list = list.filter((t) => M.bucketOf(cfg, t.cat) === ui.bucket);
    if (ui.onlyTodo) list = list.filter((t) => t.cat === 'To classify');
    if (!ui.showTransfers && ui.cat !== 'Between my accounts' && ui.bucket !== 'internal') list = list.filter((t) => M.bucketOf(cfg, t.cat) !== 'internal');
    // filters: where the money went through, and which way
    const srcOf = (t) => t.live ? 'ap' : String(t.acct || '').startsWith('SG') ? 'SG' : String(t.acct || '');
    const SRC_L = { ap: 'Apple Pay', SG: 'Société Générale', REV: 'Revolut', TR: 'Trade Republic' };
    const srcs = [...new Set(list.map(srcOf).filter(Boolean))].sort((a, b) => (a === 'ap') - (b === 'ap') || a.localeCompare(b));
    if (ui.src && !srcs.includes(ui.src)) srcs.push(ui.src);
    if (ui.src) list = list.filter((t) => srcOf(t) === ui.src);
    if (ui.dir === 'out') list = list.filter((t) => t.amt < 0); else if (ui.dir === 'in') list = list.filter((t) => t.amt > 0);
    if (ui.q) list = list.filter((t) => qMatch(ui.q, [t.desc, C.merchant(t), (t.det || []).join(' '), t.cat, SRC_L[srcOf(t)] || t.acct, t.live ? 'apple pay' : '', fmtDate(t.date)], t.amt));
    list = list.slice().sort((a, b) => b.date.localeCompare(a.date) || a.amt - b.amt);
    const todoN = D.txs.filter((t) => (allM || t.month === ui.month) && t.cat === 'To classify').length;
    // long lists are shown in pages so the iPad stays quick
    const lim = ui.cfLimit || 40; const shown = list.slice(0, lim); const total = C.sum(list, (t) => t.amt);
    const piL = ui.kind || ui.cat || ui.bucket || ui.onlyTodo ? [] : (allM ? Object.values((S.overrides || {}).paidIn || {}) : paidInOf(ui.month)).filter((e) => !ui.src && ui.dir !== 'out' && (!ui.q || qMatch(ui.q, [e.name, 'income'], e.amt))).sort((a, b) => b.date.localeCompare(a.date));
    const piRows = piL.map((e) => { const to = (PAID_TO_F().find(([k]) => k === e.to) || [0, e.to])[1]; return `<li class="txr"><div class="tx-d">${fmtDate(e.date)}</div><div class="tx-m"><div class="tx-n">${esc(e.name || 'Income')} <span class="tag tag-m">Added</span></div><div class="tx-s">Into ${esc(to)}</div></div><span class="sm muted pi-c">Paid straight to savings</span><div class="tx-a num pos">${eurL(e.amt, 2)}${ui.armed === e.id ? `<button class="btn-x armed" data-act="pi-del" data-v="${e.id}" aria-label="Tap again to delete this income">Delete</button>` : `<button class="btn-x" data-act="pi-del" data-v="${e.id}" aria-label="Delete this income" title="Delete this income">${icon('x', 'sm')}</button>`}</div></li>`; }).join('');
    let lastM = null; const rows = shown.map((t) => { let h = ''; if (allM && t.month !== lastM) { lastM = t.month; h = `<li class="tx-mh">${ML(t.month, true)}</li>`; } return h + txRow(t); }).join('');
    return `
    <section class="card">
      <div class="card-h" id="cf-lines"><h2>${list.length} line${list.length === 1 ? '' : 's'}</h2>
        <div class="row wrap"><select id="cf-catsel" class="sel" aria-label="Category"><option value="">All categories</option>${M.BUCKETS.map(([b, l]) => { const cs = C.CATS.map(([c]) => c).filter((c) => M.bucketOf(cfg, c) === b); return cs.length ? `<optgroup label="${esc(l)}"><option value="b:${b}" ${!ui.cat && ui.bucket === b ? 'selected' : ''}>All ${esc(l.toLowerCase())}</option>${cs.map((c) => `<option value="c:${esc(c)}" ${ui.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>
        <label class="chk"><input type="checkbox" id="all-months" ${allM ? 'checked' : ''}> All months</label><label class="chk"><input type="checkbox" id="show-transfers" ${ui.showTransfers ? 'checked' : ''}> Show transfers</label>
        ${todoN ? `<label class="chk"><input type="checkbox" id="only-todo" ${ui.onlyTodo ? 'checked' : ''}> To classify (${todoN})</label>` : ''}</div></div>
      <input id="q" class="inp search" type="search" placeholder="Search a shop, amount, category or account" value="${esc(ui.q)}" autocomplete="off" enterkeyhint="search">
      <div class="row wrap lf-row"><div class="seg-ctl" role="group" aria-label="Paid with"><button type="button" data-act="lf-src" data-v="" class="${!ui.src ? 'on' : ''}" aria-pressed="${!ui.src}">All</button>${srcs.map((k) => `<button type="button" data-act="lf-src" data-v="${esc(k)}" class="${ui.src === k ? 'on' : ''}" aria-pressed="${ui.src === k}">${esc(SRC_L[k] || k)}</button>`).join('')}</div>
        <div class="seg-ctl" role="group" aria-label="Direction">${[['', 'In & out'], ['out', 'Money out'], ['in', 'Money in']].map(([k, l]) => `<button type="button" data-act="lf-dir" data-v="${k}" class="${(ui.dir || '') === k ? 'on' : ''}" aria-pressed="${(ui.dir || '') === k}">${l}</button>`).join('')}</div></div>
      ${(() => { const f = []; if (ui.kind && KIND[ui.kind]) f.push(['cat', KIND[ui.kind][0]]); else if (ui.cat) f.push(['cat', ui.cat]); else if (ui.bucket) f.push(['cat', BL[ui.bucket]]); if (ui.onlyTodo) f.push(['todo', 'To classify']); if (ui.src) f.push(['src', SRC_L[ui.src] || ui.src]); if (ui.dir) f.push(['dir', ui.dir === 'out' ? 'Money out' : 'Money in']); if (ui.q) f.push(['q', `“${ui.q}”`]);
        return f.length ? `<div class="chips" aria-label="Filters">${f.map(([k, l]) => `<button type="button" class="chip-f" data-act="f-clear" data-v="${k}" aria-label="Remove filter ${esc(l)}">${esc(l)}${icon('x', 'sm')}</button>`).join('')}</div>` : ''; })()}
      ${ui.ruleOffer ? ruleOfferHtml() : ''}
      ${list.length ? `<div class="sm muted lines-tot">Net of these lines: ${eurSigned(total)}</div>` : ''}
      <div class="tx-box" id="tx-box" data-keep><ul class="tx nl">${piRows}${rows || (piRows ? '' : '<li class="muted pad">No lines.</li>')}</ul></div>
      ${list.length > lim ? `<div class="row end"><span class="sm muted grow">Showing ${lim} of ${list.length}</span><button class="btn-sm" data-act="cf-more">Show ${Math.min(40, list.length - lim)} more</button></div>` : ''}
    </section>`;
  }
  // categories grouped by the bucket they count in
  function catOptions(sel) {
    const by = {}; C.CATS.forEach(([c]) => { const b = M.bucketOf(S.cfg, c); (by[b] = by[b] || []).push(c); });
    return M.BUCKETS.filter(([b]) => by[b]).map(([b, l]) => `<optgroup label="${esc(l)}">${by[b].map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>`).join('');
  }
  function txRow(t) {
    const man = S.overrides.map[t.id]; const off = !!(S.overrides.oneoff || {})[t.id];
    const title = C.titleCase(C.merchant(t)); const sub1 = String(t.desc || '').toLowerCase() === title.toLowerCase() ? '' : esc(t.desc); const acc = t.acct && !String(t.acct).startsWith('SG') ? esc(t.acct) : ''; const sub2 = sub1 && acc ? `${sub1} · ${acc}` : sub1 || acc; // second line only when it adds something
    return `<li class="txr ${t.cat === 'To classify' ? 'todo' : ''}"><div class="tx-d">${fmtDate(t.date)}</div>
      <div class="tx-m"><div class="tx-n">${esc(title)}${off ? ' <span class="tag tag-a">one-off</span>' : ''}${t.live ? ' <span class="tag tag-m">Apple Pay</span>' : ''}</div>${sub2 ? `<div class="tx-s">${sub2}</div>` : ''}</div>
      <select class="sel-cat ${man ? 'man' : ''}" data-tx="${t.id}" aria-label="Category">${catOptions(t.cat)}</select>
      <div class="tx-a num ${t.amt > 0 ? 'pos' : ''}">${eurL(t.amt, 2)}${t.live ? (ui.armed === t.id ? `<button class="btn-x armed" data-act="live-del" data-v="${t.id}" aria-label="Tap again to delete this Apple Pay entry">Delete</button>` : `<button class="btn-x" data-act="live-del" data-v="${t.id}" aria-label="Delete this Apple Pay entry" title="Delete this Apple Pay entry">${icon('x', 'sm')}</button>`) : ''}${M.flaggable(S.cfg, t) ? `<button class="btn-x flag ${off ? 'on-flag' : ''}" data-act="oneoff" data-v="${t.id}" aria-pressed="${off}" aria-label="${off ? 'One-off: tap to count it normally' : 'Mark as one-off'}" title="${off ? 'One-off: left out of your usual month' : 'Mark as one-off'}">${icon('flag', 'sm')}</button>` : '<span class="flag-sp"></span>'}</div></li>`;
  }
  function ruleOfferHtml() { const o = ui.ruleOffer; return `<div class="offer">${icon('tag', 'sm')}<span>Also file the other ${o.n} line${o.n > 1 ? 's' : ''} containing “${esc(o.kw)}” under ${esc(o.cat)}, now and in future statements?</span><button class="btn-sm" data-act="rule-yes">Make it a rule</button><button class="btn-ghost" data-act="rule-no">No</button></div>`; }

  // how fast an account can be turned into cash on your current account
  const AVAIL = [['now', 'Available now'], ['days', 'Within a few days'], ['locked', 'Locked']];
  const availOf = (a) => a.avail || (a.tier === 'cash' || a.tier === 'savings' ? 'now' : a.tier === 'invest' ? 'days' : a.tier === 'other' && a.key !== 'dep' ? 'days' : 'locked');
