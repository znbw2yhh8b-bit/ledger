'use strict';
  // ---------- events ----------
  function num(v) { if (v == null) return NaN; let t = String(v).trim().replace(/\s|€|%/g, '').replace('−', '-'); if (/^\(.*\)$/.test(t)) t = '-' + t.slice(1, -1); return parseFloat(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')); }
  // a figure opens Transactions filtered; the filters show as removable chips with a way back to the page it came from
  function drill() { ui.cfLimit = 40; goFrom('lines'); }
  // open another page with a way back to this one
  function goFrom(view) { const r = resolveView(view); const to = r ? r.view : view; if (ui.view !== to) { ui.from = ui.view; ui.fromTo = to; } go(view); }
  // one month for Month report, Trends and Transactions; Trends pages its table to show it
  function setMonth(k) {
    ui.month = k; ui.allMonths = false; ui.cfLimit = 40; ui.ruleOffer = null;
    render();
  }
  function go(view) { const r = resolveView(view); if (r) ui.sect = r.sect; const to = r ? r.view : view; if (location.hash !== '#' + to) location.hash = to; else { ui.view = to; render(); } }
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, v = b.dataset.v; const cfg = S.cfg;
    if (act === 'q-mode') { ui.qmode = v; render(); return; }
    if (act === 'pi-del') { if (ui.armed !== v) { ui.armed = v; render(); return; } ui.armed = null; const pi = (S.overrides.paidIn || {}); const old = pi[v]; if (!old) return; delete pi[v]; persist('overrides'); changed(); toast('Income deleted', () => { S.overrides.paidIn = S.overrides.paidIn || {}; S.overrides.paidIn[old.id] = old; persist('overrides'); changed(); }); return; }
    if (act === 'q-cat') { ui.qcat = v; document.querySelectorAll('.q-cat').forEach((x) => { const on = x.dataset.v === v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); return; }
    if (act === 'live-del') { if (ui.armed !== v) { ui.armed = v; render(); return; } ui.armed = null; delete S.live[v]; await deleteLive(v); changed(); toast('Entry deleted'); return; }
    if (act === 'copy-url') { const t = document.getElementById('url-t'); try { await navigator.clipboard.writeText(t.textContent); toast('Copied'); } catch (e) { const r = document.createRange(); r.selectNodeContents(t); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Selected: copy it from the menu'); } return; }
    if (act === 'open-away') { ui.dOpen['set-away'] = true; return; }
    if (act === 'away-add') { const g = (id) => document.getElementById(id).value; const iso = (id) => { const m = g(id + '-m'); const last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); return `${m}-${String(Math.min(+g(id + '-d'), last)).padStart(2, '0')}`; }; const f = iso('aw-from'), t = iso('aw-to'); if (t < f) return toast('The end is before the start'); const w = cfg.away = cfg.away || { away: [], home: [] }; const k = g('aw-kind'); (w[k] = w[k] || []).push([f, t]); persist('model'); changed(); return; }
    if (act === 'away-del') { const w = cfg.away; if (w && w[b.dataset.kind]) { const k = b.dataset.kind, i = +b.dataset.i; const gone = w[k].splice(i, 1)[0]; persist('model'); changed(); toast('Removed', () => { w[k].splice(i, 0, gone); persist('model'); changed(); }); } return; }
    if (act === 'info') { ui.info = ui.info === v ? null : v; render(); return; }
    if (act === 'flag-q') { ui.kind = null; ui.allMonths = false; ui.cfLimit = 40; ui.month = b.dataset.m; ui.q = b.dataset.q || ''; ui.src = null; ui.dir = null; ui.cat = null; ui.bucket = null; ui.onlyTodo = false; ui.ruleOffer = null; drill(); return; }
    if (act === 'now-todo') { ui.kind = null; ui.allMonths = false; ui.cfLimit = 40; ui.month = b.dataset.m || sharedMonth(); ui.onlyTodo = true; ui.cat = null; ui.bucket = null; ui.q = ''; ui.src = null; ui.dir = null; drill(); return; }
    if (act === 'tm-month') { ui.month = b.dataset.m; ui.allMonths = false; ui.cfLimit = 40; goFrom('report'); return; }
    if (act === 'go-due') { ui.dueOpen = !ui.dueOpen; render(); return; }
    if (act === 'per') { const ks = cycleKeys(); const k = ks[ks.indexOf(sharedMonth()) + +v]; if (k) setMonth(k); return; }
    if (act === 'focus-add') { ui.sheetOpen = true; ui.sheetFocus = true; render(); return; }
    if (act === 'sheet-close') { ui.sheetOpen = false; render(); return; }
    if (act === 'bk-open') { ui.bkOpen = ui.bkOpen || {}; ui.bkOpen[v] = !ui.bkOpen[v]; render(); return; }
    if (act === 'upd-m') { ui.updM = ui.updM === v ? null : v; render(); return; }
    if (act === 'lf-src') { ui.src = v || null; ui.cfLimit = 40; render(); return; }
    if (act === 'lf-dir') { ui.dir = v || null; ui.cfLimit = 40; render(); return; }
    if (act === 'f-clear') { if (v === 'src') ui.src = null; else if (v === 'dir') ui.dir = null; else if (v === 'cat') { ui.cat = null; ui.bucket = null; ui.kind = null; } else if (v === 'todo') ui.onlyTodo = false; else if (v === 'q') ui.q = ''; ui.cfLimit = 40; ui.ruleOffer = null; render(); return; }
    if (act === 'back') { const to = ui.from; ui.from = null; ui.fromTo = null; if (to) go(to); return; }
    if (act === 'oneoff') { S.overrides.oneoff = S.overrides.oneoff || {}; if (S.overrides.oneoff[v]) delete S.overrides.oneoff[v]; else S.overrides.oneoff[v] = true; persist('overrides'); changed(); return; }
    if (act === 'norm') { ui.norm = v === '1'; render(); return; }
    if (act === 'expand') { ui.expand[v] = !ui.expand[v]; render(); return; }
    if (act === 'cf-cat') { ui.kind = null; ui.cat = v || null; ui.bucket = null; ui.onlyTodo = false; ui.ruleOffer = null; if (v) drill(); else render(); return; }
    if (act === 'cf-more') { ui.cfLimit = (ui.cfLimit || 40) + 40; render(); return; }
    if (act === 'cf-cell') { ui.kind = null; ui.allMonths = false; ui.cfLimit = 40; ui.month = b.dataset.m; ui.cat = b.dataset.c || null; ui.bucket = b.dataset.b || null; ui.onlyTodo = false; ui.ruleOffer = null; drill(); return; }
    if (act === 'rule-yes') { const o = ui.ruleOffer; S.rules.list.unshift([o.kw, o.cat, 'Any']); for (const id of o.ids) delete S.overrides.map[id]; ui.ruleOffer = null; persist('rules'); persist('overrides'); changed(); toast(`Rule added: “${o.kw}” → ${o.cat}`); return; }
    if (act === 'rule-no') { ui.ruleOffer = null; render(); return; }
    if (act === 'rc-add') {
      const t = D.txs.find((x) => x.id === v); if (!t || !t.unmatched) return;
      const m = /TRANSF (\d\d)\/(\d\d)/.exec(t.desc); let d = t.date; if (m) { let y = +t.date.slice(0, 4); if (m[2] === '12' && t.date.slice(5, 7) === '01') y--; d = `${y}-${m[2]}-${m[1]}`; }
      const st = Object.values(S.stmts).filter((x) => x.account === t.unmatched && x.kind === 'statement' && x.from <= d && x.to >= d)[0];
      if (!st) { toast(`No ${t.unmatched === 'REV' ? 'Revolut' : 'Trade Republic'} statement covers ${fmtDate(d)}`); return; }
      st.tx.push({ acct: st.account, amt: -t.amt, date: d, vdate: d, desc: 'Top-up from SG (added by hand)', det: ['Missing from the imported statement; added in Update'], id: 'man' + uid8(), cat0: 'Between my accounts', manual: true });
      st.tx.sort((a, b) => a.date.localeCompare(b.date)); await writeStmt(st); changed(); toast(`Added ${eur(-t.amt, 2)} to the ${t.unmatched === 'REV' ? 'Revolut' : 'Trade Republic'} lines on ${fmtDate(d)}`); return;
    }
    if (act === 'acc-del') { if (ui.armed !== 'acc-' + v) { ui.armed = 'acc-' + v; render(); return; } ui.armed = null; const U = snap('model'); cfg.accounts = cfg.accounts.filter((a) => a.key !== v); cfg.alloc = cfg.alloc.filter((k) => k !== v); persist('model'); changed(); toast('Account deleted', U); return; }
    if (act === 'del-rule') { const U = snap('rules'); S.rules.list.splice(+v, 1); persist('rules'); changed(); toast('Rule deleted', U); return; }
    if (act === 'pick') { const f = document.getElementById('file-in'); if (f) f.click(); return; }
    if (act === 'go-todo') { ui.month = D.close.key; ui.allMonths = false; ui.onlyTodo = true; ui.cat = null; ui.bucket = null; ui.kind = null; drill(); return; }
    if (act === 'close-go') { const cl = D.close; if (cl.steps.some((x) => x.id !== 'close' && !x.optional && !x.ok)) return toast('Finish steps 1 to 4 first'); const k = cl.key; S.overrides.reviewed = S.overrides.reviewed || {}; S.overrides.reviewed[k] = true; persist('overrides'); changed(); toast(`${M.colCode(k, 'A')} closed`, () => { delete S.overrides.reviewed[k]; persist('overrides'); changed(); }); return; }
    if (act === 'bal-close') { ui.balSheet = false; render(); return; }
    if (act === 'go-bal') { ui.balSheet = true; render(); return; }
    if (act === 'go-cash') { const el = document.querySelector('.cb-card') || document.getElementById('recon'); if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' }); return; }
    if (act === 'al-ok') { cfg.alertSeen = cfg.alertSeen || {}; cfg.alertSeen[v] = D.today; persist('model'); changed(); return; }
    if (act === 'sub-mark') { cfg.subs = cfg.subs || {}; if (cfg.subs[v] === b.dataset.m) delete cfg.subs[v]; else cfg.subs[v] = b.dataset.m; persist('model'); changed(); return; }
    if (act === 'rp-all') { ui.rpAll = !ui.rpAll; render(); return; }
    if (act === 'h-open') { ui.hOpen = ui.hOpen === v ? null : v; ui.armed = null; ui.hSide = 'buy'; render(); return; }
    if (act === 'h-range') { ui.hRange = v; render(); return; }
    if (act === 'h-side') { ui.hSide = v; const p = b.closest('.h-trade'); if (p) { p.querySelectorAll('[data-act="h-side"]').forEach((x) => x.classList.toggle('on', x.dataset.v === v)); const go = p.querySelector('[data-act="h-trade"]'); if (go) go.textContent = v === 'sell' ? 'Add the sale' : 'Add the purchase'; } return; }
    if (act === 'open-bal') { ev.preventDefault(); ui.balOpen = true; if (ui.view !== 'worth') location.hash = 'worth'; else render(); setTimeout(() => { const el = document.getElementById('bal'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); return; }
    if (act === 'del-st') { if (ui.armed !== v) { ui.armed = v; render(); return; } ui.armed = null; delete S.stmts[v]; await deleteStmt(v); changed(); toast('Statement deleted'); return; }
    if (act === 'pend-clear') { ui.pending = []; render(); return; }
    if (act === 'pend-save') return savePending();
    if (act === 'csv-cancel') { ui.csv = null; render(); return; }
    if (act === 'csv-ok') {
      const c = ui.csv; const map = { ...c.map }; document.querySelectorAll('[data-map]').forEach((el) => { map[el.dataset.map] = +el.value; });
      const account = document.getElementById('csv-acct').value; const tx = C.csvToTx(c.parsed, map, account);
      if (!tx.length) { toast('No dated lines with an amount were found. Check the columns.'); return; }
      ui.pending.push({ kind: 'statement', bank: 'CSV', fileName: c.name, account, from: tx[0].date, to: tx[tx.length - 1].date, opening: null, closing: null, tx, reconciled: null, id: `${account}_${tx[0].date}_${tx[tx.length - 1].date}` });
      ui.csv = null; render(); return;
    }
    if (act === 'backup') return backup();
    if (act === 'restore-go') return restoreGo();
    if (act === 'sign-out') { Store.signOut().then(() => location.reload()); return; }
    if (act === 'restore-no') { ui.restore = null; render(); return; }
    if (act === 'export-csv') return exportCsv();
  });
  document.addEventListener('dragover', (ev) => { const d = ev.target.closest && ev.target.closest('#drop'); if (d) { ev.preventDefault(); d.classList.add('over'); } });
  document.addEventListener('dragleave', (ev) => { const d = ev.target.closest && ev.target.closest('#drop'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', (ev) => { const d = ev.target.closest && ev.target.closest('#drop'); if (!d) return; ev.preventDefault(); d.classList.remove('over'); const fl = [...(ev.dataTransfer ? ev.dataTransfer.files : [])]; if (fl.length) readFiles(fl); });
  document.addEventListener('change', async (ev) => {
    const t = ev.target; const cfg = S.cfg; const v = num(t.value);
    if (t.id === 'ap-file') { const file = t.files && t.files[0]; t.value = ''; if (!file) return; try { apImport(await file.text()); } catch (e) { toast('Could not read that file'); } return; }
    if (t.id === 'q-catsel') { ui.qcat = t.value; return; }
    if (t.id === 'pi-to') { ui.pito = t.value; return; }
    if (t.dataset && t.dataset.watch) { const cur = (Array.isArray(cfg.watch) ? cfg.watch : C.WATCH_DEFAULT).slice(); const i = cur.indexOf(t.dataset.watch); if (t.checked && i < 0) cur.push(t.dataset.watch); if (!t.checked && i >= 0) cur.splice(i, 1); cfg.watch = Object.keys(WATCH_NAMES).filter((k) => cur.includes(k)); persist('model'); changed(); return; }
    if (t.id === 'all-months') { ui.allMonths = !!t.checked; ui.cfLimit = 40; render(); return; }
    if (t.id === 'lf-src') { ui.src = t.value || null; ui.cfLimit = 40; render(); return; }
    if (t.id === 'lf-dir') { ui.dir = t.value || null; ui.cfLimit = 40; render(); return; }
    if (t.id === 'show-transfers') { ui.showTransfers = !!t.checked; ui.cfLimit = 40; render(); return; }
    if (t.id === 'show-ratios') { cfg.ratios = !!t.checked; persist('model'); changed(); return; }
    if (t.dataset.live) { const e = S.live[t.dataset.live]; if (e) { e.cat = t.value; writeLive(e); changed(); } return; }
    if (t.id === 'fl-year') { ui.flYear = +t.value; render(); return; }
    if (t.id === 'food-share') { if (isNaN(v) || v <= 0 || v > 100) { toast('Type a share between 1 and 100%'); render(); return; } cfg.foodShare = Math.round(v) / 100; persist('model'); changed(); toast(`Food at home now counts ${Math.round(v)}% of groceries`); return; }
    if (t.id === 'n-budget') { cfg.flexBudget = isNaN(v) || v <= 0 ? null : Math.round(v); persist('model'); changed(); return; }
    if (t.id === 'cf-catsel') { ui.cfLimit = 40; ui.kind = null; const x = t.value; ui.cat = x.startsWith('c:') ? x.slice(2) : null; ui.bucket = x.startsWith('b:') ? x.slice(2) : null; ui.ruleOffer = null; render(); return; }
    if (t.id === 'per-sel') { setMonth(t.value); return; }
    if (t.id === 'only-todo') { ui.onlyTodo = t.checked; render(); return; }
    if (t.classList.contains('sel-cat')) {
      const id = t.dataset.tx; const tx = D.txs.find((x) => x.id === id); if (!tx) return;
      const auto = C.categorise(tx, S.rules.list, {}); if (t.value === auto) delete S.overrides.map[id]; else S.overrides.map[id] = t.value;
      const kw = M.NOFLAG.includes(auto) ? '' : C.suggestKeyword(tx); const same = kw && kw.length >= 3 ? D.txs.filter((x) => x.id !== id && (x.desc + ' | ' + (x.det || []).join(' | ')).toUpperCase().includes(kw) && x.cat !== t.value) : [];
      ui.ruleOffer = same.length ? { kw, cat: t.value, n: same.length, ids: [id] } : null; persist('overrides'); changed(); return;
    }
    if (t.id === 'file-in') { readFiles([...t.files]); t.value = ''; return; }
    if (t.id === 'restore-in') { restore(t.files[0]); t.value = ''; return; }
    if (t.dataset.acc) {
      const a = cfg.accounts.find((x) => x.key === t.dataset.acc); if (!a) return; const f = t.dataset.f;
      if (f === 'cur') { const fx = fxNow(); if (t.value === 'USD') { a.cur = 'USD'; a.balCur = fx ? C.r2((+a.balance || 0) / fx.r) : +a.balance || 0; usdSync(); fxDaily(); } else { delete a.cur; delete a.balCur; delete a.fxAt; } persist('model'); changed(); toast(t.value === 'USD' ? `${a.name} is now kept in dollars: type its balance in $` : `${a.name} is back in euros`); return; }
      if (f === 'opened') { if (t.value) a.opened = t.value; else delete a.opened; } else if (f === 'avail') { a.avail = t.value; if (t.value !== 'locked') delete a.unlock; } else if (f === 'unlock') { if (t.value) a.unlock = t.value; else delete a.unlock; } else if (f === 'name') a.name = t.value; else if (f === 'tier') a.tier = t.value; else if (f === 'cap') a.cap = isNaN(v) || v <= 0 ? undefined : v; else if (!isNaN(v)) a[f] = v / 100;
      persist('model'); changed(); return;
    }
    if (t.dataset.bk6) { const c = t.dataset.bk6, b = t.value; cfg.bucket6 = cfg.bucket6 || {}; if (b === ({ ...C.BUCKET6_OF })[c]) delete cfg.bucket6[c]; else cfg.bucket6[c] = b; const LEG = { home: 'essentials', everyday: 'essentials', lifestyle: 'lifestyle', trips: 'lifestyle', family: 'family', tax: 'tax' }; cfg.bucketMap = cfg.bucketMap || {}; if (LEG[b] === M.DEFAULT_MAP[c]) delete cfg.bucketMap[c]; else cfg.bucketMap[c] = LEG[b]; persist('model'); changed(); return; }
    if (t.dataset.bk) { cfg.bucketMap = cfg.bucketMap || {}; if (t.value === M.DEFAULT_MAP[t.dataset.bk]) delete cfg.bucketMap[t.dataset.bk]; else cfg.bucketMap[t.dataset.bk] = t.value; persist('model'); changed(); return; }
    const set = {
      't-essentials': () => { cfg.targets.essentials = v / 100; }, 't-lifestyle': () => { cfg.targets.lifestyle = v / 100; }, 't-family': () => { cfg.targets.family = v / 100; }, 't-saving': () => { cfg.targets.saving = v / 100; },
      'b-cutoff': () => { if (v >= 1 && v <= 28) cfg.cutoff = Math.round(v); }, 'b-run': () => { if (v >= 1 && v <= 24) cfg.runMonths = Math.round(v); }, 'b-pea': () => { cfg.trPea = Math.max(0, v); }, 'b-parcap': () => { if (v >= 0) cfg.parentsCap = Math.round(v); },
    };
    if (set[t.id] && !isNaN(v)) { set[t.id](); persist('model'); changed(); }
  });
  document.addEventListener('input', (ev) => {
    const x = ev.target;
    if (x.dataset && x.dataset.xacct) { const val = num(x.value); const g = document.getElementById('gap-' + x.dataset.xacct); if (g) { if (isNaN(val)) { g.textContent = ''; g.className = 'gap sm'; } else { const d = val - +x.dataset.ledger; g.textContent = Math.abs(d) < 0.005 ? 'same' : x.dataset.cur === 'USD' ? (d > 0 ? '+' : '−') + usdTxt(Math.abs(d)) : eurSigned(d); g.className = 'gap sm ' + (Math.abs(d) < 0.005 ? 'ok' : 'muted'); } } return; }
    if (x.id === 'q') { ui.q = x.value; clearTimeout(ui.qT); ui.qT = setTimeout(() => { const pos = x.selectionStart; render(); const q = document.getElementById('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* */ } } }, 250); }
  });
  document.addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.target; const cfg = S.cfg; const t = todayISO();
    if (f.id === 'q-form') {
      const a = num(document.getElementById('q-amt').value); if (isNaN(a) || a === 0) return toast('Type an amount');
      addLive({ cents: Math.round(Math.abs(a) * 100), cat: ui.qcat, merchant: document.getElementById('q-merchant').value, date: document.getElementById('q-date').value || t, src: 'app' });
      const q = document.getElementById('q-amt'); if (q) q.focus(); return;
    }
    if (f.id === 'pi-form') {
      const a = num(document.getElementById('pi-amt').value); if (isNaN(a) || a <= 0) return toast('Type an amount');
      const e = { id: 'p' + Date.now().toString(36) + uid8().slice(0, 4), date: document.getElementById('pi-date').value || t, amt: C.r2(a), to: ui.pito || 'pee', name: document.getElementById('pi-name').value.trim(), at: Date.now() };
      S.overrides.paidIn = S.overrides.paidIn || {}; S.overrides.paidIn[e.id] = e; persist('overrides'); changed();
      toast(`Added ${eur(e.amt, 2)} into ${(PAID_TO_F().find(([k]) => k === e.to) || [0, ''])[1]}`); ui.sheetOpen = false; render(); return;
    }
    if (f.id === 'xcheck') {
      let n = 0; f.querySelectorAll('[data-xacct]').forEach((el) => { const val = num(el.value); if (isNaN(val)) return; const a = acct(el.dataset.xacct); if (isUsd(a)) { a.balCur = val; a.balance = fxNow() ? C.r2(val * fxNow().r) : a.balance; } else a.balance = val; a.asOf = t; n++; });
      if (!n) return toast('Type at least one balance');
      D = null; derive(); S.snapshots.points = S.snapshots.points || {}; const pt = { nw: C.r2(D.nw) }; cfg.accounts.forEach((a) => { pt[a.key] = C.r2(+a.balance || 0); }); S.snapshots.points[t] = pt;
      ui.balSheet = false; persist('model'); persist('snapshots'); changed(); toast(`Saved. Net worth ${eur(D.nw)} recorded for ${fmtDate(t)}.`); return;
    }
    if (f.id === 'goal-form') {
      const name = document.getElementById('g-name').value.trim(), target = num(document.getElementById('g-target').value), key = document.getElementById('g-keys').value, by = document.getElementById('g-by').value;
      if (!name || isNaN(target) || target <= 0) return toast('Give the goal a name and an amount');
      cfg.goals.push({ id: uid8(), name, target, keys: [key], ...(by ? { by } : {}) }); persist('model'); changed(); toast('Goal added'); return;
    }
    if (f.id === 'acc-form') {
      const name = document.getElementById('a-name').value.trim(); const tier = document.getElementById('a-tier').value; const bal = num(document.getElementById('a-bal').value);
      if (!name) return; const key = 'a' + uid8(); const usd = document.getElementById('a-cur') && document.getElementById('a-cur').value === 'USD'; const b0 = isNaN(bal) ? 0 : bal;
      cfg.accounts.push({ key, name, tier, balance: usd ? (fxNow() ? C.r2(b0 * fxNow().r) : b0) : b0, asOf: t, ...(usd ? { cur: 'USD', balCur: b0 } : {}), ...(tier === 'invest' ? { ret: 0.06, vol: 0.15 } : tier === 'savings' ? { ret: 0.017 } : tier === 'other' ? { ret: 0, vol: 0 } : {}) });
      persist('model'); changed(); if (usd) fxDaily(); toast(usd ? `Account added in dollars${fxNow() ? ` (≈ ${eur(C.r2(b0 * fxNow().r))})` : ''}` : 'Account added'); return;
    }
  });
  // remember which cards are open: toggle does not bubble, so one captured listener; typing never fires it
  document.addEventListener('toggle', (ev) => { const d = ev.target; if (d && d.tagName === 'DETAILS' && d.dataset && d.dataset.k) ui.dOpen[d.dataset.k] = d.open; }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && (ui.sheetOpen || ui.balSheet)) { ui.sheetOpen = false; ui.balSheet = false; render(); } });
  window.addEventListener('hashchange', () => { if (intake(location.hash)) { render(); window.scrollTo(0, 0); return; } const r = resolveView(location.hash); if (r) { if (r.view !== ui.fromTo) ui.from = null; if (r.sect) ui.sect = r.sect; ui.view = r.view; try { if (location.hash.slice(1) !== r.view) history.replaceState(null, '', '#' + r.view); } catch (e) { /* keep the old hash */ } render(); if (!r.sect) window.scrollTo({ top: 0, behavior: 'instant' }); } });
  let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { setHdr(); runAfter(); }, 150); });

