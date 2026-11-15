'use strict';
  // ---------- goals (Wealth page) ----------
  function goalsCard() {
    const gs = goalStatus(); if (!gs.length) return '';
    // EUR once in the header; each row: now, the bar, the target; then the expected date alone (rules B and D)
    return '<section class="card"><div class="card-h"><h2>Goals</h2><span class="muted sm">EUR: now, then target</span></div><ul class="bars">' + gs.map((g) => barRow({ label: esc(g.name), value: g.now, fmt: (v) => frNum(Math.round(v)), max: g.target, right: '<span class="br-c num">' + frNum(Math.round(g.target)) + '</span>', detail: g.reached ? 'Reached' : g.date ? 'Expected ' + ML(g.date.slice(0, 7), true) : 'Not by ' + M.yearCode(fcY1() + M.FC_YEARS - 1, 'F') })).join('') + '</ul></section>';
  }
  // the form to type today's balances; `only` limits it to some accounts (month close shows the ones to check)
  function balances(only) {
    const cfg = S.cfg; let rows = ''; const pick = only ? cfg.accounts.filter((a) => only.includes(a.key)) : cfg.accounts;
    for (const [t, l] of TIERS) {
      const as = pick.filter((a) => a.tier === t); if (!as.length) continue;
      rows += `<tr class="grp-h"><td colspan="3">${esc(l)}</td></tr>` + as.map((a) => `<tr class="${(+a.balance || 0) === 0 ? 'zero' : ''}"><td>${esc(a.name)}</td><td class="num"><b>${isUsd(a) ? usdTxt(a.balCur) : eur(a.balance)}</b>${isUsd(a) ? `<div class="muted sm">≈ ${eur(a.balance)}</div>` : ''}<div class="muted sm">${fmtDate(a.asOf)}${a.asOf && a.asOf.slice(0, 4) !== D.today.slice(0, 4) ? ' ' + a.asOf.slice(0, 4) : ''}</div></td><td class="num">${a.fromHold ? `<a class="sm" href="#hold">Update prices in Holdings</a>` : `<input class="inp num w8" inputmode="decimal" data-xacct="${a.key}" data-ledger="${(isUsd(a) ? +a.balCur || 0 : +a.balance || 0).toFixed(2)}" data-cur="${isUsd(a) ? 'USD' : ''}" placeholder="${isUsd(a) ? 'in $' : 'type it'}" aria-label="${esc(a.name)} today"><div class="gap sm" id="gap-${a.key}"></div>`}</td></tr>`).join('');
    }
    return `<form id="xcheck"><div class="tbl-w"><table class="tbl xc"><thead><tr><th>Account</th><th class="num">Saved</th><th class="num">Today in your app</th></tr></thead><tbody>${rows}
      ${only ? '' : `<tr class="tot"><td>Net worth</td><td class="num">${eur(D.nw)}</td><td></td></tr>`}</tbody></table></div>
      <div class="row end"><span class="muted sm grow">Type only the ones you check; the others keep their saved balance. Saving records your net worth for today.</span><button class="btn-sm" type="submit">Save and record</button></div></form>`;
  }

  // ---------- small helpers that other pages still use (Holdings and the Alpha Vantage price feed were removed 13 Nov 2026) ----------
  const H = () => [];
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '');
  const pctS = (v) => `${Math.round(v * 100)}%`;
  const pctSg = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;
  const isoD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // dollar accounts keep the last rate saved before the feed was removed
  const fxNow = () => (S.cfg.avFx && S.cfg.avFx.r > 0 ? S.cfg.avFx : null);
  const isUsd = (a) => a && a.cur === 'USD';
  const usdTxt = (v) => frNum(+v || 0, 2) + '\u00a0$';
  function usdSync() { const fx = fxNow(); if (!fx) return; S.cfg.accounts.forEach((a) => { if (isUsd(a) && a.balCur != null) { a.balance = C.r2(+a.balCur * fx.r); a.fxAt = fx.d; } }); }
  function fxAt(d) {
    const hst = S.cfg.avFxH && S.cfg.avFxH.r; const now = S.cfg.avFx;
    if (hst && hst.length) { const last = hst[hst.length - 1][0]; if (now && d > last && now.d >= d) return now.r; let r = hst[0][1]; for (const [dd, v] of hst) { if (dd <= d) r = v; else break; } return r; }
    return now ? now.r : null;
  }
  async function fxDaily() { /* no price feed */ }
  function holdSync() { /* no holdings */ }
  function vHold() { location.hash = 'worth'; return ''; }
  function feeCard() { return ''; }
