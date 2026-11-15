'use strict';
  // ---------- reading files ----------
  // Revolut "consolidated statement" CSV: one section per currency account and pocket, each with its running balance.
  // Amounts are taken in euros (the euro column for USD/GBP accounts); pockets are included so moves into them net to zero.
  function revConsolidatedCsv(text, name) {
    const L = text.replace(/^﻿/, '').split(/\r?\n/).map(csvSplit);
    const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const iso = (s) => { const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(String(s || '').trim()); return m ? `${m[3]}-${MON[m[1]]}-${m[2].padStart(2, '0')}` : null; };
    const num = (s) => { s = String(s == null ? '' : s).trim(); if (!s) return NaN; const neg = /^-/.test(s); const v = parseFloat(s.replace(/[^\d.]/g, '')); return isNaN(v) ? NaN : neg ? -v : v; };
    let inTx = false, sec = null, hdr = null; const secs = {}; const order = [];
    for (const r of L) {
      const c0 = String(r[0] || '').trim();
      if (/^Current Accounts Transaction Statements$/.test(c0)) { inTx = true; continue; }
      if (/^(Savings Accounts|Flexible Cash Funds|Investment Services|Crypto) Transaction Statements$/.test(c0)) { inTx = false; continue; }
      if (!inTx) continue;
      if (/^(Personal Account|Savings)\s*\(/.test(c0)) { sec = c0.replace(/\s+/g, ' '); hdr = null; if (!secs[sec]) { secs[sec] = []; order.push(sec); } continue; }
      if (c0 === 'Date') { hdr = r; continue; }
      const d = iso(c0); if (!hdr || !d || !sec) continue;
      const two = hdr.filter((h) => /money in\/out/i.test(h)).length === 2;
      const eur = two ? num(r[4]) : num(r[3]); const bal = two ? num(r[6]) : num(r[4]); if (isNaN(eur)) continue;
      secs[sec].push({ date: d, desc: String(r[1] || '').trim(), kind: String(r[2] || '').trim(), amt: C.r2(eur), bal: isNaN(bal) ? null : bal, orig: two ? String(r[3] || '').trim() : '' });
    }
    const lines = []; let opening = 0, closing = 0;
    order.forEach((s) => { const l = secs[s]; if (!l.length) return; opening += l[0].bal - l[0].amt; closing += l[l.length - 1].bal;
      const cur = (/\((\w{3})\)/.exec(s) || [])[1] || 'EUR'; const pocket = /^Savings/.test(s);
      l.forEach((x) => lines.push({ ...x, cur, pocket }));
      // a foreign-currency account's euro value also moves with the exchange rate: one line per account makes the euros add up
      // booked month by month, so each month-end balance matches Revolut's own euro figure
      if (cur !== 'EUR') { const by = {}; let prevBal = l[0].bal - l[0].amt;
        l.forEach((x) => { if (x.bal == null) return; const d = x.bal - (prevBal + x.amt); prevBal = x.bal; const m = C.budgetMonth(x.date, S.cfg.cutoff); (by[m] = by[m] || { v: 0, date: x.date }).v += d; by[m].date = x.date; });
        Object.values(by).forEach((g) => { const v = C.r2(g.v); if (Math.abs(v) >= 0.01) lines.push({ date: g.date, desc: `Exchange rate effect on the ${cur} account`, kind: 'FX', amt: v, bal: null, orig: '', cur: 'EUR', pocket: false, fx: true }); }); } });
    if (!lines.length) return null;
    lines.sort((a, b) => a.date.localeCompare(b.date));
    // keep the ids and categories of lines already imported, so your corrections stay with them
    const old = Object.values(S.stmts).filter((o) => o.account === 'REV').flatMap((o) => o.tx || []); const used = new Set();
    const word = { USD: 'dollars', GBP: 'pounds', AED: 'dirhams', PLN: 'zlotys' };
    const tx = lines.map((x, i) => {
      const prev = x.pocket ? null : old.find((o) => !used.has(o.id) && o.date === x.date && Math.abs(o.amt - x.amt) < 0.011);
      if (prev) used.add(prev.id);
      const det = prev ? prev.det || [] : x.cur !== 'EUR' && x.orig ? [`Paid in ${word[x.cur] || x.cur}: ${x.orig.replace(/^-/, '')}`] : [];
      const desc = x.pocket ? `Pocket: ${x.desc}` : x.desc;
      const cat0 = prev ? prev.cat0 : x.fx ? (x.amt < 0 ? 'Bank fees' : 'Other income & refunds') : x.pocket || /^(Top up|Exchange)$/i.test(x.kind) || /^(To pocket|Pocket Withdrawal|Exchanged to|Apple Pay top-up|Top-up)/i.test(x.desc) || /^To Charbel/i.test(x.desc) ? 'Between my accounts'
        : /PAUL AL ?HELOU/i.test(x.desc) ? 'Paid for Paul' : x.cur === 'USD' && x.amt < 0 ? 'Spending in Lebanon' : x.cur === 'GBP' && x.amt < 0 ? 'Trips & holidays' : /^Transfer to /i.test(x.desc) ? 'Other spending' : undefined;
      const t = { acct: 'REV', amt: x.amt, date: x.date, vdate: x.date, desc, det, id: prev ? prev.id : 'rv' + C.r2(Math.abs(x.amt)).toString(36).replace('.', '') + x.date.replace(/-/g, '').slice(2) + i.toString(36) };
      if (cat0) t.cat0 = cat0; return t;
    });
    const from = tx[0].date, to = tx[tx.length - 1].date;
    return { kind: 'statement', bank: 'REVCSV', fileName: name, account: 'REV', acctKey: 'rev', role: 'current', accountType: 'Revolut, all currency accounts and pockets', from, to, opening: C.r2(opening), closing: C.r2(closing), checkpoints: [], tx, reconciled: true, id: `REV_${from}_${to}`, newLines: tx.filter((t) => !t.id || !old.some((o) => o.id === t.id)).length };
  }
  // Trade Republic "Transaction export" CSV: one file for the cash account (DEFAULT) and the PEA. Cash lines become the TR statement,
  // in exact time order (the export runs from the account's first line, so it opens at 0 and its closing is the cash balance); PEA lines never touch cash and instead update the PEA value (units x latest price + PEA cash) and its trade history.
  function trExportCsv(text, name) {
    const L = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map(csvSplit); const h = L[0].map((x) => x.trim().toLowerCase());
    const ix = (k) => h.indexOf(k); const I = { dt: ix('datetime'), d: ix('date'), acc: ix('account_type'), cat: ix('category'), type: ix('type'), name: ix('name'), sym: ix('symbol'), sh: ix('shares'), px: ix('price'), amt: ix('amount'), fee: ix('fee'), tax: ix('tax'), desc: ix('description'), id: ix('transaction_id') };
    if (I.acc < 0 || I.id < 0 || I.amt < 0 || I.d < 0) return null;
    const n = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(x) ? 0 : x; };
    const hh = (str) => { let k = 2166136261; for (let i = 0; i < str.length; i++) { k ^= str.charCodeAt(i); k = Math.imul(k, 16777619); } return (k >>> 0).toString(36); };
    const rows = L.slice(1).map((r) => ({ r, t: r[I.dt] || r[I.d] })).sort((a, b) => a.t.localeCompare(b.t)).map((x) => x.r);
    const tx = []; const pea = { cash: 0, units: 0, trades: [], last: null, lastPx: null, sym: null };
    for (const r of rows) {
      const date = (r[I.d] || '').slice(0, 10); if (!/^\d{4}-\d\d-\d\d$/.test(date)) continue;
      const amt = C.r2(n(r[I.amt])), fee = C.r2(n(r[I.fee])), tax = C.r2(n(r[I.tax]));
      const desc = ((r[I.desc] || '').trim() || (r[I.name] || '').trim() || (r[I.type] || '').trim() || '(no description)').replace(/\s+/g, ' ');
      if ((r[I.acc] || '').trim().toUpperCase() === 'PEA') {
        pea.cash = C.r2(pea.cash + amt + fee + tax);
        if (r[I.cat] === 'TRADING') { const q = n(r[I.sh]), px = n(r[I.px]); pea.units += q; if (px) { pea.lastPx = px; pea.sym = r[I.sym] || pea.sym; } pea.trades.push({ d: date, id: 'tr' + hh(r[I.id]), qty: Math.abs(q), price: px, fees: Math.abs(fee), side: q < 0 ? 'sell' : 'buy', code: r[I.sym] }); }
        pea.last = date; continue;
      }
      const v = C.r2(amt + fee + tax); if (!v) continue;
      tx.push({ id: 'tr' + hh(r[I.id]), date, vdate: date, desc, det: fee ? ['Fee ' + fee] : [], amt: v, acct: 'TR' });
    }
    if (!tx.length && !pea.last) return null;
    const st = tx.length ? { kind: 'statement', bank: 'CSV', fileName: name, account: 'TR', acctKey: 'tr', role: 'current', from: tx[0].date, to: tx[tx.length - 1].date, opening: 0, closing: C.r2(tx.reduce((x, t) => x + t.amt, 0)), tx, reconciled: null, id: `TR_${tx[0].date}_${tx[tx.length - 1].date}` } : { kind: 'trpea', fileName: name, tx: [] };
    if (pea.last) st.pea = { units: C.r2(pea.units * 1e4) / 1e4, cash: pea.cash, lastPx: pea.lastPx, sym: pea.sym, last: pea.last, trades: pea.trades };
    return st;
  }
  // PEA value from a Trade Republic export: units x price (the live price if newer than the last trade) + cash left in the PEA
  function applyTrPea(pe) {
    const a = acct('pea'); if (!a || !pe) return;
    const h = (S.cfg.holdings || []).find((x) => x.acct === 'pea' && (!pe.sym || x.code === pe.sym));
    if (h) { h.tx = h.tx || []; const have = new Set(h.tx.map((t) => t.d + '|' + t.qty + '|' + t.price)); pe.trades.forEach((t) => { if (!have.has(t.d + '|' + t.qty + '|' + t.price)) h.tx.push({ d: t.d, fees: t.fees, id: t.id, price: t.price, qty: t.qty, side: t.side }); }); h.tx.sort((x, y) => x.d.localeCompare(y.d)); }
    const live = h && h.price && h.priceAt && h.priceAt >= pe.last ? { p: +h.price, d: h.priceAt } : { p: pe.lastPx, d: pe.last };
    if (!live.p) return; if ((a.asOf || '') > live.d) return;
    a.balance = C.r2(pe.units * live.p + pe.cash); a.asOf = live.d;
  }
  // ---------- the Ledger import template (README): date,account,amount,description,currency,balance,category,id ----------
  // One file can hold every bank. Current and savings accounts become one statement each; investment and locked accounts only update their balance.
  const TPL_HEAD = /^﻿?date,account,amount,description(,|$)/i;
  const TPL_CASH = { sg: null, rev: 'REV', tr: 'TR', fo: 'FO' }, TPL_SAV = { la: ['LA', 'Livret A'], ld: ['LD', 'LDDS'] };
  function tplCsv(text, name) {
    const L = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map(csvSplit); const h = L[0].map((x) => x.trim().toLowerCase()); const ix = (k) => h.indexOf(k);
    const I = { d: ix('date'), a: ix('account'), amt: ix('amount'), desc: ix('description'), cur: ix('currency'), bal: ix('balance'), cat: ix('category'), id: ix('id') };
    const num = (v) => { const s = String(v == null ? '' : v).trim(); if (!s) return null; const x = parseFloat(s.replace(/\s/g, '')); return isNaN(x) ? NaN : x; };
    const hh = (str) => { let k = 2166136261; for (let i = 0; i < str.length; i++) { k ^= str.charCodeAt(i); k = Math.imul(k, 16777619); } return (k >>> 0).toString(36); };
    const by = {}; const bad = [];
    L.slice(1).forEach((r, n) => { const d = String(r[I.d] || '').trim(), a = String(r[I.a] || '').trim().toLowerCase(), amt = num(r[I.amt]);
      if (!/^\d{4}-\d\d-\d\d$/.test(d) || !a || amt == null || isNaN(amt)) { bad.push(n + 2); return; }
      (by[a] = by[a] || []).push({ d, amt: C.r2(amt), desc: String(r[I.desc] || '').trim().replace(/\s+/g, ' '), bal: I.bal >= 0 ? num(r[I.bal]) : null, cat: I.cat >= 0 ? String(r[I.cat] || '').trim() : '', ref: I.id >= 0 ? String(r[I.id] || '').trim() : '', n }); });
    const out = []; if (bad.length) out.push({ kind: 'unknown', fileName: name, error: `${bad.length} row${bad.length > 1 ? 's' : ''} skipped (no date, account or amount): line ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? '…' : ''}` });
    Object.entries(by).forEach(([key, rows]) => {
      rows.sort((x, y) => x.d.localeCompare(y.d) || x.n - y.n); const last = [...rows].reverse().find((x) => x.bal != null && !isNaN(x.bal));
      const a = S.cfg.accounts.find((x) => x.key === key);
      if (!(key in TPL_CASH) && !(key in TPL_SAV)) {
        if (!a) { out.push({ kind: 'unknown', fileName: name, error: `Account "${key}" is not one of yours (see Settings, accounts)` }); return; }
        if (last) out.push({ kind: 'bal', fileName: name, acctKey: key, name: a.name, balance: C.r2(last.bal), date: last.d }); return;
      }
      const sav = TPL_SAV[key]; const code = sav ? sav[0] : key === 'sg' ? sgMain() : TPL_CASH[key];
      const old = Object.values(S.stmts).filter((o) => o.account === code || (sav && o.acctKey === key)).flatMap((o) => o.tx || []);
      const ids = new Set(old.map((t) => t.id)); const pool = old.map((t) => ({ k: t.date + '|' + C.r2(t.amt) + '|' + String(t.desc || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10), used: false }));
      const seen = {}; let dupes = 0; const tx = [];
      rows.filter((x) => x.amt !== 0).forEach((x) => {
        const base = key + '|' + x.d + '|' + x.amt + '|' + x.desc; seen[base] = (seen[base] || 0) + 1;
        const id = x.ref ? 'x' + hh(key + '|' + x.ref) : 't' + hh(base + '|' + seen[base]);
        const fk = x.d + '|' + x.amt + '|' + x.desc.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); const p = pool.find((q) => !q.used && q.k === fk);
        if (ids.has(id) || p) { if (p) p.used = true; dupes++; return; }
        const t = { id, date: x.d, vdate: x.d, desc: x.desc || '(no description)', det: [], amt: x.amt, acct: code }; if (x.cat) t.cat0 = x.cat; tx.push(t);
      });
      // balance check: the file's closing less every line in it gives its opening, which must equal the closing of the statement before
      const all = rows.reduce((s, x) => s + x.amt, 0); const from = rows[0].d, to = rows[rows.length - 1].d;
      const prev = Object.values(S.stmts).filter((o) => (o.account === code || (sav && o.acctKey === key)) && o.closing != null && o.to < from).sort((p1, p2) => p2.to.localeCompare(p1.to))[0];
      const gap = last && prev ? C.r2(C.r2(last.bal - all) - prev.closing) : null;
      if (!tx.length) { if (dupes) out.push({ kind: 'unknown', fileName: name, error: `${sav ? sav[1] : code}: all ${dupes} lines were already in` }); if (last) out.push({ kind: 'bal', fileName: name, acctKey: key, name: (a || {}).name || code, balance: C.r2(last.bal), date: last.d }); return; }
      out.push({ kind: 'statement', bank: 'TPL', fileName: name, account: code, acctKey: key, role: sav ? 'savings' : 'current', accountType: sav ? sav[1] : (a || {}).name || code, from, to, opening: null, closing: last ? C.r2(last.bal) : null, tx, checkpoints: [], dupes, gap, reconciled: gap == null ? null : Math.abs(gap) < 0.01, id: `${code}_${from}_${to}_tpl` });
    });
    return out;
  }
  function csvSplit(line) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }
  async function readFiles(files) {
    for (const f of files) {
      ui.busy = f.name; render();
      try {
        if (/\.csv$/i.test(f.name) || f.type === 'text/csv') {
          const text = decodeBuf(await f.arrayBuffer());
          if (TPL_HEAD.test(text.slice(0, 200))) { ui.pending.push(...tplCsv(text, f.name)); continue; }
          if (/Current Accounts Transaction Statements/.test(text.slice(0, 20000))) { const rv = revConsolidatedCsv(text, f.name); if (rv) { ui.pending.push(rv); continue; } }
          if (/account_type/.test(text.slice(0, 400)) && /transaction_id/.test(text.slice(0, 400))) { const trx = trExportCsv(text, f.name); if (trx) { ui.pending.push(trx); continue; } }
          const sg = /d[ée]tail de l|date de l.op|libell/i.test(text.slice(0, 1500)) && !/started date|completed date/i.test(text.slice(0, 1500)) ? sgCsv(text, f.name) : null;
          if (sg) { ui.pending.push(sg); continue; }
          const parsed = C.parseCSV(text);
          const hdr = parsed.header.join('|').toLowerCase();
          const guess = /started date|completed date/.test(hdr) ? 'REV' : /fortuneo/.test(hdr) ? 'FO' : 'TR';
          const mp = parsed.map; const tx0 = guess !== 'FO' && mp.date >= 0 && mp.amount >= 0 && mp.desc >= 0 ? C.csvToTx(parsed, mp, guess) : [];
          if (tx0.length) ui.pending.push({ kind: 'statement', bank: 'CSV', fileName: f.name, account: guess, from: tx0[0].date, to: tx0[tx0.length - 1].date, opening: null, closing: null, tx: tx0, reconciled: null, id: `${guess}_${tx0[0].date}_${tx0[tx0.length - 1].date}` });
          else ui.csv = { name: f.name, parsed, map: parsed.map, acct: guess };
        } else {
          ui.pending.push({ kind: 'unknown', fileName: f.name, error: 'PDF statements are no longer read. Download the CSV from your bank and add that instead.' });
        }
      } catch (e) { console.error(e); ui.pending.push({ kind: 'unknown', fileName: f.name, error: 'Could not read this file: ' + (e && e.message ? e.message : e) }); }
    }
    ui.busy = null; render();
    setTimeout(() => { const p = document.querySelector('.pend'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
  }
  async function savePending() {
    const cfg = S.cfg; let n = 0, lastTo = null, skipped = 0;
    for (const p of ui.pending) {
      if (p.pea) applyTrPea(p.pea);
      if (p.kind === 'trpea') { n++; continue; }
      if (p.kind === 'bal') { const a = acct(p.acctKey); if (a && p.date >= (a.asOf || '')) { a.balance = p.balance; a.asOf = p.date; } n++; continue; }
      if (p.kind === 'statement') {
        const st = { ...p }; delete st.partial; delete st.pea;
        for (const old of Object.values(S.stmts)) {
          if ((old.partial || old.mid || old.bank === 'CSV') && old.id !== st.id && old.account === st.account && old.from >= st.from && old.to <= st.to) {
            // classifications made on the earlier lines follow the same payment in the new statement
            S.overrides.oneoff = S.overrides.oneoff || {}; (old.tx || []).forEach((o) => { const m = S.overrides.map[o.id]; const oo = (S.overrides.oneoff || {})[o.id]; if (!m && !oo) return; const nt = st.tx.find((t) => Math.abs(t.amt - o.amt) < 0.011 && Math.abs(daysBetween(t.date, o.date)) <= 4 && !S.overrides.map[t.id]); if (nt) { if (m) S.overrides.map[nt.id] = m; if (oo) S.overrides.oneoff[nt.id] = oo; } });
            delete S.stmts[old.id]; await deleteStmt(old.id);
          }
        }
        if (st.bank === 'REVCSV') {
          // the new Revolut file replaces the lines it covers; an older statement keeps only what came before it
          for (const old of Object.values(S.stmts).filter((o) => o.account === 'REV' && o.id !== st.id && o.kind === 'statement')) {
            if (old.from >= st.from) { delete S.stmts[old.id]; await deleteStmt(old.id); }
            else if (old.to >= st.from) { old.tx = (old.tx || []).filter((t) => t.date < st.from); old.to = new Date(Date.parse(st.from) - 864e5).toISOString().slice(0, 10); old.closing = st.opening; await writeStmt(old); }
          }
        }
        if (st.mid || st.bank === 'CSV') { const have = new Set(); Object.values(S.stmts).filter((o) => o.account === st.account && o.id !== st.id).forEach((o) => (o.tx || []).forEach((t) => have.add(t.id))); const before = st.tx.length; st.tx = st.tx.filter((t) => !have.has(t.id)); if (!st.tx.length) { skipped += before; continue; } st.from = st.tx[0].date; st.to = st.tx[st.tx.length - 1].date; }
        const prevF = S.stmts[st.id] && S.stmts[st.id].file; if (prevF) st.file = prevF;
        S.stmts[st.id] = st; n++; await writeStmt(st);
        const key = st.role === 'savings' ? (st.acctKey || (cfg.accounts.find((x) => x.name.includes('••' + String(st.account).slice(-4))) || {}).key) : String(st.account).startsWith('SG') ? 'sg' : st.acctKey || null;
        if (key && st.closing != null) { const a = acct(key); if (a && st.to >= (a.asOf || '')) { a.balance = st.closing; a.asOf = st.to; } }
        if (!lastTo || st.to > lastTo) lastTo = st.to;
      } else if (p.kind === 'payslip') { cfg.payslip = { month: p.month, netTaxable: p.netTaxable, pas: p.pas, rate: p.pasRate }; n++; }
    }
    ui.pending = []; persist('model'); persist('overrides'); changed(); toast(`${n} document${n > 1 ? 's' : ''} saved${skipped ? ` · ${skipped} lines were already in` : ''}`);
    if (lastTo) ui.month = C.budgetMonth(lastTo, cfg.cutoff);
  }
  // ---------- backup ----------
  async function offerFile(filename, data) {
    // iPad: the share sheet (Save to Files, iCloud Drive); elsewhere a normal download
    const type = /\.json$/.test(filename) ? 'application/json' : 'text/csv'; const file = new File([data], filename, { type });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); toast('File ready'); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('File ready');
  }
  // ---------- export all data / import ----------
  // One JSON file with everything the app stores. schemaVersion 1. Keys (each also a storage key, see README):
  //   model (settings, accounts and balances, assumptions, savings order, goals, Paul, pay), rules, overrides, snapshots (balances at each close),
  //   tax (kept for history), stmts (one record per imported bank file, with its lines), live (Apple Pay and quick entries)
  const BK_SCHEMA = 1;
  const BK_KEYS = ['model', 'rules', 'overrides', 'snapshots', 'tax', 'stmts', 'live'];
  function backupData() { return { app: 'ledger', schemaVersion: BK_SCHEMA, exportedAt: new Date().toISOString(), model: S.cfg, rules: S.rules, overrides: S.overrides, snapshots: S.snapshots, tax: S.tax || {}, stmts: S.stmts, live: S.live || {} }; }
  function backup() { S.cfg.lastExport = todayISO(); persist('model'); offerFile(`ledger-backup-${todayISO()}.json`, JSON.stringify(backupData())); }
  // a file of this app (schemaVersion 1, or the earlier "Download a backup" format) as the sections above
  function bkRead(v) {
    if (!v || v.app !== 'ledger') return null;
    if (v.schemaVersion) return { model: v.model, rules: v.rules, overrides: v.overrides, snapshots: v.snapshots, tax: v.tax, stmts: v.stmts, live: v.live };
    return { model: v.cfg, settings: v.settings, rules: v.rules, overrides: v.overrides, snapshots: v.snapshots, tax: v.tax, stmts: v.stmts, live: v.live };
  }
  function bkSummary(d) {
    const st = Object.values(d.stmts || {}); const tx = st.flatMap((x) => x.tx || []); const live = Object.values(d.live || {});
    const dates = tx.map((t) => t.date).concat(live.map((e) => e.date)).filter(Boolean).sort();
    const m = d.model || {}; const A = m.assume || {};
    return [['Bank files', st.length], ['Transactions', tx.length], ['Apple Pay and quick entries', live.length], ['Category rules', ((d.rules || {}).list || []).length], ['Category fixes', Object.keys((d.overrides || {}).map || {}).length], ['Closed cycles', Object.keys((d.overrides || {}).reviewed || {}).length], ['Balance records', Object.keys((d.snapshots || {}).points || {}).length], ['Accounts', (m.accounts || []).length], ['Goals', (m.goals || []).length], ['Assumption lines', (A.inc || []).length + (A.costL || []).length + (A.order || []).length]]
      .concat([['From', dates[0] || null], ['To', dates[dates.length - 1] || null]]);
  }
  // reading the file only shows what it holds; nothing changes until you press Replace
  async function restore(file) {
    if (!file) return;
    try { const d = bkRead(JSON.parse(await file.text())); if (!d) throw new Error('not a backup'); ui.restore = { name: file.name, d, sum: bkSummary(d) }; render(); setTimeout(() => { const el = document.getElementById('restore-card'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); }
    catch (e) { toast('That file is not a Ledger backup'); }
  }
  async function restoreGo() {
    const r = ui.restore; if (!r) return; const d = r.d; const before = JSON.stringify(S);
    S = { cfg: d.model ? M.mergeConfig(d.model) : M.fromPrevious(d.settings), rules: d.rules || { list: [] }, overrides: { map: {}, oneoff: {}, reviewed: {}, ...(d.overrides || {}) }, stmts: d.stmts || {}, snapshots: d.snapshots || { points: {} }, live: d.live || {}, tax: d.tax || {} };
    ui.restore = null; ['model', 'rules', 'overrides', 'snapshots', 'tax'].forEach(persist);
    const old = JSON.parse(before); for (const id of Object.keys(old.stmts || {})) if (!S.stmts[id]) await deleteStmt(id); for (const id of Object.keys(old.live || {})) if (!S.live[id]) await deleteLive(id);
    for (const st of Object.values(S.stmts)) await writeStmt(st); for (const e of Object.values(S.live)) await writeLive(e);
    D.fc = null; changed(); toast('Data imported');
  }
  function exportCsv() {
    const q = (x) => '"' + String(x).replace(/"/g, '""') + '"';
    const lines = ['date;budget_month;account;category;bucket;one_off;amount;description'].concat(D.txs.map((t) => [t.date, t.month, t.acct, q(t.cat), M.bucketOf(S.cfg, t.cat), (S.overrides.oneoff || {})[t.id] ? 'yes' : '', String(t.amt).replace('.', ','), q(t.desc)].join(';')));
    offerFile(`ledger-lines-${todayISO()}.csv`, lines.join('\n'));
  }
  // ---------- boot ----------
  const h = location.hash.slice(1); if (!intake(location.hash)) { const r = resolveView(h); if (r) { ui.view = r.view; ui.sect = r.sect; } }
  render(); connect().then(() => fxDaily());
  window.__ledger = { get S() { return S; }, get D() { return D; }, render, get fc() { return fcRun(); } };
