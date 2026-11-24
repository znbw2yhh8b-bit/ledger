'use strict';
  // ---------- month close ----------
  function closeInfo() {
    const cfg = S.cfg; const cur = C.budgetMonth(D.today, cfg.cutoff); const key = C.addMonths(cur, -1); const r = C.monthRange(key, cfg.cutoff);
    const todo = D.txs.filter((t) => t.month === key && t.cat === 'To classify').length;
    const stale = cfg.accounts.filter((a) => ['cash', 'savings', 'invest', 'locked'].includes(a.tier) && (a.asOf || '') < r.to && +a.balance !== 0);
    const snap = D.snaps.some(([d]) => d >= r.to);
    // step 3 is the Reconcile card on Wealth for this cycle: current accounts, Livret A and LDDS at the cycle end against the statements, after what you booked
    let wc = null; try { wc = wActCols().find((c) => c.key === key && c.kind === 'A') || null; } catch (e) { wc = null; }
    const wLab = { cash: 'Current accounts', la: 'Livret A', ld: 'LDDS' };
    const wCan = !!(wc && wc.s && W_BOOK.every((g) => wc.s[g] != null)); const wOpen = wCan ? W_BOOK.filter((g) => wc.open[g] != null && Math.abs(wc.open[g]) >= W_TOL) : [];
    const wOk = wCan && !wOpen.length;
    const wNote = !wc ? 'Needs the statements' : !wCan ? 'A balance at the cycle end is unknown' : wOk ? 'Every balance ties to the statements at the cycle end' : wOpen.map((g) => `${wLab[g]} ${wc.open[g] < 0 ? '−' : '+'}${Math.abs(wc.open[g]).toFixed(2)} €`).join(', ') + ' to fix or book on Wealth';
    const steps = [
      { id: 'stm', title: `Add statements ending ${fmtDate(r.to)}`, ok: C.covers(D.sgTo, r.to), act: 'pick', note: 'The Ledger CSV template, or an SG, Revolut or Trade Republic CSV' },
      { id: 'cls', title: todo ? `Classify ${todo} line${todo > 1 ? 's' : ''}` : 'Every line has a category', ok: todo === 0 && !!D.pl[key], act: 'go-todo' },
      { id: 'rec', title: 'Reconcile balances', ok: wOk, act: 'go-recon', optional: !wCan, note: wNote },
      { id: 'bal', title: 'Type your balances', ok: stale.length === 0 && snap, act: 'go-bal', note: stale.length ? `To check: ${stale.map((a) => a.name.replace(/ ••\d+/, '')).join(', ')}` : snap ? `Net worth recorded ${fmtDate(D.snaps[D.snaps.length - 1][0])}` : 'One figure per account, PEA value included' },
      { id: 'exp', title: 'Export a backup to iCloud Drive', ok: (S.cfg.lastExport || '') >= r.to, act: 'backup', optional: true, note: S.cfg.lastExport ? `Last export ${fmtDate(S.cfg.lastExport)}` : 'No export yet' },
      { id: 'close', title: `Close ${M.colCode(key, 'A')}`, ok: !!(S.overrides.reviewed || {})[key], act: 'close-go', note: 'Needs steps 1 to 4' },
    ];
    const req = steps.filter((x) => !x.optional);
    return { key, r, steps, stale, snap, done: req.filter((x) => x.ok).length, total: req.length };
  }
  // ---------- balance reconciliation: for every account with statements, opening + lines = closing, month by month ----------
  const RC_KEY = (st) => st.acctKey || ({ REV: 'rev', TR: 'tr' })[st.account] || (String(st.account).startsWith('SG') && st.role !== 'savings' ? 'sg' : null);
  const RC_LIVE = (st) => (String(st.account).startsWith('SG') && st.role !== 'savings' ? 'SG' : st.account === 'REV' ? 'REV' : st.account === 'TR' ? 'TR' : null);
  const rcNext = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
  const rcPrev = (d) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
  function reconInfo() {
    const cut = S.cfg.cutoff; const by = {};
    Object.values(S.stmts || {}).filter((st) => st.kind === 'statement' && (st.tx || []).length).forEach((st) => { (by[st.account] = by[st.account] || []).push(st); });
    return Object.entries(by).map(([account, list]) => {
      list.sort((a, b) => (a.from || '').localeCompare(b.from || ''));
      const k = RC_KEY(list[0]); const a = k ? S.cfg.accounts.find((x) => x.key === k) : null;
      const rows = {}; const R = (m) => (rows[m] = rows[m] || { key: m, open: null, inn: 0, out: 0, close: null, st: null, diff: null, gap: null, missing: null, cps: [] });
      const issues = []; let run = null, implied = false, lastTo = null, cpN = 0, cpBad = 0, low = null; const pts = [];
      for (const st of list) {
        const tx = st.tx.slice().sort((x, y) => x.date.localeCompare(y.date)); const total = C.sum(tx, (t) => t.amt); const m0 = C.budgetMonth(new Date((Date.parse(st.from) + Date.parse(st.to)) / 2).toISOString().slice(0, 10), cut);
        // a statement of about a month is one row; a longer one (Revolut, Livret A) is split by budget month
        const one = daysBetween(st.from, st.to) <= 35; const rowOf = (d) => (one ? m0 : C.budgetMonth(d, cut)); if (one) { R(m0).pf = st.from; R(m0).pt = st.to; }
        const r0 = rowOf(st.from); if (lastTo && st.from > rcNext(lastTo)) { R(r0).missing = [rcNext(lastTo), rcPrev(st.from)]; issues.push({ m: r0, kind: 'missing' }); }
        if (run == null) { if (st.opening != null) run = st.opening; else { run = C.r2(st.closing - total); implied = true; } }
        else if (st.opening != null && Math.abs(st.opening - run) >= 0.01) { R(r0).gap = C.r2(st.opening - run); issues.push({ m: r0, kind: 'gap' }); run = st.opening; }
        if (R(r0).open == null) R(r0).open = run; pts.push([rcPrev(st.from), run, true]);
        const cps = (st.checkpoints || []).slice().sort((x, y) => x.date.localeCompare(y.date)); let ci = 0;
        const checkCp = (upTo) => { while (ci < cps.length && (upTo == null || cps[ci].date < upTo)) { const c = cps[ci++]; const d = C.r2(c.bal - run); cpN++; if (Math.abs(d) >= 0.01) { cpBad++; R(C.budgetMonth(c.date, cut)).cps.push({ date: c.date, bal: c.bal, diff: d }); issues.push({ m: C.budgetMonth(c.date, cut), kind: 'cp' }); } } };
        for (const t of tx) {
          checkCp(t.date);
          const r = R(rowOf(t.date)); if (r.open == null) r.open = run;
          if (t.amt >= 0) r.inn += t.amt; else r.out -= t.amt;
          run = C.r2(run + t.amt); r.close = run; pts.push([t.date, run]);
          if (low == null || run < low.v) low = { v: run, d: t.date };
        }
        checkCp(null);
        if (st.closing != null) {
          const r = R(rowOf(st.to)); if (r.open == null) r.open = run; if (r.close == null) r.close = run;
          r.st = st.closing; r.stTo = st.to; r.partial = !!st.partial; r.diff = C.r2(st.closing - run);
          if (Math.abs(r.diff) >= 0.01) issues.push({ m: r.key, kind: 'close' });
          run = st.closing; pts.push([st.to, run]);
        }
        lastTo = lastTo && lastTo > st.to ? lastTo : st.to;
      }
      // a running balance below zero on an account that cannot go overdrawn means a line is missing
      const neg = implied && low && low.v < -0.5 ? low : null; if (neg) issues.push({ m: C.budgetMonth(neg.d, cut), kind: 'neg' });
      // the balance saved in the app against what the statements give on that day (plus Apple Pay entries since)
      let app = null;
      if (a && a.asOf && a.asOf >= list[0].from) {
        const at = (d) => { let v = null; for (const p of pts) { if (p[0] <= d) v = p[1]; else break; } return v; };
        const end = a.asOf <= lastTo ? a.asOf : lastTo; const stmtV = at(end);
        const code = RC_LIVE(list[0]); const live = code ? Object.values(S.live || {}).filter((e) => liveAcct(e) === code && e.date > end && e.date <= a.asOf) : [];
        const liveS = C.sum(live, (e) => e.amt); const exp = C.r2(stmtV + liveS); const diff = C.r2((+a.balance || 0) - exp);
        app = { asOf: a.asOf, bal: +a.balance || 0, end, stmtV, after: a.asOf > lastTo, liveN: live.length, liveS, exp, diff };
      }
      const keys = Object.keys(rows).sort(); const nIss = issues.length; const appOff = app && Math.abs(app.diff) >= 1;
      return { pts, account, name: a ? a.name : account, k, rows: keys.map((m) => rows[m]).reverse(), from: list[0].from, to: lastTo, implied, cpN, cpBad, neg, app, appOff, nIss, n: list.length, role: list[0].role };
    }).sort((x, y) => (x.role === 'savings') - (y.role === 'savings') || y.rows.length - x.rows.length);
  }
  function reconHtml() {
    const L = reconInfo(); if (!L.length) return '';
    const bad = L.reduce((s, x) => s + x.nIss, 0), off = L.filter((x) => x.appOff).length;
    const cell = (v) => `<td class="num">${v == null ? '<span class="muted">–</span>' : eur(v, 2)}</td>`;
    const dcell = (v) => v == null ? '<td class="num"><span class="muted">–</span></td>' : Math.abs(v) < 0.01 ? `<td class="num rc-ok">${icon('check', 'sm')} 0.00</td>` : `<td class="num rc-bad"><b>${v > 0 ? '+' : '−'}${eur(Math.abs(v), 2)}</b></td>`;
    const acc = (x) => {
      const st = x.nIss ? `<span class="chip chip-bad">${icon('alert', 'sm')}${x.nIss} to check</span>` : `<span class="chip chip-good">${icon('check', 'sm')}Reconciled</span>`;
      const notes = [];
      if (x.implied) notes.push(`The statement gives no opening balance, so the first one (${eur(x.rows[x.rows.length - 1].open, 2)} on ${fmtDate(x.from)}) is worked back from the closing balance.`);
      if (x.cpN) notes.push(`${x.cpN - x.cpBad} of ${x.cpN} balances printed inside the statements match.`);
      if (x.neg) notes.push(`<span class="rc-bad-t">The balance would go below zero (${eur(x.neg.v, 2)}) on ${fmtDate(x.neg.d)}: a line may be missing.</span>`);
      const rows = x.rows.map((r) => {
        const flag = (r.diff != null && Math.abs(r.diff) >= 0.01) || r.gap != null || r.missing || r.cps.length;
        const extra = [r.gap != null ? `Opening differs from the previous closing by ${r.gap > 0 ? '+' : '−'}${eur(Math.abs(r.gap), 2)}` : '', r.missing ? `No statement from ${fmtDate(r.missing[0])} to ${fmtDate(r.missing[1])}` : '', ...r.cps.map((c) => `Balance printed on ${fmtDate(c.date)}: ${eur(c.bal, 2)}, lines give ${eur(c.bal - c.diff, 2)}`)].filter(Boolean);
        return `<tr class="${flag ? 'rc-row-bad' : ''}"><td>${ML(r.key, true)}${r.pf ? ` <span class="muted sm">${fmtDate(r.pf)} – ${fmtDate(r.pt)}${r.partial ? ', so far' : ''}</span>` : r.partial ? ' <span class="muted sm">to ' + fmtDate(r.stTo) + '</span>' : ''}${extra.length ? `<div class="sm rc-bad-t">${extra.join(' · ')}</div>` : ''}</td>${cell(r.open)}${cell(r.inn)}${cell(r.out ? -r.out : 0)}${cell(r.close != null ? r.close : r.open)}${cell(r.st)}${dcell(r.diff)}</tr>`;
      }).join('');
      const ap = x.app ? `<div class="rc-app ${x.appOff ? 'off' : ''}"><span class="grow">${x.appOff ? icon('alert', 'sm') : icon('check', 'sm')} <b>Balance saved in the app</b> on ${fmtDate(x.app.asOf)}: ${eur(x.app.bal, 2)} · statements give ${eur(x.app.stmtV, 2)} on ${fmtDate(x.app.end)}${x.app.liveN ? `, ${eur(x.app.liveS, 2)} of ${x.app.liveN} entr${x.app.liveN === 1 ? 'y' : 'ies'} added here since` : ''}</span><b class="num ${x.appOff ? 'rc-bad-t' : ''}">${x.appOff ? `${x.app.diff > 0 ? '+' : '−'}${eur(Math.abs(x.app.diff), 2)}${x.app.after ? ' not yet on a statement' : ' unexplained'}` : 'matches'}</b></div>` : '';
      return `<details data-k="rc-${esc(x.account)}" class="rc-acc"${x.nIss || x.appOff ? ' open' : ''}><summary><span class="grow"><b>${esc(x.name)}</b> <span class="muted sm">${fmtDate(x.from)} ${x.from.slice(0, 4)} – ${fmtDate(x.to)} ${x.to.slice(0, 4)} · ${x.n} statement${x.n === 1 ? '' : 's'}</span></span>${st}</summary>
        <div class="tbl-w"><table class="tbl rc"><thead><tr><th>Month</th><th class="num">Opening</th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Closing, from lines</th><th class="num">Statement says</th><th class="num">Difference</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${ap}${notes.length ? `<p class="sm muted">${notes.join(' ')}</p>` : ''}</details>`;
    };
    return `<section class="card" id="recon"><div class="card-h"><h2>Balance reconciliation</h2>${bad ? `<span class="chip chip-bad">${icon('alert', 'sm')}${bad} difference${bad === 1 ? '' : 's'} in the statements</span>` : `<span class="chip chip-good">${icon('check', 'sm')}Statements reconcile to the cent</span>`}</div>
      <p class="sm muted">Each month: opening balance + money in − money out should equal the closing balance on the statement, and each statement should open where the previous one closed.${off ? ` ${off} saved balance${off === 1 ? '' : 's'} differ from what the statements give.` : ''}</p>
      ${L.map(acc).join('')}${(() => { const um = D.txs.filter((t) => t.unmatched); return um.length ? `<div class="rc-app off"><span class="grow">${icon('alert', 'sm')} <b>Transfers that never arrived</b>: ${um.map((t) => `${fmtDate(t.date)} ${t.date.slice(0, 4)}, ${chE(t.amt, 2)} from SG to ${t.unmatched === 'REV' ? 'Revolut' : 'Trade Republic'}`).join('; ')}. Not on the other account's statement, so counted as spending.</span>${um.map((t) => `<button type="button" class="btn-sm" data-act="rc-add" data-v="${esc(t.id)}">It is on ${t.unmatched === 'REV' ? 'Revolut' : 'Trade Republic'}: add the missing line</button>`).join('')}</div>` : ''; })()}</section>`;
  }

  // cash bridge for one budget month: left over − moved to savings ± between your accounts = change in cash,
  // checked against the statement balances of every current account that has lines that month
  function rcBal() {
    if (D._rcb) return D._rcb; const out = {};
    reconInfo().forEach((x) => { const P = x.pts; const first = P.length ? P[0][0] : null, last = x.to;
      out[x.account] = (d) => { if (!first || d < first) return null; const e = d > last ? last : d; let v = null; for (const p of P) { if (p[0] <= e) v = p[1]; else break; } return v; }; });
    return (D._rcb = out);
  }
  function cashBridge(k) {
    const p = D.pl[k]; if (!p) return null; const cfg = S.cfg; const raw = p.raw;
    const intl0 = C.r2(C.sum(Object.entries(p.byCat).filter(([c]) => M.bucketOf(cfg, c) === 'internal'), ([, v]) => v));
    const inM = D.txs.filter((t) => t.month === k); const own = inM.filter((t) => t.toOwn); const ownIn = C.r2(-C.sum(own, (t) => t.amt));
    const intl = C.r2(intl0 + ownIn); const change = C.r2(raw.surplus - raw.saving + intl); const lineSum = C.r2(C.sum(inM.filter((t) => !t.live), (t) => t.amt)); const liveSum = C.r2(C.sum(inM.filter((t) => t.live), (t) => t.amt));
    const rg = C.monthRange(k, cfg.cutoff); const dayB = new Date(Date.parse(rg.from) - 864e5).toISOString().slice(0, 10); const B = rcBal();
    let open = 0, close = 0, ok = true; const accts = [...new Set(inM.filter((t) => !t.live).map((t) => t.acct))];
    accts.forEach((a) => { const f = B[a]; const o = f ? f(dayB) : null, c = f ? f(rg.to) : null; if (o == null || c == null) ok = false; else { open += o; close += c; } });
    const stmt = ok && accts.length ? C.r2(close - open + ownIn) : null;
    return { k, own, ownIn, intl, change, lineSum: C.r2(lineSum + ownIn), liveSum, sav: raw.saving, sur: raw.surplus, open: C.r2(open), close: C.r2(close), stmt, diff: stmt == null ? null : C.r2(stmt - lineSum - ownIn), accts, unmatched: inM.filter((t) => t.unmatched) };
  }
  // step 4 and the page button open the same sheet
  function balSheetHtml() {
    if (!ui.balSheet) return '';
    const keys = S.cfg.accounts.filter((a) => a.tier !== 'receivable' && (+a.balance || 0) !== 0).map((a) => a.key);
    return `<div class="sheet-bg" data-act="bal-close"></div><section class="sheet" id="bal" role="dialog" aria-modal="true" aria-label="Update balances"><div class="card-h"><h2>Update balances</h2><button type="button" class="btn-ghost" data-act="bal-close">Close</button></div>${balances(keys)}</section>`;
  }
  function vClose() {
    const cl = D.close; const stmts = Object.values(S.stmts).sort((a, b) => (b.to || '').localeCompare(a.to || ''));
    return `
    <section class="card"><div class="card-h"><h2>Close ${ML(cl.key, true)}</h2><span class="muted sm">${cl.done} of ${cl.total} steps done</span></div>
      <div class="goal-bar"><i style="width:${(cl.done / cl.total * 100).toFixed(0)}%"></i></div>
      <ol class="steps">${cl.steps.map((st, i) => `<li class="${st.ok ? 'ok' : ''}"><span class="st-ic" aria-hidden="true">${st.ok ? icon('check') : i + 1}</span><div class="grow"><b>${esc(st.title)}</b>${st.optional ? ' <span class="tag tag-m">optional</span>' : ''}<div class="sm"><span class="${st.ok ? 'ok' : 'muted'}">${st.ok ? 'Done' : 'To do'}</span>${st.note ? `<span class="muted"> · ${esc(st.note)}</span>` : ''}</div></div>${st.ok ? '' : `<button class="btn-sm" data-act="${st.act}" ${st.act === 'close-go' && cl.steps.some((x) => x.id !== 'close' && !x.optional && !x.ok) ? 'disabled' : ''}>${{ pick: 'Choose file', backup: 'Export', 'go-todo': 'Classify', 'close-go': 'Close cycle', 'go-bal': 'Type balances', 'go-cash': 'See the check', 'go-recon': 'Open Reconcile' }[st.act]}</button>`}</li>`).join('')}</ol>
    </section>
    <section class="card"><div class="card-h"><h2>Add documents</h2></div>
      <label class="drop" id="drop" for="file-in">${icon('import', 'lg')}<div><b>Choose CSV files</b><div class="muted sm">SG, Revolut or Trade Republic CSV, or a CSV from your bank</div></div></label>
      <input id="file-in" type="file" accept=".csv,text/csv" multiple hidden>
      ${ui.busy ? `<p class="note">${icon('doc', 'sm')} Reading ${esc(ui.busy)}…</p>` : ''}${ui.csv ? csvMapper() : ''}${ui.pending.length ? pendingHtml() : ''}
    </section>
    ${cashCheckHtml(cl.key)}
    ${reconHtml()}
    <section class="card"><details data-k="saved"><summary><h2 class="inl">Saved statements</h2><span class="muted sm">${stmts.length}</span></summary>
      <div class="tbl-w"><table class="tbl"><thead><tr><th>Account</th><th>Period</th><th class="num">Lines</th><th class="num">Closing</th><th>Check</th><th></th></tr></thead><tbody>
      ${stmts.map((st) => `<tr><td>${esc(st.account)}${st.role === 'savings' ? ' <span class="muted sm">' + esc(st.accountType) + '</span>' : ''}</td><td>${fmtDate(st.from)} ${st.from ? st.from.slice(0, 4) : ''} – ${fmtDate(st.to)} ${st.to ? st.to.slice(0, 4) : ''}</td><td class="num">${(st.tx || []).length}</td><td class="num">${st.closing != null ? eur(st.closing, 2) : '–'}</td><td>${st.reconciled ? `<span class="ok">${icon('check', 'sm')} to the cent</span>` : st.reconciled === false ? `<span class="neg">${icon('alert', 'sm')} differs</span>` : st.partial ? '<span class="muted sm">so far, from the SG export: the PDF replaces it</span>' : '<span class="muted sm">CSV</span>'}</td><td class="act"><button class="btn-x ${ui.armed === st.id ? 'armed' : ''}" data-act="del-st" data-v="${esc(st.id)}" aria-label="Delete">${ui.armed === st.id ? 'Delete?' : icon('x')}</button></td></tr>`).join('')}
      </tbody></table></div></details></section>`;
  }
  // ---------- update center ----------
  const decodeBuf = (buf) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); } };
  const sgMain = () => { const l = Object.values(S.stmts).filter((x) => String(x.account).startsWith('SG') && x.role !== 'savings').sort((a, b) => (b.to || '').localeCompare(a.to || '')); return l.length ? l[0].account : 'SG-2341'; };
  // SG export (Excel/CSV): a few lines about the account, then Date;Libellé;Détail;Montant. Lines are read as they stand.
  function sgCsv(text, name) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const hi = lines.findIndex((l) => /date/i.test(l) && /(libell|montant|d[ée]bit|cr[ée]dit)/i.test(l)); if (hi < 0) return null;
    const parsed = C.parseCSV(lines.slice(hi).join('\n')); const map = parsed.map; if (map.date < 0 || (map.amount < 0 && map.debit < 0 && map.credit < 0)) return null;
    const detI = parsed.header.findIndex((h) => /d[ée]tail/i.test(h)); const account = sgMain();
    const tx = C.csvToTx(parsed, map, account).map((t) => t);
    if (detI >= 0) { const byKey = {}; parsed.rows.forEach((r) => { const d = (r[detI] || '').trim(); if (d) byKey[(r[map.desc] || '').trim()] = d; }); tx.forEach((t) => { const d = byKey[t.desc]; if (d && d !== t.desc) t.det = [d.slice(0, 200)]; }); }
    if (!tx.length) return null;
    return { kind: 'statement', bank: 'SG', mid: true, fileName: name, account, accountType: 'COMPTE DE PARTICULIER', from: tx[0].date, to: tx[tx.length - 1].date, opening: null, closing: null, tx, reconciled: null, id: `${account}_${tx[0].date}_${tx[tx.length - 1].date}_csv` };
  }
  function freshness() {
    const last = (f) => D.txs.filter(f).reduce((m, t) => (t.date > m ? t.date : m), '');
    const ap = Object.values(S.live || {}).filter((e) => e.src === 'applepay').reduce((m, e) => (e.date > m ? e.date : m), '');
    const apN = Object.values(S.live || {}).filter((e) => e.src === 'applepay' && e.date >= D.now.r.from).length;
    const accs = S.cfg.accounts.filter((a) => ['cash', 'savings', 'invest', 'locked'].includes(a.tier) && +a.balance !== 0 && a.asOf).map((a) => a.asOf).sort();
    return [
      { id: 'sg', name: 'Société Générale', last: D.sgTo, sub: 'Current account lines', how: 'pick' },
      { id: 'rev', name: 'Revolut', last: last((t) => t.acct === 'REV' && !t.live), sub: 'Card lines by category', how: 'pick' },
      { id: 'tr', name: 'Trade Republic', last: last((t) => t.acct === 'TR' && !t.live), sub: 'Card lines by category', how: 'pick' },
      { id: 'ap', name: 'Apple Pay log', last: ap, sub: apN ? `${apN} payment${apN > 1 ? 's' : ''} this month` : 'Nothing this month', how: 'ap' },
      { id: 'bal', name: 'Balances', last: accs[0] || '', sub: 'Oldest account update', how: 'bal' },
    ];
  }
  // twelve months, one mark each: closed, open, or missing a statement (tap to name the account)
  const BANKS = [['SG', 'Société Générale', (a) => String(a).startsWith('SG')], ['REV', 'Revolut', (a) => a === 'REV'], ['TR', 'Trade Republic', (a) => a === 'TR']];
  // a statement whose period spans the month counts, even if the account had no lines that month (Trade Republic is often quiet)
  const covered = (k, f) => { const r = C.monthRange(k, S.cfg.cutoff); return Object.values(S.stmts || {}).some((st) => st.kind === 'statement' && f(st.account) && st.from <= r.to && st.to >= r.from); };
  function monthMarks() {
    const first = {}; BANKS.forEach(([id, , f]) => { const ks = D.txs.filter((t) => !t.live && f(t.acct)).map((t) => t.month).sort(); first[id] = ks[0] || null; });
    return Array.from({ length: 12 }, (_, i) => C.addMonths(D.now.key, i - 11)).map((k) => { const missing = BANKS.filter(([id, , f]) => first[id] && k >= first[id] && k !== D.now.key && !D.txs.some((t) => t.month === k && !t.live && f(t.acct)) && !covered(k, f)).map(([, n]) => n);
      const any = BANKS.some(([id]) => first[id] && k >= first[id]); return { k, missing, state: !any ? 'none' : missing.length ? 'missing' : D.complete.includes(k) ? 'closed' : 'open' }; });
  }
  function monthStrip() {
    const ms = monthMarks(); const sel = ms.find((m) => m.k === ui.updM); const lab = { closed: 'Closed', open: 'Open', missing: 'Missing a statement', none: 'No statements yet' };
    return '<section class="card"><div class="card-h"><h2>Last twelve months</h2><span class="muted sm">Filled: closed · ring: open · dashed: a statement is missing · tap a month</span></div><div class="mstrip" role="group" aria-label="Month status">' + ms.map((m) => '<button type="button" class="mm ' + m.state + (sel && sel.k === m.k ? ' on' : '') + '" data-act="upd-m" data-v="' + m.k + '" aria-pressed="' + !!(sel && sel.k === m.k) + '"><span class="mk" aria-hidden="true"></span><span>' + esc(ML(m.k, true).replace(/ \d{4}$/, '')) + '</span><span class="sr">' + lab[m.state] + '</span></button>').join('') + '</div>'
      + (sel ? '<p class="sm mt"><b>' + esc(ML(sel.k, true)) + ':</b> ' + (sel.missing.length ? 'no statement lines from ' + esc(sel.missing.join(', ')) + '.' : sel.state === 'none' ? 'no statements yet.' : sel.state === 'closed' ? 'closed, every account has its statement.' : 'still open.') + '</p>' : '') + '</section>';
  }
  function vUpdate() {
    const N = D.now; const F = freshness();
    const st = (d) => { if (!d) return ['bad', 'none yet']; const a = daysBetween(d, D.today); return [a <= 3 ? 'good' : a <= 10 ? 'warn' : 'bad', a <= 0 ? 'today' : a === 1 ? 'yesterday' : `${a} days ago`]; };
    const tiles = `<div class="tm-w ot-w"><table class="tm-t ot-t w-kv"><thead><tr><th class="tm-l">Source</th><th class="num">Runs to</th><th class="num tm-u">Age</th></tr></thead><tbody>${F.map((f) => { const [k, t] = st(f.last); return `<tr><th scope="row" class="tm-l"><i class="mk mk-${k}" aria-hidden="true"></i> ${esc(f.name)}</th><td class="num">${f.last ? esc(fmtDate(f.last)) : '<span class="muted">–</span>'}</td><td class="num tm-u">${esc(t)}</td></tr>`; }).join('')}</tbody></table></div>`;
    const stmts = Object.values(S.stmts).filter((x) => x.mid).length;
    return `
    <section class="card"><div class="card-h"><h2>Data freshness</h2><span class="muted sm">Latest line or balance</span></div>${tiles}</section>
    <section class="card"><div class="card-h"><h2>Apple Pay</h2><span class="muted sm">ApplePay.txt from iCloud Drive</span></div><div class="row wrap ap-row">${apBtn()}</div></section>
    <section class="card"><details data-k="upd-files"><summary><h2 class="inl">What each file does</h2></summary>
      <table class="tm-t ot-t w-kv"><tbody>
        <tr><th class="tm-l">SG CSV</th><td>Adds the lines; reaching the cycle end lets it close${stmts ? ` (${stmts} saved)` : ''}</td></tr>
        <tr><th class="tm-l">Revolut / TR CSV</th><td>Splits card spending by category</td></tr>
        <tr><th class="tm-l">Apple Pay log</th><td>Fills the gap until a statement covers those days</td></tr>
      </tbody></table></details></section>`;
  }
  function pendingHtml() {
    return `<div class="pend"><h3>Ready to save</h3><ul class="pend-l">${ui.pending.map((p, i) => {
      if (p.kind === 'bal') return `<li><div class="pl-h">${icon('doc')}<b>${esc(p.name)}</b></div><div class="muted sm">Balance ${eur(p.balance, 2)} on ${fmtDate(p.date)}${p.date < (acct(p.acctKey).asOf || '') ? ' · older than the one saved, kept as is' : ''}</div></li>`;
      if (p.bank === 'TPL') { const todo = p.tx.filter((t) => C.categorise(t, S.rules.list, S.overrides.map) === 'To classify').length; return `<li${p.reconciled === false ? ' class="neg"' : ''}><div class="pl-h">${p.reconciled ? icon('check', 'ok') : p.reconciled === false ? icon('alert', 'neg') : icon('doc')}<b>${esc(p.accountType)}</b> ${fmtDate(p.from)} – ${fmtDate(p.to)} ${p.to.slice(0, 4)}</div><table class="tm-t ot-t w-kv sm"><tbody><tr><th class="tm-l">New lines</th><td class="num">${frNum(p.tx.length)}</td></tr>${p.dupes ? `<tr><th class="tm-l">Already in, skipped</th><td class="num">${frNum(p.dupes)}</td></tr>` : ''}${todo ? `<tr><th class="tm-l">To classify</th><td class="num">${frNum(todo)}</td></tr>` : ''}<tr><th class="tm-l">Closing balance</th><td class="num">${p.closing != null ? eur(p.closing, 2) : 'Not in the file'}</td></tr><tr><th class="tm-l">Against the previous statement</th><td class="num">${p.gap == null ? 'No earlier balance' : Math.abs(p.gap) < 0.01 ? 'Ties' : 'Gap ' + eur(p.gap, 2)}</td></tr></tbody></table></li>`; }
      if (p.kind === 'statement' && p.role === 'savings') return `<li><div class="pl-h">${p.reconciled ? icon('check', 'ok') : icon('alert', 'neg')}<b>${esc(p.accountType)} ${esc(p.account)}</b> ${fmtDate(p.from)} – ${fmtDate(p.to)} ${p.to ? p.to.slice(0, 4) : ''}</div><div class="muted sm">${esc(p.fileName)} · closing ${eur(p.closing, 2)} on ${fmtDate(p.to)}${p.reconciled ? ' · reconciles to the cent' : ''} · updates the balance only if it is newer than the one saved (${eur(acct(p.acctKey || '').balance || 0)} on ${fmtDate(acct(p.acctKey || '').asOf)})</div></li>`;
      if (p.kind === 'statement') { const exists = S.stmts[p.id]; const todo = p.tx.filter((t) => C.categorise(t, S.rules.list, S.overrides.map) === 'To classify').length; return `<li><div class="pl-h">${p.reconciled ? icon('check', 'ok') : p.reconciled === false ? icon('alert', 'neg') : icon('doc')}<b>${esc(p.account)}</b> ${fmtDate(p.from)} – ${fmtDate(p.to)} ${p.to ? p.to.slice(0, 4) : ''}</div><div class="muted sm">${esc(p.fileName)} · ${p.tx.length} lines${p.closing != null ? ` · closing ${eur(p.closing, 2)}` : ''}${p.reconciled ? ' · reconciles to the cent' : p.reconciled === false ? ' · does not reconcile, check it' : ''}${todo ? ` · ${todo} to classify` : ''}${exists ? ' · replaces the saved copy' : ''}</div></li>`; }
      if (p.kind === 'payslip') return `<li><div class="pl-h">${icon('doc')}<b>Payslip ${ML(p.month, true)}</b></div><div class="muted sm">Net taxable ${eur(p.netTaxable.month, 2)} (year to date ${eur(p.netTaxable.ytd)}), withholding ${eur(p.pas.month, 2)} at ${(p.pasRate * 100).toFixed(1)}% (year to date ${eur(p.pas.ytd)}). Shown next to your tax rate in the forecast assumptions.</div></li>`;
      return `<li class="neg"><div class="pl-h">${icon('alert')}<b>${esc(p.fileName)}</b></div><div class="sm">${esc(p.error)}</div></li>`;
    }).join('')}</ul><div class="row end"><button class="btn-ghost" data-act="pend-clear">Discard</button><button class="btn" data-act="pend-save" ${ui.pending.some((p) => p.kind !== 'unknown') ? '' : 'disabled'}>Save ${ui.pending.filter((p) => p.kind !== 'unknown').length}</button></div></div>`;
  }
  function csvMapper() {
    const c = ui.csv; const opt = (sel) => `<option value="-1">–</option>` + c.parsed.header.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h)}</option>`).join('');
    return `<div class="csv"><h3>${esc(c.name)}</h3><div class="row wrap">
      <label class="ctl"><span class="ctl-l">Account</span><select id="csv-acct" class="sel">${[['TR', 'Trade Republic'], ['REV', 'Revolut'], ['FO', 'Fortuneo'], ['OTHER', 'Other']].map(([k, l]) => `<option value="${k}" ${c.acct === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${['date', 'desc', 'amount', 'debit', 'credit'].map((k) => `<label class="ctl"><span class="ctl-l">${{ date: 'Date', desc: 'Description', amount: 'Amount', debit: 'Debit', credit: 'Credit' }[k]}</span><select class="sel" data-map="${k}">${opt(c.map[k])}</select></label>`).join('')}
    </div><div class="muted sm">${c.parsed.rows.length} rows. First: ${esc((c.parsed.rows[0] || []).join(' · ').slice(0, 120))}</div><div class="row end"><button class="btn-ghost" data-act="csv-cancel">Cancel</button><button class="btn-sm" data-act="csv-ok">Read ${c.parsed.rows.length} rows</button></div></div>`;
  }

