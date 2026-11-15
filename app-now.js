'use strict';
  // ---------- this month, live ----------
  const ART_URL = location.origin + location.pathname; // the address this app is opened from
  const FLEX = ['Groceries', 'Eating out & cafés', 'Shopping & leisure', 'Trips & holidays', 'Spending in Lebanon', 'Transport', 'Health & pharmacy', 'Other spending'];
  const VIA = ['Spent via Revolut', 'Spent via Trade Republic'];
  const SLUG = { groceries: 'Groceries', eating: 'Eating out & cafés', food: 'Eating out & cafés', restaurant: 'Eating out & cafés', shopping: 'Shopping & leisure', clothes: 'Shopping & leisure', leisure: 'Shopping & leisure', trips: 'Trips & holidays', travel: 'Trips & holidays', transport: 'Transport', health: 'Health & pharmacy', other: 'Other spending' };
  const SHORT_CAT = { 'Spending in Lebanon': 'Lebanon', 'Eating out & cafés': 'Eating out', 'Shopping & leisure': 'Shopping', 'Trips & holidays': 'Trips', 'Health & pharmacy': 'Health', 'Other spending': 'Other' };
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  // food at home a day: groceries less ~10% for cleaning and household products, over the days of the month (or so far)
  const foodShare = () => (S.cfg.foodShare > 0 && S.cfg.foodShare <= 1 ? S.cfg.foodShare : 0.9);
  // days away: runs of trip or Lebanon card spending (gaps of up to 5 days filled, flights left out),
  // cut by any day with an in-store card purchase in France (SG card in a shop, Revolut or Trade Republic groceries)
  function awayDays() {
    if (D._away) return D._away; const AIR = /AIR|AIRWAYS|TRANSAVIA|ETIHAD|EASYJET|RYANAIR|VUELING|MEA\b|SNCF|BOOKING|AIRBNB/i;
    const next = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
    const cardDay = (t) => { const m = /^CARTE X\d{4} (\d\d)\/(\d\d) /.exec(t.desc); if (!m) return null; let y = +t.date.slice(0, 4); if (+m[2] === 12 && t.date.slice(5, 7) === '01') y--; return `${y}-${m[2]}-${m[1]}`; };
    const ONLINE = /APPLE\.COM|COMMERCE ELECTRONIQUE|AMAZON|NETFLIX|WELLPASS|PAYPAL|GOOGLE|SPOTIFY|OPENAI|ENSA|TRANSF|SNCF|UBER/i;
    const home = new Set(); D.txs.forEach((t) => {
      if (String(t.acct).startsWith('SG') && t.amt < 0) { const d = cardDay(t); if (d && !ONLINE.test(`${t.desc} ${(t.det || []).join(' ')}`)) home.add(d); }
      else if ((t.acct === 'REV' || t.acct === 'TR') && t.amt < 0 && (t.cat === 'Groceries' || t.cat === 'Eating out & cafés')) home.add(t.date);
    });
    const ds = [...new Set(D.txs.filter((t) => (t.cat === 'Spending in Lebanon' || t.cat === 'Trips & holidays') && t.amt < 0 && !AIR.test(`${t.desc} ${(t.det || []).join(' ')}`)).map((t) => t.date))].sort(); const tripDay = new Set(ds);
    const runs = []; ds.forEach((d) => { const r = runs[runs.length - 1]; let blocked = false; if (r) for (let x = next(r[1]); x < d; x = next(x)) if (home.has(x)) { blocked = true; break; }
      if (r && !blocked && daysBetween(r[1], d) <= 5) r[1] = d; else runs.push([d, d]); });
    const set = new Set(); runs.filter(([x, y]) => x !== y).forEach(([x, y]) => { for (let d = x; d <= y; d = next(d)) if (tripDay.has(d) || !home.has(d)) set.add(d); });
    D._away = set; return set;
  }
  // food at home a day: 90% of groceries (the rest is cleaning and household), over the days you were in Paris
  function foodStats(key, from, to) {
    const m = D.txs.filter((t) => t.month === key); const g = -C.sum(m.filter((t) => t.cat === 'Groceries'), (t) => t.amt); const out = -C.sum(m.filter((t) => t.cat === 'Eating out & cafés'), (t) => t.amt);
    const outN = m.filter((t) => t.cat === 'Eating out & cafés' && t.amt < 0).length; const away = awayDays();
    let days = 0, awayN = 0; for (let d = from; d <= to; d = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10)) { if (away.has(d)) awayN++; else days++; }
    const itemised = new Set(m.map((t) => t.acct));
    const hidden = m.some((t) => t.cat === 'Card bill (closed)' && t.amt < 0) ? 'Amex' : m.some((t) => t.cat === 'Spent via Revolut' && t.amt < 0) && !itemised.has('REV') ? 'Revolut' : m.some((t) => t.cat === 'Spent via Trade Republic' && t.amt < -310) && !itemised.has('TR') ? 'Trade Republic' : null;
    return { groc: g, food: g * foodShare(), out, outN, days, awayN, perDay: days ? (g * foodShare()) / days : 0, hidden };
  }
  function foodMonth(key) { const r = C.monthRange(key, S.cfg.cutoff); return foodStats(key, r.from, r.to); }
  // usual: median of the closed months where every card is itemised
  function foodUsual(before) {
    const v = D.complete.filter((k) => k < before).map(foodMonth).filter((f) => !f.hidden && f.days >= 10).map((f) => f.perDay).slice(-6).sort((a, b) => a - b);
    if (!v.length) return null; const mid = Math.floor(v.length / 2); return { perDay: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2, n: v.length };
  }
  function nowInfo() {
    const cfg = S.cfg; const key = C.budgetMonth(D.today, cfg.cutoff); const r = C.monthRange(key, cfg.cutoff);
    const inR = (e) => e.date >= r.from && e.date <= r.to; const srt = (a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0);
    const covered = D.live.covered.filter(inR).sort(srt); const list = D.live.open.filter(inR).sort(srt);
    // day-to-day lines already on a statement imported for this month (a partial SG export, the TR or Revolut CSV)
    // a top-up to Revolut or Trade Republic is only a move once that account's own lines are in for the month
    const itemised = new Set(D.txs.filter((t) => t.month === key && !String(t.acct).startsWith('SG')).map((t) => t.acct)); const TOP = { 'Spent via Revolut': 'REV', 'Spent via Trade Republic': 'TR' };
    const lines = D.txs.filter((t) => t.month === key && !t.live && !(TOP[t.cat] && itemised.has(TOP[t.cat]) && !t.unmatched) && (FLEX.includes(t.cat) || VIA.includes(t.cat) || (t.cat === 'To classify' && t.amt < 0))).sort((a, b) => b.date.localeCompare(a.date));
    const flexL = list.filter((e) => isFlexCat(liveCat(e))); const otherL = list.filter((e) => !isFlexCat(liveCat(e)));
    const spent = C.sum(flexL, (e) => -e.amt) + C.sum(lines, (t) => -t.amt); const byCat = {}; flexL.forEach((e) => { const c = liveCat(e); byCat[c] = (byCat[c] || 0) - e.amt; }); lines.forEach((t) => { byCat[t.cat] = (byCat[t.cat] || 0) - t.amt; });
    const usualCat = (c) => Math.max(0, -(D.rr.cats[c] || 0));
    const usualFlex = C.sum(FLEX.concat(VIA), usualCat);
    const budget = cfg.flexBudget > 0 ? cfg.flexBudget : Math.max(50, Math.round(usualFlex / 50) * 50);
    const total = daysBetween(r.from, r.to) + 1; const day = Math.min(total, Math.max(1, daysBetween(r.from, D.today) + 1));
    const fixedUsual = Math.max(0, D.rr.avg.essentials + D.rr.avg.lifestyle - usualFlex);
    return { key, r, list, lines, covered, otherL, spent, byCat, budget, usualFlex, total, day, left: budget - spent, pace: day / total, proj: day >= 3 ? spent / (day / total) : null, fixedUsual };
  }
  function addLive({ cents, cat, merchant, date, src }) {
    if (!(cents > 0)) { toast('No amount came through. In the shortcut, Calculate must use the payment’s Amount × 100, rounded to Ones.'); return null; }
    const amt = -Math.abs(cents) / 100; const m = (merchant || '').trim();
    let c = cat;
    if (!c) { const guess = m ? C.categorise({ id: 'q', desc: m.toUpperCase(), det: [], amt, acct: 'LIVE' }, S.rules.list, {}) : null; c = guess && guess !== 'To classify' && M.bucketOf(S.cfg, guess) !== 'income' ? guess : 'Other spending'; }
    const dup = Object.values(S.live || {}).find((e) => Math.abs(e.amt - amt) < 0.005 && (e.merchant || '') === m && Date.now() - (e.at || 0) < 180000);
    if (dup) { toast('Already added a moment ago'); return null; }
    const e = { id: 'l' + Date.now().toString(36) + uid8().slice(0, 4), date: date || todayISO(), amt: C.r2(amt), cat: c, merchant: m, src: src || 'app', at: Date.now(), _q: true };
    S.live = S.live || {}; S.live[e.id] = e; ui.fresh = e.id; writeLive(e); changed();
    toast(`Added ${eur(-e.amt, 2)}${m ? ` at ${C.titleCase(m)}` : ''} · ${e.cat}`); return e;
  }
  // #add-2350-cat-groceries-at-monoprix : amount in cents, then an optional category and shop
  function intake(hash) {
    const h = String(hash || '').replace(/^#/, ''); if (!/^add(-|$)/.test(h)) return false;
    const mm = /^add-(\d{1,7})(?:-cat-([a-z]+))?(?:-at-([a-z0-9-]+))?/.exec(h.toLowerCase());
    if (mm) addLive({ cents: +mm[1], cat: mm[2] ? SLUG[mm[2]] : null, merchant: mm[3] ? mm[3].replace(/-+/g, ' ').trim() : '', src: 'shortcut' });
    ui.view = 'report'; ui.month = null; ui.focusAdd = !mm;
    try { history.replaceState(null, '', '#report'); } catch (e) { location.hash = 'report'; }
    return true;
  }
  // regular payments seen last month (rent, bills, subscriptions) and plan events, placed in this month
  function dueThisMonth(N) {
    const cfg = S.cfg; const r = N.r; const fromD = +r.from.slice(8);
    const dim = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
    const at = (d) => { const ym = d >= fromD ? r.from.slice(0, 7) : r.to.slice(0, 7); return `${ym}-${String(Math.min(d, dim(ym))).padStart(2, '0')}`; };
    const rec = D.lastKey ? C.detectRecurring(D.txs, D.lastKey, 4).filter((x) => C.budgetMonth(x.lastDate, cfg.cutoff) === D.lastKey && x.cat !== 'Livret A' && x.cat !== 'LDDS' && x.cat !== 'Paid for Paul' && !/PAUL\s*AL\s*HELOU|PAUL\s*ALHELOU/i.test(x.name)) : [];
    const items = rec.map((x) => ({ date: at(x.day), name: C.titleCase(x.name), sub: x.cat, amt: -x.last, src: 'rec' }));
    // the monthly PEA step from the savings order
    const A = cfg.assume; const due = [];
    const pea = (A.order || []).find((r) => r.rule === 'fixed' && r.acct === 'pea' && r.on !== false && (!r.from || N.key >= r.from)); if (pea) due.push({ name: pea.name, group: 'save', acct: 'pea', amount: pea.amount });
    due.forEach((l) => items.push({ date: null, name: l.name, sub: l.group === 'save' ? `Moved to ${acct(l.acct).name}` : l.group === 'in' ? (l.acct && l.acct !== 'cash' ? `Paid into ${acct(l.acct).name}` : 'Income') : 'Plan event', amt: l.group === 'in' ? +l.amount : -l.amount, src: 'ev', ev: l }));
    // check each one against the lines already imported for this month (partial statements included)
    const got = D.txs.filter((t) => t.month === N.key); const used = new Set(); const sgTo = D.sgTo || '';
    const evCat = (l) => l.cat || (l.group === 'save' && l.acct === 'pea' ? 'PEA & investments' : null);
    items.forEach((x) => {
      if (x.src === 'rec') {
        const m = got.find((t) => !used.has(t.id) && t.cat === x.sub && Math.abs(t.amt - x.amt) <= Math.max(2, Math.abs(x.amt) * 0.15) && fold(C.titleCase(C.merchant(t))) === fold(x.name));
        if (m) { used.add(m.id); x.paid = { date: m.date, amt: m.amt }; } else if (x.date && sgTo && x.date <= sgTo) x.late = true;
      } else if (x.ev) {
        const c = evCat(x.ev); if (!c) return; const ls = got.filter((t) => t.cat === c && (x.amt < 0 ? t.amt < 0 : t.amt > 0) && !used.has(t.id));
        if (ls.length) { ls.forEach((t) => used.add(t.id)); x.paid = { date: ls[ls.length - 1].date, amt: C.r2(C.sum(ls, (t) => t.amt)) }; }
      }
    });
    // second pass, for bills whose amount moves each month (a phone line, electricity): a line from the same payee left over pays the unpaid bill closest to it in amount
    got.filter((t) => !used.has(t.id) && t.amt < 0).forEach((t) => {
      const nm = fold(C.titleCase(C.merchant(t))); let best = null;
      items.forEach((x) => { if (x.src !== 'rec' || x.paid || x.sub !== t.cat || fold(x.name) !== nm) return; if (!best || Math.abs(t.amt - x.amt) < Math.abs(t.amt - best.amt)) best = x; });
      if (best) { used.add(t.id); best.paid = { date: t.date, amt: t.amt }; delete best.late; }
    });
    items.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.amt - b.amt);
    const left = items.filter((x) => x.amt < 0 && !x.paid && (!x.date || x.date >= D.today || x.late));
    return { items, leftSum: C.sum(left, (x) => -x.amt), leftN: left.length };
  }
  function dueRow(x) { const done = !!x.paid; const diff = done && Math.abs(x.paid.amt - x.amt) >= 0.5; const st = done ? `<span class="ok">${icon('check', 'sm')} ${x.amt < 0 ? 'paid' : 'received'} ${fmtDate(x.paid.date)}${diff ? `: ${eur(Math.abs(x.paid.amt), 2)} instead of ${eur(Math.abs(x.amt), 2)}` : ''}</span>` : x.late ? '<span class="warn-t">not on your statements yet</span>' : x.date && x.date < D.today ? 'probably paid' : 'to come';
            return `<li class="txr ${done ? 'past' : ''}"><div class="tx-d">${done ? fmtDate(x.paid.date) : x.date ? fmtDate(x.date) : 'Plan'}</div><div class="tx-m"><div class="tx-n">${esc(x.name)}</div><div class="tx-s">${esc(x.sub)} · ${st}</div></div><div class="tx-a num ${x.amt > 0 ? 'pos' : ''}">${eurL(done ? x.paid.amt : x.amt, 2)}</div></li>`; ; }
  // money in for the open month: received so far against the usual month
  function incomeInfo(N) {
    const cfg = S.cfg; const one = S.overrides.oneoff || {}; const got = D.txs.filter((t) => t.month === N.key && t.amt > 0 && M.bucketOf(cfg, t.cat) === 'income').sort((a, b) => b.date.localeCompare(a.date));
    const reg = got.filter((t) => !one[t.id]); const oo = got.filter((t) => one[t.id]);
    const rec = C.sum(reg, (t) => t.amt); const usual = D.rr.avg.income || 0; const exp = Math.max(rec, usual);
    return { got, reg, oo, ooSum: C.sum(oo, (t) => t.amt), rec, usual, exp, toCome: Math.max(0, exp - rec) };
  }
  // watched lines for the month so far (statement lines plus Apple Pay entries), against the median of the last closed months
  const WATCH_NAMES = { groceries: 'Groceries', eating: 'Eating out', food: 'Food total', subs: 'Subscriptions', other: 'Other spending', friends: 'Friends, net', paul: 'Paid for Paul' };
  function watchedMonth(key, txs, ctx) { const st = C.statement(txs, key, { trPea: S.cfg.trPea }); return C.watched(st, txs, key, ctx); }
  // quick add lives in a sheet opened from the + in the header
  function sheetHtml() {
    if (!ui.sheetOpen) return ''; const inc = ui.qmode === 'income'; ui.pito = ui.pito || 'pee';
    return `<div class="sheet-bg" data-act="sheet-close"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${inc ? 'Add income' : 'Add a purchase'}"><div class="card-h"><h2>${inc ? 'Add income' : 'Add a purchase'}</h2><button type="button" class="btn-ghost" data-act="sheet-close">Close</button></div>
      <div class="seg-ctl q-mode" role="group" aria-label="Type"><button type="button" class="${inc ? '' : 'on'}" data-act="q-mode" data-v="spend" aria-pressed="${!inc}">Spending</button><button type="button" class="${inc ? 'on' : ''}" data-act="q-mode" data-v="income" aria-pressed="${inc}">Income</button></div>
      <p class="muted sm">${inc ? 'Paid straight into savings, e.g. participation' : 'Cash, or before it reaches a statement'}</p>
      ${inc ? `<form id="pi-form" class="qadd" autocomplete="off">
        <label class="q-amt"><span class="sr">Amount in euros</span><span class="q-eur">€</span><input id="pi-amt" class="inp num" inputmode="decimal" placeholder="0" required></label>
        <select id="pi-to" class="sel inp" aria-label="Goes to">${PAID_TO_F().map(([k, l]) => `<option value="${k}" ${ui.pito === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <input id="pi-name" class="inp" placeholder="What, e.g. Participation 2026" aria-label="What">
        <input id="pi-date" class="inp" type="date" value="${D.today}" aria-label="Date">
        <button class="btn q-go" type="submit">${icon('plus', 'sm')} Add</button>
      </form></section>` : ''}
      ${inc ? '' : `<form id="q-form" class="qadd" autocomplete="off">
        <label class="q-amt"><span class="sr">Amount in euros</span><span class="q-eur">€</span><input id="q-amt" class="inp num" inputmode="decimal" placeholder="0" required></label>
        <div class="q-cats" role="group" aria-label="Category">${FLEX.map((c) => `<button type="button" class="q-cat ${ui.qcat === c ? 'on' : ''}" data-act="q-cat" data-v="${esc(c)}" aria-pressed="${ui.qcat === c}">${esc(SHORT_CAT[c] || c)}</button>`).join('')}</div>
        <input id="q-merchant" class="inp" placeholder="Where" aria-label="Where (optional)">
        <input id="q-date" class="inp" type="date" value="${D.today}" aria-label="Date">
        <button class="btn q-go" type="submit">${icon('plus', 'sm')} Add</button>
      </form></section>`}`;
  }
  function shortcutHtml() {
    const tmpl = `${ART_URL}#add-`;
    return `<section class="card"><details data-k="shortcut"><summary><h2 class="inl">Add from your iPhone</h2><span class="muted sm">Log every Apple Pay payment, then update here with one tap</span></summary>
      <h3>1. Log each payment (once, about 5 minutes)</h3>
      <ol class="method">
        <li>On your iPhone open <b>Shortcuts → Automation → + → Transaction</b>. Select all your cards, leave “When I tap” on, choose <b>Run Immediately</b>, then <b>New Blank Automation</b>.</li>
        <li>Add <b>Format Date</b>: date = <i>Current Date</i>, format <b>Custom</b>, <code>yyyy-MM-dd HH:mm</code>.</li>
        <li>Add <b>Text</b> and write one line: <code>[Formatted Date] | [Amount] | [Merchant] | [Card or Pass]</code>, picking the last three from the Shortcut Input variables.</li>
        <li>Add <b>Append to Text File</b>: the Text, file path <code>Ledger/ApplePay.txt</code> in iCloud Drive, “Make New Line” on. Turn off “Ask Before Running” and notifications if offered.</li>
        <li>Pay once with Apple Pay and check that <code>iCloud Drive/Shortcuts/Ledger/ApplePay.txt</code> has a line like <code>2026-11-06 12:31 | 4,50 € | Monoprix | SG Visa</code>.</li>
      </ol>
      <h3 class="mt">2. Update the running month</h3>
      <ol class="method">
        <li>Tap <b>Update from Apple Pay log</b> in “Add a purchase” and pick <code>ApplePay.txt</code> (Files remembers the folder). New payments are added once; lines already in are skipped, so never edit or empty the file by hand.</li>
        <li>Shops your rules know get a category; others show as “To classify” in Entries.</li>
        <li>Dollar payments are converted at the day’s rate. Lebanese pound payments are skipped: add those in euros by hand.</li>
      </ol>
      <p class="sm muted mt">These entries only feed This month. At month close the statements replace them: the report and cash-flow trend use statement lines only.</p>
      <details class="mt"><summary class="sm"><b>Older option: open a link per payment</b> </summary>
      <ol class="method">
        <li>The shortcut opens this page with the purchase in the address. The format is the page address, then <code>#add-</code>, the amount in cents, then optionally <code>-cat-</code> and a category, then <code>-at-</code> and the shop.</li>
        <li>Example: <code>${esc(tmpl)}2350-cat-groceries-at-monoprix</code> adds €23.50 at Monoprix under Groceries.</li>
      </ol>
      <div class="row wrap"><code class="url-c" id="url-t">${esc(tmpl)}</code><button class="btn-sm" type="button" data-act="copy-url">${icon('copy', 'sm')} Copy</button></div></details>
    </details></section>`;
  }

