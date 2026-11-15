'use strict';
  // ---------- settings ----------
  // ---- days away: found from spending, corrected here; every figure follows ----
  const awRanges = (set) => { const ds = [...set].sort(); const out = []; ds.forEach((d) => { const l = out[out.length - 1]; if (l && C.dayAdd(l[1], 1) === d) l[1] = d; else out.push([d, d]); }); return out; };
  const awDays = (a, b) => daysBetween(a, b) + 1;
  function awayCard() {
    const away = S.cfg.away || { away: [], home: [] }; const ks = D.keys.filter((k) => k >= MONTH_START).slice(-7); const auto = [];
    ks.forEach((k) => { const r = C.monthRange(k, S.cfg.cutoff); awRanges(C.daysAway(D.txs, r.from, r.to, undefined).away).forEach((x) => auto.push(x)); });
    const span = (a, b) => `${esc(fmtDate(a))}${a === b ? '' : ' to ' + esc(fmtDate(b))}`; const dd = (a, b) => `${awDays(a, b)} day${awDays(a, b) > 1 ? 's' : ''}`;
    const manual = (arr, kind) => (arr || []).map(([a, b], i) => `<li><span class="grow">${span(a, b)} <span class="muted sm">${dd(a, b)}</span></span><button type="button" class="btn-x" data-act="away-del" data-kind="${kind}" data-i="${i}" aria-label="Remove">${icon('x', 'sm')}</button></li>`).join('');
    const days = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(''); const mons = Array.from({ length: 12 }, (_, i) => C.addMonths(D.today.slice(0, 7), -i)).map((m) => `<option value="${m}">${esc(ML(m, true))}</option>`).join('');
    const pick = (id, l) => `<span class="as-f"><span>${l}</span><select class="sel" id="${id}-d" aria-label="${l} day">${days}</select><select class="sel" id="${id}-m" aria-label="${l} month">${mons}</select></span>`;
    return `<section class="card" id="away"><details data-k="set-away"${ui.dOpen['set-away'] ? ' open' : ''}><summary><h2 class="inl">Days away</h2><span class="muted sm">Found from spending, left out of the usual month</span></summary>
      <h3 class="mt">Found from your spending</h3><ul class="simple sm">${auto.length ? auto.map(([a, b]) => `<li><span class="grow">${span(a, b)}</span><span class="muted">${dd(a, b)}</span></li>`).join('') : '<li class="muted">No stays found.</li>'}</ul>
      <h3 class="mt">Count as away</h3><ul class="simple sm">${manual(away.away, 'away') || '<li class="muted">None.</li>'}</ul>
      <h3 class="mt">Count as home</h3><ul class="simple sm">${manual(away.home, 'home') || '<li class="muted">None.</li>'}</ul>
      <h3 class="mt">Add a correction</h3><div class="row wrap as-add"><select class="sel" id="aw-kind" aria-label="Kind"><option value="away">Away</option><option value="home">Home</option></select>${pick('aw-from', 'From')}${pick('aw-to', 'To')}<button type="button" class="btn-sm" data-act="away-add">${icon('plus', 'sm')} Add</button></div></details></section>`;
  }
  function vSettings() {
    const cfg = S.cfg; const T = cfg.targets; const np = cfg.netPay;
    const num = (id, label, val, unit, help) => `<label class="ctl"><span class="ctl-l">${label}</span><span class="ctl-r"><input id="${id}" class="inp num w7" inputmode="decimal" value="${val}">${unit ? `<span class="unit">${unit}</span>` : ''}</span>${help ? `<span class="ctl-h">${help}</span>` : ''}</label>`;
    const dop = (k, d) => ((k in ui.dOpen ? ui.dOpen[k] : d) ? ' open' : ''); // remembered open or closed state
    const catsBy = (b) => C.CATS.map(([c]) => c).filter((c) => M.bucketOf(cfg, c) === b);
    return `
    <section class="card"><details data-k="accounts"${dop('accounts', false)}><summary><h2 class="inl">Accounts</h2><span class="muted sm">What counts in net worth, and how the forecast treats it</span></summary><div class="mt">
      <div class="tbl-w"><table class="tbl acc"><thead><tr><th>Name</th><th>Type</th><th>Currency</th><th>Availability</th><th class="num">Balance</th><th></th></tr></thead><tbody>
      ${cfg.accounts.map((a) => `<tr><td><input class="inp" data-acc="${a.key}" data-f="name" value="${esc(a.name)}" aria-label="Name"></td><td><select class="sel sm" data-acc="${a.key}" data-f="tier" aria-label="Type">${TIERS.map(([t, l]) => `<option value="${t}" ${a.tier === t ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><select class="sel sm" data-acc="${a.key}" data-f="cur" aria-label="${esc(a.name)} currency" ${a.fromHold ? 'disabled' : ''}><option value="EUR">€</option><option value="USD" ${isUsd(a) ? 'selected' : ''}>$</option></select></td><td><div class="av"><select class="sel sm av-${availOf(a)}" data-acc="${a.key}" data-f="avail" aria-label="${esc(a.name)} availability">${AVAIL.map(([v, l]) => `<option value="${v}" ${availOf(a) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${availOf(a) === 'locked' ? `<label class="sm muted av-u">until <input class="inp sm-inp" type="month" data-acc="${a.key}" data-f="unlock" value="${esc(a.unlock || '')}" aria-label="${esc(a.name)} unlocks"></label>` : ''}</div></td><td class="num">${isUsd(a) ? `${usdTxt(a.balCur)}<div class="muted sm">≈ ${eur(a.balance, 2)}</div>` : eur(a.balance, 2)}<div class="muted sm">${fmtDate(a.asOf)}${a.fromHold ? ' · from Holdings' : ''}</div></td><td class="act"><button class="btn-x ${ui.armed === 'acc-' + a.key ? 'armed' : ''}" data-act="acc-del" data-v="${a.key}" aria-label="Delete">${ui.armed === 'acc-' + a.key ? 'Delete?' : icon('x')}</button></td></tr>`).join('')}
      </tbody></table></div>
      <form id="acc-form" class="row wrap mt"><input id="a-name" class="inp grow" placeholder="New account, e.g. Boursobank" required aria-label="Account name"><select id="a-tier" class="sel" aria-label="Type">${TIERS.map(([t, l]) => `<option value="${t}">${l}</option>`).join('')}</select><select id="a-cur" class="sel" aria-label="Currency"><option value="EUR">€</option><option value="USD">$</option></select><input id="a-bal" class="inp num w8" inputmode="decimal" placeholder="Balance" aria-label="Balance"><button class="btn-sm" type="submit">${icon('plus', 'sm')} Add</button></form>
      <p class="sm muted">Returns, volatility, ceilings and the savings order are on the Assumptions page.</p>
    </div></details></section>
    <section class="card"><details data-k="buckets"${dop('buckets', false)}><summary><h2 class="inl">Categories to buckets</h2><span class="muted sm">Which of the six buckets each category counts in</span></summary>
      <div class="bk">${C.BUCKET6.map(([b, n]) => `<div><h3>${esc(n)}</h3>${C.CATS.map(([c]) => c).filter((c) => C.bucket6Of(c) === b).map((c) => `<label class="bk-r"><span class="grow">${esc(c)}</span><select class="sel sm" data-bk6="${esc(c)}" aria-label="Bucket for ${esc(c)}">${C.BUCKET6.map(([k, l]) => `<option value="${k}" ${k === b ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('') || '<p class="muted sm">None</p>'}</div>`).join('')}</div>
    </details></section>
    <section class="card"><details data-k="basics"${dop('basics', false)}><summary><h2 class="inl">Reading statements</h2><span class="muted sm">PEA part of the transfer, food share, parents ceiling</span></summary><div class="ctls mt">
      ${num('b-parcap', 'Yearly ceiling for support to parents', cfg.parentsCap > 0 ? cfg.parentsCap : 7200, 'EUR', 'Shown on Wealth with the room left. Check it against your tax notice')}
      ${num('b-pea', 'PEA part of the Trade Republic transfer', cfg.trPea, 'EUR', 'Counted as saving, not spending, when a cycle is read from statements')}
      ${num('food-share', 'Share of groceries that is food', Math.round(foodShare() * 100), '%', 'Used by Ask for food at home a day. 90% by default')}
    </div></details></section>
    <section class="card"><details data-k="rules"${dop('rules', false)}><summary><h2 class="inl">Your category rules <span class="muted">${S.rules.list.length}</span></h2><span class="muted sm">Checked before the built-in ones</span></summary>
      <ul class="simple">${S.rules.list.map((r, i) => `<li><code>${esc(r[0])}</code><span class="grow">→ ${esc(r[1])}</span><button class="btn-x" data-act="del-rule" data-v="${i}" aria-label="Delete rule">${icon('x')}</button></li>`).join('') || '<li class="muted">None yet. Change a line’s category on Month to create one.</li>'}</ul></details></section>
    ${awayCard()}
    ${subsCard()}
    ${shortcutHtml()}
    <section class="card"><details data-k="data"${ui.restore ? ' open' : dop('data', false)}><summary><h2 class="inl">Your data</h2><span class="muted sm">${Store.backend === 'local' ? 'Saved on this iPad' : 'Saved in your Supabase account'} · export, import</span></summary>
      <p class="sm">${Store.backend === 'local' ? 'Saved on this iPad only, in this app. Deleting the app from the Home Screen or clearing Safari data deletes it: export after each month close and keep the file in iCloud Drive.' : 'Saved in your Supabase account, the same on every device you sign in on.'}</p>
      <div class="row wrap"><button class="btn-sm" data-act="backup">${icon('save', 'sm')} Export all data</button><button class="btn-sm" data-act="export-csv">${icon('save', 'sm')} Export lines (CSV)</button><label class="btn-sm" for="restore-in">${icon('import', 'sm')} Import data</label>${Store.backend === 'local' ? '' : `<button class="btn-sm" data-act="sign-out">Sign out</button>`}<input id="restore-in" type="file" accept=".json,application/json" hidden></div>
      ${S.cfg.lastExport ? `<p class="muted sm">Last export ${fmtDate(S.cfg.lastExport)}</p>` : ''}
      ${ui.restore ? `<div class="pend" id="restore-card"><h3>Import ${esc(ui.restore.name)}</h3><table class="tm-t ot-t w-kv"><tbody>${ui.restore.sum.map(([l, v]) => `<tr><th class="tm-l">${esc(l)}</th><td class="num">${v == null ? '–' : typeof v === 'number' ? frNum(v) : esc(fmtDate(v) + ' ' + v.slice(0, 4))}</td></tr>`).join('')}</tbody></table>
        <p class="sm">This replaces everything saved here with the file's content.</p><div class="row end"><button class="btn-ghost" data-act="restore-no">Cancel</button><button class="btn" data-act="restore-go">Replace with this file</button></div></div>` : ''}</div>
    </details></section>`;
  }

  // ---------- bills, subscriptions, alerts ----------
  const NOT_BILL = ['Rent', 'Spent via Trade Republic', 'Spent via Revolut', 'Livret A', 'LDDS', 'Livret A & LDDS', 'Paid for Paul', 'Support for parents', 'PEA & investments'];
  const ord = (d) => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
  const mKey = (t) => C.merchant(t).toUpperCase().replace(/\s+/g, ' ').slice(0, 40);
  // safe to spend: the current account now, less what is still due before the statement closes, plus pay still to come
  function safeInfo(N) {
    // every current account you can pay from today (SG, Revolut, Trade Republic cash, Fortuneo), not savings
    const accs = S.cfg.accounts.filter((a) => a.tier === 'cash'); if (!accs.length) return null;
    const sg = accs.find((a) => a.key === 'sg') || accs[0];
    const d = dueThisMonth(N); const asOf = sg.asOf || D.today;
    const outL = d.items.filter((x) => x.amt < 0 && !x.paid && (!x.date || x.date >= asOf || x.late));
    const inL = d.items.filter((x) => x.amt > 0 && !x.paid && (!x.date || x.date >= asOf));
    const out = C.sum(outL, (x) => -x.amt), inc = C.sum(inL, (x) => x.amt);
    const since = C.sum(N.list.filter((e) => e.date > asOf && e.amt < 0), (e) => -e.amt);
    const bal = C.sum(accs, (a) => +a.balance || 0); const v = bal - out + inc - since; const days = Math.max(1, daysBetween(D.today, N.r.to) + 1);
    return { v, bal, accs, asOf, out, inc, since, days, perDay: v / days, outN: outL.length, inN: inL.length };
  }
  function safeHtml(N, lead) {
    const s = safeInfo(N); if (!s) return '';
    return `<details class="lim-how"><summary class="sm"><b>Safe to spend ${eur(s.v)}</b><span class="muted"> · cash after bills, how it is worked out</span></summary>${lead || ''}
      <ul class="simple sm safe-l"><li class="safe-tot"><span class="grow"><b>Total cash</b><span class="muted"> · current accounts, oldest balance ${fmtDate(s.accs.map((a) => a.asOf).filter(Boolean).sort()[0] || s.asOf)}</span></span><b class="num">${eur(s.bal)}</b></li>
        <li><span class="grow">Bills and transfers still due (${s.outN})</span><b class="num">${eur(-s.out)}</b></li>
        ${s.inc ? `<li><span class="grow">Pay still to come (${s.inN})</span><b class="num pos">+${eur(s.inc)}</b></li>` : ''}
        ${s.since ? `<li><span class="grow">Added here since then</span><b class="num">${eur(-s.since)}</b></li>` : ''}
        <li><a href="#worth" data-act="open-bal" class="sm">Update balances</a></li></ul></details>`;
  }
  // every recurring charge over the last 12 months, grouped by merchant, with its price history
  function subsInfo() {
    const cfg = S.cfg; const last = D.keys[D.keys.length - 1]; if (!last) return [];
    const from = C.addMonths(last, -11); const by = {};
    for (const t of D.txs) {
      if (t.month < from || t.amt >= 0 || NOT_BILL.includes(t.cat) || M.bucketOf(cfg, t.cat) === 'tax' || M.bucketOf(cfg, t.cat) === 'saving' || M.bucketOf(cfg, t.cat) === 'internal') continue;
      if (/AMERICAN EXPRESS|AMEX/i.test(t.desc)) continue;
      if (!/PRELEVEMENT|VIR PERM|COTISATION/.test(t.desc) && t.cat !== 'Subscriptions') continue;
      const k = mKey(t) + (/MOTIF:\s*(\S+)/.exec((t.det || []).join(' ')) || ['', ''])[1]; (by[k] = by[k] || []).push(t);
    }
    return Object.entries(by).map(([k, l]) => {
      l.sort((a, b) => a.date.localeCompare(b.date)); const months = [...new Set(l.map((t) => t.month))];
      if (months.length < 2) return null; const lastT = l[l.length - 1], prevT = l[l.length - 2];
      const gapM = (Date.parse(lastT.date) - Date.parse(prevT.date)) / 86400000 / 30.4;
      const every = gapM > 6 ? 'year' : 'month';
      const amt = -lastT.amt; const prices = l.map((t) => ({ d: t.date, v: -t.amt }));
      const nextD = new Date(Date.parse(lastT.date)); do { if (every === 'month') nextD.setMonth(nextD.getMonth() + 1); else nextD.setFullYear(nextD.getFullYear() + 1); } while (isoD(nextD) < D.today);
      const active = daysBetween(lastT.date, D.today) <= (every === 'month' ? 45 : 400);
      return { k, name: C.titleCase(C.merchant(lastT)).trim() || lastT.cat, cat: lastT.cat, amt, prev: -prevT.amt, every, yearly: every === 'month' ? amt * 12 : amt, next: isoD(nextD), first: l[0].date, prices, active, sub: lastT.cat === 'Subscriptions', mark: (cfg.subs || {})[k] || '' };
    }).filter(Boolean).sort((a, b) => b.yearly - a.yearly);
  }
  // unusual charges in the last 45 days: duplicates, a new merchant over 50 €, a regular payment that went up, a new subscription
  function alertsInfo(subs) {
    const cfg = S.cfg; const seen = cfg.alertSeen || {}; const from = isoD(new Date(Date.parse(D.today) - 45 * 86400000)); const out = [];
    const recent = D.txs.filter((t) => t.date >= from && t.amt < 0 && !NOT_BILL.includes(t.cat) && !['internal', 'saving', 'tax'].includes(M.bucketOf(cfg, t.cat)));
    const known = new Set(D.txs.filter((t) => t.date < from).map(mKey));
    recent.forEach((t, i) => {
      const dup = recent.find((u, j) => j < i && mKey(u) === mKey(t) && Math.abs(u.amt - t.amt) < 0.01 && Math.abs(daysBetween(u.date, t.date)) <= 2);
      if (dup && -t.amt >= 10) out.push({ id: 'dup-' + t.id, q: C.merchant(t), kind: 'bad', t: 'Possible double charge', d: `${C.titleCase(C.merchant(t))}: ${eur(-t.amt, 2)} on ${fmtDate(dup.date)} and ${fmtDate(t.date)}` });
    });
    const firstSeen = {}; recent.forEach((t) => { const k = mKey(t); if (!known.has(k) && -t.amt >= 50 && !firstSeen[k]) firstSeen[k] = t; });
    Object.values(firstSeen).forEach((t) => out.push({ id: 'new-' + t.id, q: C.merchant(t), kind: 'warn', t: 'New merchant', d: `${C.titleCase(C.merchant(t))}: ${eur(-t.amt, 2)} on ${fmtDate(t.date)}, first time you pay them` }));
    subs.filter((x) => x.active && x.amt > x.prev * 1.08 && x.amt - x.prev >= 3 && x.prices[x.prices.length - 1].d >= from).forEach((x) => out.push({ id: `up-${x.k}-${x.prices[x.prices.length - 1].d}`, q: x.name, kind: 'warn', t: 'Went up', d: `${x.name}: ${eur(x.prev, 2)} → ${eur(x.amt, 2)} (${eur((x.amt - x.prev) * (x.every === 'month' ? 12 : 1))} a year)` }));
    subs.filter((x) => x.first >= isoD(new Date(Date.parse(D.today) - 70 * 86400000))).forEach((x) => out.push({ id: 'ns-' + x.k, q: x.name, kind: 'warn', t: 'New regular payment', d: `${x.name}: ${eur(x.amt, 2)} a ${x.every}, since ${fmtDate(x.first)}` }));
    return out.filter((a) => !seen[a.id]);
  }
  function calendarHtml(N) {
    const d = dueThisMonth(N); const from = N.r.from, to = N.r.to; const byD = {};
    d.items.filter((x) => x.date || (x.paid && x.paid.date)).forEach((x) => { const k = x.paid ? x.paid.date : x.date; (byD[k] = byD[k] || []).push(x); });
    const start = new Date(Date.parse(from)); const dow = (start.getUTCDay() + 6) % 7; start.setUTCDate(start.getUTCDate() - dow);
    const end = new Date(Date.parse(to)); end.setUTCDate(end.getUTCDate() + (6 - (end.getUTCDay() + 6) % 7));
    let cells = ''; for (let c = new Date(start); c <= end; c.setUTCDate(c.getUTCDate() + 1)) {
      const k = c.toISOString().slice(0, 10); const inP = k >= from && k <= to; const xs = byD[k] || []; const tot = C.sum(xs, (x) => x.paid ? x.paid.amt : x.amt);
      cells += `<div class="cal-d ${inP ? '' : 'off'} ${k === D.today ? 'today' : ''}"><div class="cal-n">${+k.slice(8)}${+k.slice(8) === 1 ? ' ' + ML(k.slice(0, 7)).slice(0, 3) : ''}</div>${xs.map((x) => `<div class="cal-i ${x.paid ? 'paid' : ''} ${x.amt > 0 ? 'in' : ''}" title="${esc(x.name)}"><span>${esc(x.name)}</span><b>${eur(Math.abs(x.paid ? x.paid.amt : x.amt))}</b></div>`).join('')}${xs.length > 1 ? `<div class="cal-t">${eur(tot)}</div>` : ''}</div>`;
    }
    const undated = d.items.filter((x) => !x.date && !x.paid);
    return `<section class="card"><div class="card-h"><h2>Bills calendar</h2><span class="muted sm">${fmtDate(from)} to ${fmtDate(to)} · ${d.leftN ? `${eur(d.leftSum)} still to go out` : 'all paid'}</span></div>
      <div class="cal"><div class="cal-h">Mon</div><div class="cal-h">Tue</div><div class="cal-h">Wed</div><div class="cal-h">Thu</div><div class="cal-h">Fri</div><div class="cal-h">Sat</div><div class="cal-h">Sun</div>${cells}</div>
      ${undated.length ? `<p class="sm muted mt">No fixed date: ${undated.map((x) => `${esc(x.name)} ${eur(Math.abs(x.amt))}`).join(' · ')}</p>` : ''}
      <p class="sm muted">Greyed items are paid. Dates come from last month’s statement and can move by a day or two.</p></section>`;
  }
  function subsCard() {
    if (!D.keys.length) return '';
    const subs = subsInfo(); const act = subs.filter((x) => x.active);
    const yearT = C.sum(act, (x) => x.yearly); const sv = act.filter((x) => x.mark === 'cancel');
    const spark = (p) => { if (p.length < 2) return ''; const vs = p.map((x) => x.v); const mx = Math.max(...vs), mn = Math.min(...vs); if (mx - mn < 0.01) return `<span class="muted sm">steady</span>`; return `<span class="sub-h sm">${p.slice(-4).map((x) => eur(x.v, 2)).join(' → ')}</span>`; };
    return `
    <section class="card"><details data-k="subs"${ui.dOpen.subs ? ' open' : ''}><summary><h2 class="inl">Subscriptions and direct debits</h2><span class="muted sm"><b class="ink">${eur(yearT)}</b> a year · ${act.length} active · rent not included${sv.length ? ` · marked to cancel: ${eur(C.sum(sv, (x) => x.yearly))} a year` : ''}</span></summary>
      <div class="tbl-w"><table class="tbl subs"><thead><tr><th>Payment</th><th class="num">Amount</th><th class="num">A year</th><th>Next</th><th>Price history</th><th class="act">Review</th></tr></thead><tbody>
      ${act.map((x) => `<tr class="${x.mark === 'cancel' ? 'sub-x' : ''}"><td><b>${esc(x.name)}</b><div class="muted sm">${esc(x.cat)} · ${x.every === 'month' ? `monthly, ${ord(+x.prices[x.prices.length - 1].d.slice(8))}` : 'yearly'}${x.sub ? ' · <span class="tag tag-a">subscription</span>' : ''}</div></td>
        <td class="num ${x.amt > x.prev * 1.08 && x.amt - x.prev >= 3 ? 'warn-t' : ''}">${eur(x.amt, 2)}</td><td class="num">${eur(x.yearly)}</td><td class="sm">${fmtDate(x.next)}</td><td>${spark(x.prices)}</td>
        <td class="act"><div class="seg-ctl sm-seg"><button type="button" class="${x.mark === 'keep' ? 'on' : ''}" data-act="sub-mark" data-v="${esc(x.k)}" data-m="keep">Keep</button><button type="button" class="${x.mark === 'cancel' ? 'on' : ''}" data-act="sub-mark" data-v="${esc(x.k)}" data-m="cancel">Cancel</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No regular payments found yet.</td></tr>'}
      </tbody></table></div>
      <p class="sm muted">From the last 12 months of statements. “Cancel” is a reminder for you: the charge stays until you stop it with the company.</p></details></section>`;
  }
  // ---------- investment fees and dividends ----------

  const pctS2 = (v) => `${(v * 100).toFixed(2)}%`;
  // ---------- Apple Pay log: one line per payment, written by an iPhone automation into a file in iCloud Drive ----------
  // line format: 2026-11-06 12:31 | 4,50 € | Monoprix | SG Visa   (also accepts ; or tab between fields)
  function hash8(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function apParse(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim(); if (!line || /^#/.test(line)) return;
      const f = line.split(/\s*[|;\t]\s*/); if (f.length < 2) return;
      const dm = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(f[0]) || /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(f[0]);
      if (!dm) return; const date = dm[0].includes('/') ? `${dm[3]}-${pad(+dm[2])}-${pad(+dm[1])}` : `${dm[1]}-${dm[2]}-${dm[3]}`;
      const a = f[1]; const usd = /\$|USD/i.test(a); const lbp = /LBP|L\.L|ل\.ل/i.test(a);
      let n = a.replace(/[^\d,.\-]/g, ''); if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, '').replace(',', '.'); else n = n.replace(/,/g, '');
      let v = Math.abs(parseFloat(n)); if (!(v > 0)) return;
      let note = '';
      if (usd) { const r = fxAt(date); if (r) { note = `$${v.toFixed(2)} at $1 = €${r.toFixed(3)}`; v = v * r; } else note = `$${v.toFixed(2)}, no dollar rate yet`; }
      if (lbp) return; // Lebanese pounds: add these by hand in euros
      out.push({ id: 'ap' + hash8(line), date, amt: -C.r2(v), merchant: (f[2] || '').trim(), card: (f[3] || '').trim(), note });
    });
    return out;
  }
  function apImport(text) {
    const rows = apParse(text); const cfg = S.cfg; const seen = new Set(cfg.apSeen || []); const from = D.now.r.from;
    let added = 0, had = 0, old = 0;
    rows.forEach((x) => {
      if (seen.has(x.id) || (S.live || {})[x.id]) { had++; return; }
      if (x.date < from) { old++; seen.add(x.id); return; }
      const guess = x.merchant ? C.categorise({ id: 'q', desc: x.merchant.toUpperCase(), det: [], amt: x.amt, acct: 'LIVE' }, S.rules.list, {}) : null;
      const cat = guess && guess !== 'To classify' && M.bucketOf(cfg, guess) !== 'income' ? guess : 'To classify';
      const e = { id: x.id, date: x.date, amt: x.amt, cat, merchant: x.merchant, card: x.card, note: x.note, src: 'applepay', at: Date.now(), _q: true };
      S.live = S.live || {}; S.live[e.id] = e; writeLive(e); seen.add(x.id); added++;
    });
    cfg.apSeen = [...seen].slice(-1500); cfg.apLast = { at: new Date().toISOString(), n: rows.length }; persist('model'); changed();
    const todo = Object.values(S.live).filter((e) => e.src === 'applepay' && e.cat === 'To classify' && e.date >= from).length;
    toast(rows.length ? `${added} new payment${added === 1 ? '' : 's'} added${had ? ` · ${had} already in` : ''}${old ? ` · ${old} from before this month skipped` : ''}${todo ? ` · ${todo} to classify` : ''}` : 'No payments found in that file. Check the line format in “Add from your iPhone”.');
  }
  function apBtn() {
    const l = S.cfg.apLast;
    return `<label class="btn-sm ap-btn">${icon('plus', 'sm')} Update from Apple Pay log<input type="file" id="ap-file" accept=".txt,.csv,text/plain,text/csv" hidden></label>${l ? (() => { const d = new Date(l.at); return `<span class="muted sm">Last update ${fmtDate(isoD(d))} at ${pad(d.getHours())}:${pad(d.getMinutes())}</span>`; })() : ''}`;
  }
