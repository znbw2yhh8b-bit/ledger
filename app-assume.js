'use strict';
  // ---------- Assumptions page: every input the 5-year forecast reads: income, costs, savings order, returns and risk, tax rate ----------
  // Annual figures only. Typed values are blue; computed ones are black. Nothing here opens a panel or a browser date field.
  const asNum = (s) => { s = String(s == null ? '' : s).trim(); if (!s) return null; const v = parseFloat(s.replace(/[\s,€%]/g, '').replace('−', '-')); return isNaN(v) ? null : v; };
  const asSet = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); const t = ks.reduce((x, k) => (x[k] == null ? (x[k] = {}) : x[k]), o); t[l] = v; };
  const asPct = (v) => (v == null ? '' : String(Math.round(v * 10000) / 100));
  // an input: path into cfg.assume (or cfg), unit '' | 'pct' (stored as a fraction) | 'eur'
  const asIn = (path, val, o) => { o = o || {}; const typed = val != null && val !== ''; return `<input class="inp num as-in${typed ? ' typed' : ''}" inputmode="decimal" data-as="${path}"${o.u ? ` data-u="${o.u}"` : ''}${o.root ? ` data-root="${o.root}"` : ''} value="${val == null ? '' : esc(String(val))}" placeholder="${esc(o.ph || '')}" aria-label="${esc(o.label || path)}">`; };
  function asHead(title, note) { return `<div class="card-h"><h2>${esc(title)}</h2>${note ? `<span class="muted sm">${esc(note)}</span>` : ''}</div>`; }

  // a year picker: this year to the end of the forecast
  const asYearSel = (attr, val) => { const y1 = fcYStart(); const ys = []; for (let y = y1 - 1; y <= y1 + M.FC_YEARS - 1; y++) ys.push(y); if (val && !ys.includes(+val)) ys.unshift(+val);
    return `<select class="sel as-sel" ${attr} aria-label="Starting year">${ys.map((y) => `<option value="${y}"${+val === y ? ' selected' : ''}>FY${String(y).slice(2)}</option>`).join('')}</select>`; };
  // income: lines of a yearly amount, a starting year and a growth rate after it; optional straight into an account
  function asIncome(A) {
    const ACC = S.cfg.accounts.filter((a) => M.ACCT_ROWS.includes(a.key) && a.key !== 'cash');
    const to = (l) => `<select class="sel as-sel" data-asi="${esc(l.id)}" data-f="acct" aria-label="Goes to"><option value="">Savings order</option>${ACC.map((a) => `<option value="${a.key}"${l.acct === a.key ? ' selected' : ''}>${esc(a.name.replace(/\s*••\d+/, ''))}</option>`).join('')}</select>`;
    const rows = A.inc.map((l) => `<tr><td><input class="inp as-name" data-asi="${esc(l.id)}" data-f="name" value="${esc(l.name || '')}" aria-label="Line name"></td>
      <td class="num"><input class="inp num as-in typed" inputmode="decimal" data-asi="${esc(l.id)}" data-f="amount" value="${l.amount == null ? '' : frNum(Math.round(+l.amount || 0))}" aria-label="${esc(l.name || 'Line')} a year"></td>
      <td>${asYearSel(`data-asi="${esc(l.id)}" data-f="from"`, l.from)}</td>
      <td class="num"><input class="inp num as-in typed" inputmode="decimal" data-asi="${esc(l.id)}" data-f="growth" value="${asPct(l.growth)}" aria-label="${esc(l.name || 'Line')} growth a year"></td>
      <td>${to(l)}</td><td class="num"><button type="button" class="btn-x" data-as-del="${esc(l.id)}" aria-label="Remove ${esc(l.name || 'line')}">${icon('x', 'sm')}</button></td></tr>`).join('');
    return `<section class="card" id="as-income">${asHead('Income a year', 'Net, EUR; growth after the start year')}
      <div class="as-x"><table class="tbl as-t"><colgroup><col><col class="as-c-amt"><col class="as-c-yr"><col class="as-c-g"><col class="as-c-to"><col class="as-c-x"></colgroup><thead><tr><th>Line</th><th class="num">A year</th><th>From</th><th class="num">Growth %</th><th>Goes to</th><th></th></tr></thead><tbody>${rows || '<tr><td class="muted" colspan="6">No income lines.</td></tr>'}</tbody></table></div>
      <div class="row wrap as-add"><button type="button" class="btn-sm" data-as-add>${icon('plus', 'sm')}Add line</button></div></section>`;
  }
  // costs: lines like income, each in one of the six buckets: a yearly amount, a starting year and a growth rate after it
  function asCosts(A) {
    const cat = (l) => `<select class="sel as-sel as-cat" data-asc="${esc(l.id)}" data-f="bucket" aria-label="Cost group">${C.BUCKET6.map(([k, n]) => `<option value="${k}"${l.bucket === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    const rows = A.costL.map((l) => `<tr><td>${cat(l)}</td>
      <td class="num"><input class="inp num as-in typed" inputmode="decimal" data-asc="${esc(l.id)}" data-f="amount" value="${l.amount == null ? '' : frNum(Math.round(+l.amount || 0))}" aria-label="Cost a year"></td>
      <td>${asYearSel(`data-asc="${esc(l.id)}" data-f="from"`, l.from)}</td>
      <td class="num"><input class="inp num as-in typed" inputmode="decimal" data-asc="${esc(l.id)}" data-f="growth" value="${asPct(l.growth)}" aria-label="Cost growth a year"></td>
      <td></td><td class="num"><button type="button" class="btn-x" data-as-delc="${esc(l.id)}" aria-label="Remove line">${icon('x', 'sm')}</button></td></tr>`).join('');
    return `<section class="card" id="as-costs">${asHead('Costs a year', 'EUR; growth after the start year')}
      <div class="as-x"><table class="tbl as-t"><colgroup><col><col class="as-c-amt"><col class="as-c-yr"><col class="as-c-g"><col class="as-c-to"><col class="as-c-x"></colgroup><thead><tr><th>Group</th><th class="num">A year</th><th>From</th><th class="num">Growth %</th><th></th><th></th></tr></thead><tbody>${rows || '<tr><td class="muted" colspan="6">No cost lines.</td></tr>'}</tbody></table></div>
      <div class="row wrap as-add"><button type="button" class="btn-sm" data-as-addc>${icon('plus', 'sm')}Add line</button></div></section>`;
  }

  // savings order: rules applied to what is left each year, top first. Each rule: type, account, amount, from and until years.
  const AS_RULES = [['keep', 'Keep in current accounts up to', 'eur'], ['fixed', 'Fixed a month', 'eur'], ['year', 'Fixed a year', 'eur'], ['cap', 'Fill to its ceiling', ''], ['target', 'Fill up to a balance', 'eur'], ['share', 'Share of what is left', 'pct'], ['rest', 'The rest', ''], ['out', 'Take out', 'eur']];
  const asRuleOf = (k) => AS_RULES.find((x) => x[0] === k) || AS_RULES[6];
  const asUntilSel = (attr, val) => { const y1 = fcYStart(); const ys = []; for (let y = y1; y <= y1 + M.FC_YEARS - 1; y++) ys.push(y);
    return `<select class="sel as-sel" ${attr} aria-label="Until year"><option value="">No end</option>${ys.map((y) => `<option value="${y}"${val && +String(val).slice(0, 4) === y ? ' selected' : ''}>FY${String(y).slice(2)}</option>`).join('')}</select>`; };
  function asOrder(A) {
    const ACC = S.cfg.accounts.filter((a) => M.ACCT_ROWS.includes(a.key) && a.key !== 'cash'); const n = A.order.length; const id = (r) => esc(r.id);
    const rows = A.order.map((r, i) => { const [k, , u] = asRuleOf(r.rule); const val = r.amount == null ? '' : u === 'pct' ? asPct(r.amount) : frNum(Math.round(+r.amount || 0));
      const fy = r.from ? +String(r.from).slice(0, 4) : '';
      return `<li class="as-o${r.on === false ? ' off' : ''}"><span class="as-n num">${i + 1}</span><label class="chk"><input type="checkbox" data-aso="${id(r)}" data-f="on" ${r.on === false ? '' : 'checked'} aria-label="On"></label>
      <select class="sel as-sel" data-aso="${id(r)}" data-f="rule" aria-label="Rule">${AS_RULES.map(([v, l]) => `<option value="${v}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      ${k === 'keep' ? '<span class="as-acc muted sm">Current accounts</span>' : `<select class="sel as-sel as-acc" data-aso="${id(r)}" data-f="acct" aria-label="Account">${ACC.map((a) => `<option value="${a.key}"${r.acct === a.key ? ' selected' : ''}>${esc(a.name.replace(/\s*••\d+/, ''))}</option>`).join('')}</select>`}
      ${u ? `<input class="inp num as-in typed" inputmode="decimal" data-aso="${id(r)}" data-f="amount" value="${val}" aria-label="${u === 'pct' ? 'Share %' : 'Amount'}"><span class="muted sm as-u">${u === 'pct' ? '%' : k === 'fixed' ? 'a month' : k === 'keep' || k === 'target' ? 'balance' : 'a year'}</span>` : '<span class="as-in"></span><span class="as-u"></span>'}
      <div class="as-o2"><span class="muted sm">From</span>${asYearSel(`data-aso="${id(r)}" data-f="from"`, fy || fcYStart())}<span class="muted sm">until</span>${asUntilSel(`data-aso="${id(r)}" data-f="to"`, r.to)}<span class="grow"></span>
      <button type="button" class="btn-x" data-as-up="${i}" aria-label="Move up"${i === 0 ? ' disabled' : ''}><span class="flip">${icon('chevD', 'sm')}</span></button><button type="button" class="btn-x" data-as-dn="${i}" aria-label="Move down"${i === n - 1 ? ' disabled' : ''}>${icon('chevD', 'sm')}</button><button type="button" class="btn-x" data-as-delo="${id(r)}" aria-label="Remove rule">${icon('x', 'sm')}</button></div></li>`; }).join('');
    // first forecast year: what each rule placed, and any fixed amount that did not fit
    const f = fcRun(); const y = f.years[0]; const nm = (r) => { const [k, l] = asRuleOf(r.rule); return k === 'keep' ? l : l + ', ' + (S.cfg.accounts.find((a) => a.key === r.acct) || { name: r.acct || '' }).name.replace(/\s*••\d+/, ''); };
    const chk = y ? A.order.filter((r) => Math.abs(y.byRule[r.id] || 0) >= 0.5).map((r) => `<tr><th scope="row">${esc(nm(r))}</th><td class="num">${tmNum(y.byRule[r.id])}</td></tr>`).join('') : '';
    const left = y ? y.assets.total - C.sum(A.order, (r) => y.byRule[r.id] || 0) : 0;
    return `<section class="card" id="as-order">${asHead('Savings order', 'Left over fills these, top first')}<ol class="as-ol">${rows || '<li class="muted">No rules: everything stays in current accounts.</li>'}</ol>
      <div class="row wrap as-add"><button type="button" class="btn-sm" data-as-addo>${icon('plus', 'sm')}Add rule</button></div>
      ${y ? `<table class="tbl as-t as-chk"><thead><tr><th>${esc(y.code)}${f.frac < 1 && f.frac > 0.005 ? ', rest of the year' : ''}, EUR</th><th class="num">Placed</th></tr></thead><tbody>${chk}${Math.abs(left) >= 0.5 ? `<tr><th scope="row">Income paid straight in, and the remainder in current accounts</th><td class="num">${tmNum(left)}</td></tr>` : ''}<tr class="tot"><th scope="row">Left over</th><td class="num">${tmNum(y.left, true)}</td></tr></tbody></table>${y.short >= 0.5 ? `<p class="sm as-warn">Fixed amounts ${esc(eurT(y.short))} more than what is left in ${esc(y.code)}.</p>` : ''}` : ''}</section>`;
  }

  function asReturns() {
    const rows = S.cfg.accounts.filter((a) => a.tier !== 'cash' && (a.ret != null || a.tier === 'invest')).map((a, i) => `<tr><th scope="row">${esc(a.name)}</th><td class="num">${asIn('accounts.' + S.cfg.accounts.indexOf(a) + '.ret', asPct(a.ret), { u: 'pct', root: 'cfg', label: a.name + ' return' })}</td><td class="num">${a.tier === 'invest' ? asIn('accounts.' + S.cfg.accounts.indexOf(a) + '.vol', asPct(a.vol), { u: 'pct', root: 'cfg', label: a.name + ' risk' }) : '<span class="muted">–</span>'}</td><td class="num">${asIn('accounts.' + S.cfg.accounts.indexOf(a) + '.cap', a.cap, { root: 'cfg', label: a.name + ' ceiling' })}</td></tr>`).join('');
    return `<section class="card" id="as-returns">${asHead('Returns and risk', 'Yearly, before inflation, in %')}
      <table class="tbl as-t"><thead><tr><th>Account</th><th class="num">Return</th><th class="num">Risk</th><th class="num">Ceiling</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }

  function asGeneral(A) {
    return `<section class="card" id="as-general">${asHead('General')}
      <table class="tbl as-t"><tbody><tr><th scope="row">Marginal tax rate</th><td class="num">${asIn('general.mr', asPct(A.general.mr), { u: 'pct', label: 'Marginal tax rate' })}</td><td class="muted sm">Tax saved on support to parents</td></tr><tr><th scope="row">Inflation</th><td class="num">${asIn('general.infl', asPct(A.general.infl != null ? A.general.infl : 0.02), { u: 'pct', label: 'Inflation a year' })}</td><td class="muted sm">Wealth in today's euros</td></tr></tbody></table></section>`;
  }

  function vAssume() {
    const A = fcAssume();
    return `<div class="as-grid"><div class="as-col">${asIncome(A)}${asCosts(A)}</div><div class="as-col">${asOrder(A)}${asReturns()}${asGeneral(A)}</div></div>`;
  }

  // ---- events ----
  const asSave = () => { persist('model'); D.fc = null; changed(); };
  document.addEventListener('change', (ev) => {
    const x = ev.target; if (!x || !x.closest || !x.closest('#main') || ui.view !== 'assume') return; const A = fcAssume();
    if (x.dataset.as) { let v = asNum(x.value); if (v != null && x.dataset.u === 'pct') v = v / 100; const p = x.dataset.as;
      if (p === 'general.mr') asSet(A, p, v == null ? 0.3 : v);
      else if (p === 'general.infl') asSet(A, p, v == null ? 0.02 : v);
      else if (p.startsWith('accounts.')) { const [, i, f] = p.split('.'); const a = S.cfg.accounts[+i]; if (a) { if (v == null) delete a[f]; else a[f] = v; } }
      else return;
      asSave(); return; }
    if (x.dataset.asc) { const l = A.costL.find((o) => o.id === x.dataset.asc); if (!l) return; const f = x.dataset.f;
      if (f === 'bucket') l.bucket = x.value; else if (f === 'amount') l.amount = asNum(x.value) || 0; else if (f === 'growth') l.growth = (asNum(x.value) || 0) / 100; else if (f === 'from') l.from = +x.value || null; asSave(); return; }
    if (x.dataset.asi) { const l = A.inc.find((o) => o.id === x.dataset.asi); if (!l) return; const f = x.dataset.f;
      if (f === 'name') l.name = x.value.trim() || l.name; else if (f === 'amount') l.amount = asNum(x.value) || 0; else if (f === 'growth') l.growth = (asNum(x.value) || 0) / 100;
      else if (f === 'from') l.from = +x.value || null; else if (f === 'acct') l.acct = x.value || null; asSave(); return; }
    if (x.dataset.aso) { const r = A.order.find((o) => o.id === x.dataset.aso); if (!r) return; const f = x.dataset.f;
      if (f === 'on') r.on = x.checked;
      else if (f === 'rule') { r.rule = x.value; if (r.rule !== 'keep' && !r.acct) r.acct = 'pea'; if (r.rule === 'share' && !(r.amount > 0 && r.amount <= 1)) r.amount = 0.5; else if (r.rule !== 'share' && r.amount != null && r.amount <= 1) r.amount = 0; delete r.name; }
      else if (f === 'acct') { r.acct = x.value; delete r.name; }
      else if (f === 'from') { if (+x.value <= fcYStart()) delete r.from; else r.from = String(+x.value); }
      else if (f === 'to') { if (x.value) r.to = String(+x.value); else delete r.to; }
      else { let v = asNum(x.value); if (v != null && r.rule === 'share') v = Math.min(100, Math.max(0, v)) / 100; r.amount = v || 0; }
      asSave(); }
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-as-del],[data-as-add],[data-as-delc],[data-as-addc],[data-as-up],[data-as-dn],[data-as-delo],[data-as-addo]'); if (!b || b.disabled || ui.view !== 'assume') return; const A = fcAssume(); const d = b.dataset;
    if (d.asDel) { const undo = snap('model'); A.inc = A.inc.filter((o) => o.id !== d.asDel); persist('model'); D.fc = null; changed(); toast('Line removed', undo); return; }
    if (d.asDelc) { const undo = snap('model'); A.costL = A.costL.filter((o) => o.id !== d.asDelc); persist('model'); D.fc = null; changed(); toast('Line removed', undo); return; }
    if (d.asDelo) { const undo = snap('model'); A.order = A.order.filter((o) => o.id !== d.asDelo); persist('model'); D.fc = null; changed(); toast('Rule removed', undo); return; }
    if ('asAddo' in d) A.order.push({ id: 'o' + Date.now().toString(36), rule: 'fixed', acct: 'pea', amount: 0, on: true });
    else if ('asAddc' in d) A.costL.push({ id: 'c' + Date.now().toString(36), bucket: 'lifestyle', amount: 0, from: fcYStart(), growth: 0.02 });
    else if ('asAdd' in d) A.inc.push({ id: 'i' + Date.now().toString(36), name: 'New income', amount: 0, from: fcYStart(), growth: 0, acct: null });
    else if (d.asUp != null || d.asDn != null) { const i = +(d.asUp != null ? d.asUp : d.asDn); const j = d.asUp != null ? i - 1 : i + 1; if (j < 0 || j >= A.order.length) return; const t = A.order[i]; A.order[i] = A.order[j]; A.order[j] = t; }
    else return; asSave();
  });
