'use strict';
  // ---------- shared helpers for Over time and Month tables (the page itself is in app-overtime.js) ----------
  const TM_B = [['home', 'Home and bills'], ['everyday', 'Everyday'], ['lifestyle', 'Lifestyle'], ['family', 'Family'], ['trips', 'Trips'], ['tax', 'Tax']];
  // the cycle today falls in (pay cycle, not calendar month): from the 23rd, today belongs to the next month's cycle
  const tmThis = () => C.budgetMonth(D.today, S.cfg.cutoff);
  const tmZero = () => ({ in: { spendable: 0, bonus: 0, direct: 0, total: 0 }, cost: { home: 0, everyday: 0, lifestyle: 0, family: 0, trips: 0, tax: 0, total: 0 }, left: 0, w: { cur: 0, la: 0, ld: 0, pea: 0, locked: 0, other: 0, direct: 0, total: 0 }, ret: 0, nw: null });
  // a closed month, or the open month so far, from the statement
  function tmFromStmt(k) {
    const st = stmtOf(k); const c = tmZero(); c.key = k; c.in = { spendable: st.income.spendable, bonus: st.income.bonus, direct: st.income.direct, total: st.income.total };
    st.costs.buckets.forEach((b) => { c.cost[b.id] = b.total; }); c.cost.total = st.costs.total; c.left = st.left; const w = st.where;
    const dB = st.income.directBy || { la: 0, ld: 0, pea: 0, pee: st.income.direct, pc: 0 }; c.w = { cur: w.cur, la: w.la - dB.la, ld: w.ldds - dB.ld, pea: w.pea - dB.pea, locked: w.locked - dB.pee - dB.pc, other: 0, direct: st.income.direct, total: w.total }; // money paid straight to any asset sits in direct
    const end = C.monthRange(k, S.cfg.cutoff).to; c.nw = D.complete.includes(k) ? nwAt(end) : D.nw; return c;
  }
  const tmGet = (c, id) => { if (!c) return null; if (id === 'left') return c.left; if (id === 'nw') return c.nw; const [g, f] = id.split('.'); return c[g] ? c[g][f] : null; };
  const tmNum = (v, tot) => (v == null ? '<span class="muted">–</span>' : Math.abs(v) < 0.5 && !tot ? '<span class="muted">–</span>' : eur(v).replace(/[\s\u00a0\u202f]*€/, ''));
  window.addEventListener('resize', () => { if (ui.view === 'time') after.time(); });
  document.addEventListener('keydown', (ev) => { const c = ev.target.closest && ev.target.closest('td[role="button"]'); if (c && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); c.click(); } });
