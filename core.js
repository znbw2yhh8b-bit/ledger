/* Ledger core: statement parsing, categories, monthly aggregation, insights, plan and outlook engines.
   Pure functions, no DOM. Works in the browser (window.Core) and in Node (module.exports). */
(function (root) {
  'use strict';

  // ---------- small helpers ----------
  const r2 = (n) => Math.round(n * 100) / 100;
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const pad = (n) => String(n).padStart(2, '0');
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  const ymKey = (y, m) => `${y}-${pad(m)}`;
  const addMonths = (key, n) => { let [y, m] = key.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return ymKey(y, m); };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = (key, long) => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${long ? y : String(y).slice(2)}`; };

  // ---------- generic CSV (Trade Republic, Revolut, Fortuneo exports) ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0];
    const delim = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const clean = rows.filter((r) => r.some((c) => c.trim()));
    const header = clean[0].map((h) => h.trim());
    const guess = (res) => header.findIndex((h) => res.some((re) => re.test(h)));
    const map = {
      date: guess([/^date$/i, /date op/i, /completed date/i, /^datum$/i, /^date\b/i, /started date/i, /timestamp/i]),
      desc: guess([/^description$/i, /libell/i, /^name$/i, /merchant/i, /payee/i, /bénéficiaire/i, /^note$/i, /description/i]),
      amount: guess([/^amount$/i, /^montant$/i, /^betrag$/i, /^value$/i, /amount/i, /montant/i]),
      debit: guess([/^d[ée]bit/i]), credit: guess([/^cr[ée]dit/i]),
    };
    return { header, rows: clean.slice(1), map, delim };
  }
  function csvToTx(parsed, map, account) {
    const out = []; const seen = {};
    const toIso = (s) => {
      s = s.trim();
      let m = s.match(/^(\d{4})-(\d\d)-(\d\d)/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      m = s.match(/^(\d\d)[/.](\d\d)[/.](\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      m = s.match(/^(\d\d)[/.](\d\d)[/.](\d\d)$/); if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
      return null;
    };
    const num = (s) => {
      if (s == null) return NaN; s = String(s).trim().replace(/[€\s ]/g, '');
      if (!s) return NaN;
      if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
      return parseFloat(s);
    };
    for (const r of parsed.rows) {
      const date = toIso(r[map.date] || ''); if (!date) continue;
      let amt = map.amount >= 0 ? num(r[map.amount]) : NaN;
      if (isNaN(amt) && (map.debit >= 0 || map.credit >= 0)) {
        const d = num(r[map.debit]); const c = num(r[map.credit]);
        amt = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d));
      }
      if (isNaN(amt) || amt === 0) continue;
      const desc = (r[map.desc] || '').trim() || '(no description)';
      const base = `${account}|${date}|${r2(amt)}|${desc}`; seen[base] = (seen[base] || 0) + 1;
      out.push({ id: hash(base + '|' + seen[base]), date, vdate: date, desc, det: [], amt: r2(amt), acct: account });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }

  // ---------- categories and rules ----------
  // group: in (income) | fixed | everyday | family | tax | save (savings & investing) | own (internal) | todo
  const CATS = [
    ['Salary', 'in', 0], ['Bonus', 'in', 0], ['Other income & refunds', 'in', 0],
    ['Rent', 'fixed', 1220], ['Energy', 'fixed', 73.85], ['Internet & mobile', 'fixed', 49.97], ['Home insurance', 'fixed', 10.8],
    ['Bank fees', 'fixed', 6.88], ['Subscriptions', 'fixed', 77],
    ['Groceries', 'everyday', 400], ['Eating out & cafés', 'everyday', 120], ['Transport', 'everyday', 150],
    ['Shopping & leisure', 'everyday', 200], ['Trips & holidays', 'everyday', 0], ['Spending in Lebanon', 'everyday', 0], ['Health & pharmacy', 'everyday', 40], ['Other spending', 'everyday', 30],
    ['Card bill (closed)', 'everyday', 0], ['Spent via Revolut', 'everyday', 0], ['Spent via Trade Republic', 'everyday', 0],
    ['Support for parents', 'family', 600], ['Paid for Paul', 'family', 0],
    ['Income tax', 'tax', 0],
    ['Livret A', 'save', 0], ['LDDS', 'save', 0], ['PEA & investments', 'save', 0], ['Epsor (PEE / PERCOL)', 'save', 0], ['Other own accounts', 'save', 0],
    ['Between my accounts', 'own', 0],
    ['To classify', 'todo', 0],
  ];
  const GROUPS = { in: 'Income', fixed: 'Fixed costs', everyday: 'Everyday spending', family: 'Family', tax: 'Tax', save: 'Saving & investing', own: 'Between my accounts', todo: 'To classify' };
  const catGroup = (c) => (CATS.find((x) => x[0] === c) || [0, 'todo'])[1];
  // Top-up categories: money sent to a spending account. When that account's own export is imported
  // for the same month, the top-up becomes an internal move and its itemised lines count instead.
  const TOPUPS = { 'Spent via Trade Republic': 'TR', 'Spent via Revolut': 'REV' };

  // keyword, category, direction (Any/In/Out). First match wins. Matched on description + detail lines.
  const RULES = [
    ['EY EXPERTISES &', 'Salary', 'In'], ['EY EXPERTISES', 'Other income & refunds', 'In'],
    ['SITBON', 'Rent', 'Any'], ['LOYER', 'Rent', 'Out'],
    ['BANK AUDI', 'Support for parents', 'Out'], ['BANQUE AUDI', 'Support for parents', 'Out'], ['AUDBLB', 'Support for parents', 'Out'],
    ['DGFIP', 'Income tax', 'Any'], ['FINANCES PUBLIQUES', 'Income tax', 'Any'], ['IMPOT', 'Income tax', 'Any'], ['TRESOR PUBLIC', 'Income tax', 'Any'],
    ['EPSOR', 'Epsor (PEE / PERCOL)', 'Any'],
    ['BUDGET MENSUEL', 'Spent via Trade Republic', 'Out'], ['TRADE REPUBLIC', 'Spent via Trade Republic', 'Out'], ['TRADE REPUBLIC', 'Between my accounts', 'In'],
    ['FORTUNEO', 'Other own accounts', 'Any'],
    ['PAUL ALHELOU', 'Paid for Paul', 'Any'], ['ENSA ', 'Paid for Paul', 'Any'], ['CROUS', 'Paid for Paul', 'Out'], ['HEYME', 'Paid for Paul', 'Out'], ['IMAGINE R', 'Paid for Paul', 'Out'],
    ['M. CHARBEL ALHELOU', 'Livret A', 'Any'], ['CHARBEL ALHELOU', 'Between my accounts', 'Any'],
    ['SAVINGS PLAN', 'PEA & investments', 'Any'], ['SPARPLAN', 'PEA & investments', 'Any'], ["PLAN D'INVESTISSEMENT", 'PEA & investments', 'Any'], ['SAVEBACK', 'PEA & investments', 'Any'],
    ['LIVRET', 'Livret A', 'Any'], ['LDDS', 'LDDS', 'Any'],
    ['REVOLUT', 'Spent via Revolut', 'Out'], ['REVOLUT', 'Between my accounts', 'In'],
    ['AMERICAN EXPRESS', 'Card bill (closed)', 'Out'], ['AMERICAN EXPRESS', 'Other income & refunds', 'In'],
    ['EDF', 'Energy', 'Any'], ['ENGIE', 'Energy', 'Any'], ['TOTALENERGIES', 'Energy', 'Any'],
    ['BOUYGUES', 'Internet & mobile', 'Any'], ['FREE MOBILE', 'Internet & mobile', 'Any'], ['ORANGE SA', 'Internet & mobile', 'Any'], ['SFR', 'Internet & mobile', 'Any'],
    ['SOGESSUR', 'Home insurance', 'Any'], ['LOVYS', 'Home insurance', 'Out'], ['ACHEEL', 'Home insurance', 'Out'], ['LEMONADE', 'Home insurance', 'Out'], ['LEOCARE', 'Home insurance', 'Out'],
    ['ALLIANZ', 'Home insurance', 'Out'], ['DIRECT ASSURANCE', 'Home insurance', 'Out'], ['LUKO', 'Home insurance', 'Out'], ['MACIF', 'Home insurance', 'Out'], ['MAIF', 'Home insurance', 'Out'], ['MATMUT', 'Home insurance', 'Out'], ['HISCOX', 'Home insurance', 'Out'],
    ['SOBRIO', 'Bank fees', 'Any'], ['HORS ZONE EURO', 'Bank fees', 'Any'], ['COMMISSION', 'Bank fees', 'Out'], ['AGIOS', 'Bank fees', 'Out'], ['FRAIS ', 'Bank fees', 'Out'],
    ['APPLE.COM', 'Subscriptions', 'Any'], ['WELLPASS', 'Subscriptions', 'Any'], ['GYMLIB', 'Subscriptions', 'Any'], ['NETFLIX', 'Subscriptions', 'Any'], ['SPOTIFY', 'Subscriptions', 'Any'],
    ['DISNEY', 'Subscriptions', 'Any'], ['PRIME VIDEO', 'Subscriptions', 'Any'], ['CHATGPT', 'Subscriptions', 'Any'], ['OPENAI', 'Subscriptions', 'Any'], ['CLAUDE.AI', 'Subscriptions', 'Any'], ['ANTHROPIC', 'Subscriptions', 'Any'],
    ['COMUTITRES', 'Transport', 'Any'], ['NAVIGO', 'Transport', 'Any'],
    ['UBER EATS', 'Eating out & cafés', 'Any'], ['DELIVEROO', 'Eating out & cafés', 'Any'],
    ['MONOP', 'Groceries', 'Any'], ['FRANPRIX', 'Groceries', 'Any'], ['U EXPRESS', 'Groceries', 'Any'], ['N.S.S', 'Groceries', 'Any'], ['CARREFOUR', 'Groceries', 'Any'], ['AUCHAN', 'Groceries', 'Any'],
    ['LIDL', 'Groceries', 'Any'], ['PICARD', 'Groceries', 'Any'], ['NATURALIA', 'Groceries', 'Any'], ['INTERMARCHE', 'Groceries', 'Any'], ['LECLERC', 'Groceries', 'Any'], ['CASINO', 'Groceries', 'Any'],
    ['G20', 'Groceries', 'Any'], ['MARKET', 'Groceries', 'Any'], ['GRAND FRAIS', 'Groceries', 'Any'], ['BIOCOOP', 'Groceries', 'Any'],
    ['TOUR FIRST', 'Eating out & cafés', 'Any'], ['SUMUP', 'Eating out & cafés', 'Any'], ['SQ ', 'Eating out & cafés', 'Any'], ['CAFE', 'Eating out & cafés', 'Any'], ['RESTAU', 'Eating out & cafés', 'Any'],
    ['RAMEN', 'Eating out & cafés', 'Any'], ['PHO ', 'Eating out & cafés', 'Any'], ['TGTG', 'Eating out & cafés', 'Any'], ['TOO GOOD TO GO', 'Eating out & cafés', 'Any'], ['SMITH AND SON', 'Eating out & cafés', 'Any'],
    ['MONTAIGNE', 'Eating out & cafés', 'Any'], ['FAMILLE IRIS', 'Eating out & cafés', 'Any'], ['AFILAL', 'Eating out & cafés', 'Any'], ['OKITO', 'Eating out & cafés', 'Any'], ['HALLYU', 'Eating out & cafés', 'Any'],
    ['CORCORAN', 'Eating out & cafés', 'Any'], ['DEBONNAIRE', 'Eating out & cafés', 'Any'], ['FROG', 'Eating out & cafés', 'Any'], ['SECCO', 'Eating out & cafés', 'Any'], ['AREAS', 'Eating out & cafés', 'Any'],
    ['RELAY AIR', 'Eating out & cafés', 'Any'], ['KURUCA', 'Eating out & cafés', 'Any'], ['AYASHI', 'Eating out & cafés', 'Any'], ['MAISON SHAN', 'Eating out & cafés', 'Any'], ['LUCKY HOUSE', 'Eating out & cafés', 'Any'],
    ['FAURN', 'Eating out & cafés', 'Any'], ['CQF', 'Eating out & cafés', 'Any'], ['BOULANG', 'Eating out & cafés', 'Any'], ['STARBUCKS', 'Eating out & cafés', 'Any'], ['MCDO', 'Eating out & cafés', 'Any'],
    ['BURGER', 'Eating out & cafés', 'Any'], ['PIZZA', 'Eating out & cafés', 'Any'], ['SELECTA', 'Eating out & cafés', 'Any'], ['DAILY DEFENSE', 'Eating out & cafés', 'Any'], ['BELLY', 'Eating out & cafés', 'Any'],
    ['BERYTE', 'Eating out & cafés', 'Any'], ['RANA', 'Eating out & cafés', 'Any'], ['CATY', 'Eating out & cafés', 'Any'],
    ['UBR', 'Transport', 'Any'], ['UBER', 'Transport', 'Any'], ['SNCF', 'Transport', 'Any'], ['LIME', 'Transport', 'Any'], ['SMOVENGO', 'Transport', 'Any'],
    ['AIRBNB', 'Trips & holidays', 'Any'], ['RATP', 'Transport', 'Any'], ['BOLT', 'Transport', 'Any'], ['AIR FRANCE', 'Trips & holidays', 'Any'], ['BOOKING', 'Trips & holidays', 'Any'],
    ['TRANSAVIA', 'Trips & holidays', 'Any'], ['EASYJET', 'Trips & holidays', 'Any'], ['RYANAIR', 'Trips & holidays', 'Any'], ['MIDDLE EAST AIR', 'Trips & holidays', 'Any'], ['G7', 'Transport', 'Out'],
    ...['EUROSTAR', 'VUELING', 'LUFTHANSA', 'EMIRATES', 'TURKISH AIR', 'QATAR AIR', 'HOTEL', 'HOTELS.COM', 'EXPEDIA', 'ACCOR', 'IBIS', 'NOVOTEL', 'GETYOURGUIDE', 'TRAINLINE'].map((k) => [k, 'Trips & holidays', 'Any']),
    ['PHARMACIE', 'Health & pharmacy', 'Any'], ['HOSPITALIERE', 'Health & pharmacy', 'Any'], ['CPAM', 'Health & pharmacy', 'In'], ['AON', 'Health & pharmacy', 'In'], ['DOCTOLIB', 'Health & pharmacy', 'Any'],
    ['LAUNDRYHEAP', 'Other spending', 'Any'], ['LAVERIE', 'Other spending', 'Any'], ['PRESSING', 'Other spending', 'Any'],
    ['DECATHLON', 'Shopping & leisure', 'Any'], ['UNIQLO', 'Shopping & leisure', 'Any'], ['ABERCROMBIE', 'Shopping & leisure', 'Any'], ['GYMSHARK', 'Shopping & leisure', 'Any'], ['MYPROTEIN', 'Shopping & leisure', 'Any'],
    ['BULK', 'Shopping & leisure', 'Any'], ['HAHN', 'Shopping & leisure', 'Any'], ['DARTY', 'Shopping & leisure', 'Any'], ['CITADIUM', 'Shopping & leisure', 'Any'], ['ANYBUDDY', 'Shopping & leisure', 'Any'],
    ['FITNESS PARK', 'Shopping & leisure', 'Any'], ['HOOPS', 'Shopping & leisure', 'Any'], ['BARBER', 'Shopping & leisure', 'Any'], ['WU ET VU', 'Shopping & leisure', 'Any'], ['MAISON LFL', 'Shopping & leisure', 'Any'],
    ['ZARA', 'Shopping & leisure', 'Any'], ['FNAC', 'Shopping & leisure', 'Any'], ['AMAZON', 'Shopping & leisure', 'Any'], ['IKEA', 'Shopping & leisure', 'Any'], ['APPLE STORE', 'Shopping & leisure', 'Any'],
    ['GRAND REX', 'Shopping & leisure', 'Any'], ['PB CHATELET', 'Shopping & leisure', 'Any'],
    ['RETRAIT DAB', 'Other spending', 'Any'], ['COPY TOP', 'Other spending', 'Any'], ['DISTRIBEN', 'Other spending', 'Any'], ['AJKONSEIL', 'Other spending', 'Any'], ['IVS FRANCE', 'Other spending', 'Any'],
    ['LIMDIS', 'Other spending', 'Any'], ['MOMENTUM', 'Other spending', 'Any'], ['RIBEAU', 'Other spending', 'Any'], ['SEDPA', 'Other spending', 'Any'], ['RELAY', 'Other spending', 'Any'], ['TIMBRE FISCAL', 'Other spending', 'Any'],
    ['PRIME COMPTE', 'Other income & refunds', 'In'], ['PRIME PARRAINAGE', 'Other income & refunds', 'In'], ['REGULARISATION DE COMMISSION', 'Bank fees', 'Any'],
    // restaurants, bars and cafés seen on your statements
    ...['BRASSERI', 'BISTRO', 'PUB ', 'TAVERNE', 'CREPERIE', 'CHAWARMA', 'SHAWARMA', 'SHWAR', 'SCHWARTZ', 'TAWOUK', 'LEBANESE', 'PHENICIEN', 'FIVE GUYS', 'WINGSTOP', 'QUICK', 'OSAKA', 'SUSHI', 'KEBAB',
      'AMORINO', 'FOURNIL', 'BOUL ', 'GRILL', 'CANAILLES', 'COMPTOIR', 'WINE BAR', 'NEWREST', 'ROSEFOOD', 'SBX', 'SAAS F', 'SPECIMEN', "NIEL'S", 'ELY S BAR', 'CASTELLI', 'LUTECE', 'MABILLON', 'CONTRE ALLEE',
      'LA FAVORITE', 'BISOU', 'LOUIS PHILIPPE', 'SANCERNE', 'RONG SHUN', 'MANGEZ', 'DAKAR EAT', 'SHIFU', 'QASTI', "L'ACHTA", 'LILIANE', 'CHEZ ZAZA', 'P\'TIT BRETON', 'MOULIN D', 'LES 3 MALADROITS', 'FIBUSTIERS',
      'GEORGE V', 'TD PYRAMIDES', 'BBGN', 'SUNDAY*', 'GREAT CANADIA', 'GSM BONNARD', 'LOTUS', 'COMPAS D', 'AU RELAIS', 'BIENHEUREUSE', 'FERIA', 'MISTER GARDEN', 'LOURMEL', 'ETIENNE', 'SARL NAZAE', 'CHATEAU BOUL']
      .map((k) => [k, 'Eating out & cafés', 'Any']),
    ...['GAUMONT', 'PATHE', 'UGC ', 'CINE', 'BILLETREDUC', 'TICKETAC', 'COMEDY', 'DAZN', 'TENNIS', 'THE ONE BALL', 'NEONESS', 'TRAINING YOU', 'PUGIL', 'FOLIE DOUCE', 'LE CLUB', 'TOUR EIFFEL', 'PHOTOMATON',
      'MASSIMO', 'HOLLISTER', 'NIKE', 'AIGLE', 'WITHINGS', 'EXALT', 'SAUVAIN', 'FG LES HALLES']
      .map((k) => [k, 'Shopping & leisure', 'Any']),
    ...['STIB', 'TFL ', 'ESSO', 'TOTAL ', 'TERMINAL', 'SNCB', 'HEETCH', 'MARCEL', 'FREENOW'].map((k) => [k, 'Transport', 'Any']),
    ...['DOCTEUR', 'DR ', 'PHCIE', 'DENTIST', 'KINE', 'LABO', 'OPTIC'].map((k) => [k, 'Health & pharmacy', 'Any']),
    ...['MOPRIX', 'MARCHE DE', 'JARDIN DE NEUILLY', 'V H DISTRIBUTION', 'HD SEINE', 'HELIOS DISTRIB', 'AVIDIS', 'BERRIE', 'ENKAS', 'BARBIN FAMILY', 'AJEM'].map((k) => [k, 'Groceries', 'Any']),
    ['TOP-UP', 'Between my accounts', 'In'], ['TOPUP', 'Between my accounts', 'In'], ['VIREMENT DE CHARBEL', 'Between my accounts', 'In'],
    ['WERO', 'Other income & refunds', 'In'], ['VIR INST RE', 'Other income & refunds', 'In'], ['VIR RECU', 'Other income & refunds', 'In'],
  ];
  const txText = (t) => (t.desc + ' | ' + (t.det || []).join(' | ')).toUpperCase();
  function classify(t, userRules) {
    const d = txText(t);
    const all = (userRules || []).concat(RULES);
    for (const [kw, cat, dir] of all) {
      if (d.includes(String(kw).toUpperCase()) && (dir === 'Any' || (dir === 'In' && t.amt > 0) || (dir === 'Out' && t.amt < 0))) return cat;
    }
    // Bonus detection: an EY credit well above the usual salary in Jul/Oct
    return 'To classify';
  }
  function categorise(t, userRules, overrides) {
    if (overrides && overrides[t.id]) return overrides[t.id];
    if (t.cat0) return t.cat0; // category given when the statement was imported (e.g. Revolut lines sorted when imported)
    let c = classify(t, userRules);
    if (c === 'Salary' && t.amt > 6000) c = 'Bonus';
    return c;
  }
  // a keyword the person can turn into a rule, taken from the line
  function suggestKeyword(t) {
    const de = (t.det || []).find((l) => /^(DE|POUR)\s*:/.test(l));
    if (de) return de.replace(/^(DE|POUR)\s*:\s*/, '').trim().toUpperCase().slice(0, 30);
    let s = t.desc.toUpperCase().replace(/^CARTE X\d{4}\s+(TRANSF\s+)?\d\d\/\d\d\s+/, '').replace(/^PRELEVEMENT EUROPEEN \d+\s*/, '').replace(/^\d{6}\s+VIR\s+\w+\s+\w+\s*/, '');
    s = s.replace(/\*+\d+\*?/g, '').replace(/\s+\d{3,}.*$/, '').trim();
    return s.split(' ').slice(0, 3).join(' ').slice(0, 30);
  }
  const merchant = (t) => {
    const de = (t.det || []).find((l) => /^(DE|POUR)\s*:/.test(l));
    if (de) return de.replace(/^(DE|POUR)\s*:\s*/, '').replace(/\s+/g, ' ').trim();
    // bank CSV lines carry the payee inside the description ("PRELEVEMENT EUROPEEN DE: EDF ...", "VIR PERM POUR: Didier Sitbon"): use it, so they match the PDF lines
    const inl = /^(?:\d{6}\s+)?(?:PRELEVEMENT EUROPEEN|VIR PERM|VIR EMIS|VIR RECU|VIR INSTANTANE EMIS LOGITEL)\s+(?:DE|POUR)\s*:\s*(.+?)(?=\s+(?:ID|MOTIF|REF|DATE|CHEZ|MANDAT)\s*:|\s+\d\d\s\d\d\s|$)/.exec(t.desc || '');
    if (inl) return inl[1].replace(/\s+/g, ' ').trim();
    return t.desc.replace(/^CARTE X\d{4}\s+(TRANSF\s+)?\d\d\/\d\d\s+/, '').replace(/^PRELEVEMENT EUROPEEN \d+\s*/, '').replace(/^\d{6}\s+/, '').trim();
  };

  // ---------- budget months ----------
  // A budget month runs from the cutoff day (default 23) to the day before it in the next month,
  // matching the SG statement periods. It is named after the month it ends in.
  function budgetMonth(iso, cutoff) {
    const [y, m, d] = iso.split('-').map(Number);
    return d >= (cutoff || 23) ? addMonths(ymKey(y, m), 1) : ymKey(y, m);
  }
  function monthRange(key, cutoff) {
    cutoff = cutoff || 23;
    const prev = addMonths(key, -1);
    return { from: `${prev}-${pad(cutoff)}`, to: `${key}-${pad(cutoff - 1)}` };
  }

  // ---------- state → enriched transactions ----------
  function allTransactions(state) {
    const out = [];
    const ov = (state.overrides && state.overrides.map) || {};
    const ur = (state.rules && state.rules.list) || [];
    const seenIds = new Set();
    for (const st of Object.values(state.stmts || {})) {
      if (st.role === 'savings') continue;
      for (const t of st.tx || []) {
        if (seenIds.has(t.id)) continue; seenIds.add(t.id);
        const c0 = categorise(t, ur, ov); let cat = CAT_ALIAS[c0] || c0;
        const month = budgetMonth(t.date, state.settings.cutoff);
        if (cat === 'Livret A & LDDS' || cat === 'Livret A' || cat === 'LDDS') cat = splitSavings(cat, t, month); // saved choices and rules keep their name; the split is made here // the Amex account is closed: its past bills keep counting under their new name; saved choices are not touched
        out.push({ ...t, cat, group: catGroup(cat), month, src: st.id });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || b.amt - a.amt);
    return out;
  }

  function monthSummary(txs, key, settings) {
    const m = txs.filter((t) => t.month === key);
    const itemised = new Set(m.filter((t) => !String(t.acct).startsWith('SG')).map((t) => t.acct));
    const byCat = {};
    const add = (c, v) => { byCat[c] = r2((byCat[c] || 0) + v); };
    for (const t of m) {
      if (TOPUPS[t.cat] && itemised.has(TOPUPS[t.cat]) && !t.unmatched) { add('Between my accounts', t.amt); continue; }
      if (t.cat === 'Spent via Trade Republic' && t.amt < 0) {
        // the monthly Trade Republic transfer also carries the PEA plan
        const peaPlan = (settings.proj ? settings.proj.peaMonthly : settings.peaPlan) || 0; const pea = Math.min(-t.amt, peaPlan);
        const already = byCat['PEA & investments:fromTR'] || 0;
        const take = Math.max(0, Math.min(pea, peaPlan - already));
        add('PEA & investments', -take); byCat['PEA & investments:fromTR'] = already + take;
        add('Spent via Trade Republic', t.amt + take); continue;
      }
      add(t.cat, t.amt);
    }
    delete byCat['PEA & investments:fromTR'];
    const g = (grp) => r2(sum(Object.entries(byCat).filter(([c]) => catGroup(c) === grp), ([, v]) => v));
    const income = g('in');
    const fixed = -g('fixed'), everyday = -g('everyday'), family = -g('family'), tax = -g('tax');
    const saved = -g('save'); const todo = -g('todo');
    const spending = r2(fixed + everyday + (todo > 0 ? todo : 0));
    const left = r2(income - spending - family - tax);
    return { key, n: m.length, byCat, income, fixed: r2(fixed), everyday: r2(everyday), family: r2(family), tax: r2(tax), saved: r2(saved), todo: r2(todo), spending, left, rate: income > 0 ? left / income : 0, itemised: [...itemised] };
  }

  // ---------- recurring payments ----------
  function detectRecurring(txs, lastKey, nMonths) {
    const keys = []; for (let i = nMonths - 1; i >= 0; i--) keys.push(addMonths(lastKey, -i));
    const by = {};
    for (const t of txs) {
      if (!keys.includes(t.month) || t.amt >= 0) continue;
      if (!/PRELEVEMENT|VIR PERM|COTISATION/.test(t.desc) && !['Subscriptions'].includes(t.cat)) continue;
      const k = merchant(t).toUpperCase().replace(/\s+/g, ' ').slice(0, 40) + (/MOTIF:\s*(\S+)/.exec((t.det || []).join(' ')) || ['', ''])[1];
      (by[k] = by[k] || []).push(t);
    }
    return Object.entries(by).filter(([, l]) => new Set(l.map((t) => t.month)).size >= 2).map(([k, l]) => {
      l.sort((a, b) => a.date.localeCompare(b.date));
      const last = l[l.length - 1], prev = l[l.length - 2];
      return { key: k, name: merchant(last), cat: last.cat, last: -last.amt, prev: -prev.amt, day: +last.date.slice(8), months: new Set(l.map((t) => t.month)).size, lastDate: last.date };
    }).sort((a, b) => b.last - a.last);
  }

  // ---------- French income tax ----------
  function bareme(income, s) {
    const b = s.tax.brackets; // [[upTo, rate], ...]
    let tax = 0, prev = 0;
    for (const [upTo, rate] of b) { if (income > prev) tax += (Math.min(income, upTo) - prev) * rate; prev = upTo; }
    return Math.max(0, tax);
  }
  function marginalRate(income, s) { let prev = 0; for (const [upTo, rate] of s.tax.brackets) { if (income <= upTo) return rate; prev = upTo; } return s.tax.brackets[s.tax.brackets.length - 1][1]; }
  function incomeTax(netTaxable, deductions, s) {
    const allow = Math.min(s.tax.allowMax, Math.max(s.tax.allowMin, netTaxable * 0.1));
    const base = Math.max(0, netTaxable - allow - deductions);
    return { base, tax: bareme(base, s), tmi: marginalRate(base, s) };
  }

  // ---------- 5-year monthly engine ----------

  // ---------- next-two-months cash plan (SG current account) ----------

  // ---------- insights ----------
  // ---------- the monthly plan: one source for the 2-month plan, the budgets and the 5-year outlook ----------
  const SPECIAL = ['sal', 'tr', 'ld', 'par'];
  const fmt0 = (v) => Math.round(v).toLocaleString('en-GB');
  function netPayCalc(s) { const P = s.proj; const gm = P.salary / 12 + P.seniority; return r2(gm * P.netRatio - P.pasRate * gm * P.taxRatio + P.transport - P.mealShare); }
  const netPay = (s) => (s.proj.netPay != null && s.proj.netPay !== '' && !isNaN(+s.proj.netPay) ? +s.proj.netPay : netPayCalc(s));
  function effRecurring(s) {
    const P = s.proj; const d = s.days || {};
    const gen = [{ id: 'sal', label: 'EY salary (net)', amt: netPay(s), day: d.sal || 28, kind: 'income', cat: 'Salary', gen: true }];
    const env = +s.envelope || 0, pea = +P.peaMonthly || 0;
    if (env + pea > 0) gen.push({ id: 'tr', label: `Trade Republic: spending ${fmt0(env)} + PEA plan ${fmt0(pea)}`, amt: -(env + pea), day: d.tr || 1, kind: 'move', to: 'pea', toAmt: pea, gen: true });
    if (+P.ldMonthly > 0) gen.push({ id: 'ld', label: 'LDDS standing order', amt: -P.ldMonthly, day: d.ld || 2, kind: 'saving', to: 'ld', toAmt: +P.ldMonthly, cat: 'LDDS', gen: true });
    if (+s.parents.amount > 0) gen.push({ id: 'par', label: `Parents, Bank Audi (${fmt0(s.parents.amount)} + SG fee)`, amt: -(+s.parents.amount + s.parents.fee), day: s.parents.day || 5, months: s.parents.months, kind: 'family', cat: 'Support for parents', gen: true });
    return gen.concat((s.recurring || []).filter((r) => !SPECIAL.includes(r.id)));
  }
  const monthlyEq = (r) => (r.months && r.months.length ? r.amt * r.months.length / 12 : r.amt);
  const recurringPart = (s, c) => -sum(effRecurring(s).filter((r) => !r.off && !r.until && r.cat === c && r.amt < 0), monthlyEq);
  // budget = what your recurring SG payments cost in that category + your split of the Trade Republic envelope
  function budgetFor(s, c) {
    const g = catGroup(c); const rp = recurringPart(s, c);
    if (g === 'everyday') return r2(rp + (+((s.split || {})[c]) || 0));
    if (g === 'fixed' || g === 'family') return r2(rp);
    return 0;
  }
  const planBills = (s) => -sum(effRecurring(s).filter((r) => !r.off && !r.until && r.kind === 'bill'), monthlyEq);
  const planCosts = (s) => planBills(s) + (+s.envelope || 0);
  function guessCat(r) {
    const t = (r.id + ' ' + r.label).toUpperCase();
    const map = [['RENT', 'Rent'], ['SITBON', 'Rent'], ['EDF', 'Energy'], ['SFR', 'Internet & mobile'], ['BOUYGUES', 'Internet & mobile'], ['NAVIGO', 'Transport'], ['SOGESSUR', 'Home insurance'], ['INSURANCE', 'Home insurance'],
      ['NETFLIX', 'Subscriptions'], ['APPLE', 'Subscriptions'], ['GYM', 'Subscriptions'], ['SOBRIO', 'Bank fees'], ['PAUL', 'Paid for Paul'], ['FORTUNEO', 'Other own accounts'], ['TAX', 'Income tax']];
    for (const [k, c] of map) if (t.includes(k)) return c;
    return r.kind === 'tax' ? 'Income tax' : r.kind === 'family' ? 'Paid for Paul' : r.kind === 'move' ? 'Other own accounts' : 'Other spending';
  }
  const titleCase = (x) => String(x).toLowerCase().replace(/(^|[\s(/-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).slice(0, 40);
  function fmtDate(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; }

  // ---------- default settings (your numbers as of early Nov 2026, from the Excel model and statements) ----------
  function defaults() {
    return {
      v: 2, cutoff: 23, buffer: 3000,
      envelope: 1000, days: { sal: 28, tr: 1, ld: 2 },
      // how the Trade Republic envelope is split between everyday categories (TR-paid part of each budget)
      split: { 'Groceries': 400, 'Eating out & cafés': 120, 'Transport': 60, 'Shopping & leisure': 200, 'Health & pharmacy': 40, 'Other spending': 30 },
      accounts: [
        { key: 'sg', name: 'SG current account ••2341', kind: 'cash', balance: 1394, asOf: '2026-11-02' },
        { key: 'tr', name: 'Trade Republic cash', kind: 'cash', balance: 340, asOf: '2026-11-02' },
        { key: 'fo', name: 'Fortuneo', kind: 'cash', balance: 0, asOf: '2026-10-30' },
        { key: 'rev', name: 'Revolut', kind: 'cash', balance: 0, asOf: '2026-10-30' },
        { key: 'la', name: 'Livret A ••3118', kind: 'save', balance: 22949, asOf: '2026-11-02' },
        { key: 'ld', name: 'LDDS ••0757', kind: 'save', balance: 2010, asOf: '2026-11-02' },
        { key: 'pea', name: 'PEA (Trade Republic)', kind: 'invest', balance: 256, asOf: '2026-11-02' },
        { key: 'pee', name: 'Epsor PEE', kind: 'invest', balance: 1600, asOf: '2026-11-02' },
        { key: 'pc', name: 'Epsor PERCOL', kind: 'invest', balance: 1694, asOf: '2026-11-02' },
        { key: 'other', name: 'Other investments', kind: 'invest', balance: 0, asOf: '2026-10-30' },
        { key: 'dep', name: 'Rent deposit (Didier Sitbon)', kind: 'deposit', balance: 2300, asOf: '2026-11-02' },
        { key: 'paul', name: 'Paul owes you', kind: 'loan', balance: 8500, asOf: '2026-10-22' },
      ],
      // SG payments other than salary, Trade Republic, LDDS and parents (those come from the plan above)
      recurring: [
        { id: 'rent', label: 'Rent to Didier Sitbon', amt: -1220, day: 1, kind: 'bill', cat: 'Rent' },
        { id: 'fo', label: 'Fortuneo', amt: -40, day: 1, kind: 'move', to: 'fo', toAmt: 40, cat: 'Other own accounts' },
        { id: 'edf', label: 'EDF', amt: -73.85, day: 2, kind: 'bill', cat: 'Energy' },
        { id: 'sfr', label: 'SFR', amt: -1.99, day: 2, kind: 'bill', cat: 'Internet & mobile' },
        { id: 'nav', label: 'Navigo', amt: -90.8, day: 5, kind: 'bill', cat: 'Transport' },
        { id: 'bt7', label: 'Bouygues (07 line)', amt: -18.34, day: 5, kind: 'bill', cat: 'Internet & mobile' },
        { id: 'sog', label: 'Sogessur home insurance', amt: -20.2, day: 5, kind: 'bill', cat: 'Home insurance' },
        { id: 'nfx', label: 'Netflix', amt: -14.99, day: 11, kind: 'bill', cat: 'Subscriptions' },
        { id: 'app', label: 'Apple subscriptions', amt: -32.96, day: 20, kind: 'bill', cat: 'Subscriptions' },
        { id: 'sob', label: 'Sobrio (SG package)', amt: -6.88, day: 21, kind: 'bill', cat: 'Bank fees' },
        { id: 'gym', label: 'Gym (eGym Wellpass)', amt: -23, day: 23, kind: 'bill', cat: 'Subscriptions' },
        { id: 'tax25', label: 'Income tax 2025 balance (SG took 357 on 25 Sep)', amt: -357, day: 27, from: '2026-11-01', until: '2026-12-31', kind: 'tax', cat: 'Income tax', check: true },
        { id: 'bt9', label: 'Bouygues (box)', amt: -40.99, day: 30, kind: 'bill', cat: 'Internet & mobile' },
        { id: 'bt6', label: 'Bouygues (06 line)', amt: -35.39, day: 30, kind: 'bill', cat: 'Internet & mobile' },
        { id: 'paul', label: 'Standing order to Paul (ran 30 Jul, 30 Aug, 30 Sep)', amt: -615, day: 30, kind: 'family', cat: 'Paid for Paul', check: true },
      ],
      oneOffs: [],
      goals: [
        { id: 'g-ld', name: 'LDDS full', target: 12000, keys: ['ld'] },
        { id: 'g-50', name: 'Net worth €50,000', target: 50000, keys: ['*'] },
        { id: 'g-100', name: 'Net worth €100,000', target: 100000, keys: ['*'] },
      ],
      parents: { amount: 1800, months: [3, 6, 9, 12], day: 5, fee: 13, corr: 20, fx: 0.014, capPerYear: 7200 },
      paul: { agreed: 8500, since: '2026-10-22' },
      caps: { la: 22950, ld: 12000 },
      rates: { livret: 0.017, pea: 0.05, pee: 0.045, percolFee: 0.005 },
      tax: { brackets: [[11600, 0], [29579, 0.11], [84577, 0.30], [181917, 0.41], [1e12, 0.45]], allowMin: 509, allowMax: 14555 },
      taxYTD: { year: 2026, through: '2026-10', netTaxable: 72759.91, pas: 12446.07, parentsSent: 0, percol: 0, source: '' },
      taxPending: [{ key: '2026-12', amount: 357 }],
      proj: {
        salary: 90000, seniority: 33, netPay: null, raise: 0.03, raiseFromThisOct: false, bonus: 0, bonusJulyShare: 0.38,
        netRatio: 0.781, taxRatio: 0.821, bonusNetRatio: 0.80, bonusTaxRatio: 0.83, transport: 62.43, mealShare: 100, pasRate: 0.176,
        inflation: 0.02, ldMonthly: 450, peaMonthly: 250, percolDec: 2400, percolUntil: 0, participation: 2118, participationMonth: 10,
        participationDoneThisYear: true, sweep: true, endYear: 2031, costBasis: 'plan',
      },
    };
  }
  // Settings saved by the first version kept the salary, Trade Republic, LDDS and parents payments as separate
  // recurring lines, and the budgets apart from them. Version 2 derives all of those from one monthly plan.
  function mergeSettings(saved) {
    const d = defaults(); if (!saved) return d;
    const out = { ...d, ...saved };
    for (const k of ['parents', 'paul', 'caps', 'rates', 'tax', 'proj', 'days']) out[k] = { ...d[k], ...(saved[k] || {}) };
    if (!Array.isArray(out.accounts)) out.accounts = d.accounts;
    for (const a of d.accounts) if (!out.accounts.find((x) => x.key === a.key)) out.accounts.push(a);
    if (!Array.isArray(out.goals)) out.goals = d.goals;
    if (!Array.isArray(out.oneOffs)) out.oneOffs = [];
    if (!saved.v || saved.v < 2) {
      const old = saved.recurring || [];
      const rec = (id) => old.find((r) => r.id === id);
      const tr = rec('tr'), ld = rec('ld'), par = rec('par'), sal = rec('sal');
      if (tr) { out.proj.peaMonthly = tr.toAmt != null ? +tr.toAmt : (saved.peaPlan != null ? +saved.peaPlan : out.proj.peaMonthly); out.envelope = r2(-tr.amt - out.proj.peaMonthly); out.days.tr = tr.day; }
      if (ld) { out.proj.ldMonthly = -ld.amt; out.days.ld = ld.day; }
      if (par) { out.parents.amount = r2(-par.amt - out.parents.fee); if (par.months) out.parents.months = par.months; out.parents.day = par.day; }
      if (sal) { out.days.sal = sal.day; out.proj.netPay = Math.abs(sal.amt - netPayCalc(out)) < 1 ? null : sal.amt; }
      out.recurring = old.filter((r) => !SPECIAL.includes(r.id)).map((r) => ({ ...r, cat: r.cat || guessCat(r) }));
      if (out.proj.costBasis === 'budget') out.proj.costBasis = 'plan';
      // everyday budgets become the split of the envelope: old budget minus what recurring SG payments already cover
      const ob = saved.budgets || {}; out.split = {};
      for (const [c, g, b] of CATS) if (g === 'everyday') { const v = r2((ob[c] != null ? +ob[c] : b) - recurringPart(out, c)); if (v > 0) out.split[c] = Math.round(v); }
      delete out.budgets; delete out.peaPlan;
      out.v = 2;
    }
    if (!out.split) out.split = { ...d.split };
    return out;
  }
  const fixedEverydayBudget = (s) => planCosts(s);

  // ---------- history: SG and Livret A balances month by month, from the statements ----------
  // SG closing balances are exact. The Livret A is exact where its own statements exist and is rebuilt
  // before that from the transfers on the SG statements (interest credited each 31 December is not visible there).
  function savingsHistory(state, txs) {
    const st = Object.values(state.stmts || {});
    const sg = st.filter((x) => x.role !== 'savings' && String(x.account).startsWith('SG') && x.closing != null).sort((a, b) => a.to.localeCompare(b.to));
    const anchors = [];
    for (const x of st.filter((x) => x.acctKey === 'la')) {
      if (x.opening != null) { const d = new Date(Date.parse(x.from) - 86400000).toISOString().slice(0, 10); anchors.push({ date: d, bal: x.opening }); }
      (x.checkpoints || []).forEach((c) => anchors.push({ date: c.date, bal: c.bal }));
      if (x.closing != null) anchors.push({ date: x.to, bal: x.closing });
    }
    anchors.sort((a, b) => a.date.localeCompare(b.date));
    const flows = txs.filter((t) => t.cat === 'Livret A').map((t) => ({ date: t.date, v: -t.amt }));
    const laAt = (d) => {
      if (!anchors.length) return null;
      const exact = anchors.find((a) => a.date === d); if (exact) return { bal: exact.bal, est: false };
      const before = anchors.filter((a) => a.date < d).pop();
      if (before) return { bal: r2(before.bal + sum(flows.filter((f) => f.date > before.date && f.date <= d), (f) => f.v)), est: d > anchors[anchors.length - 1].date };
      const a = anchors[0]; return { bal: r2(a.bal - sum(flows.filter((f) => f.date > d && f.date <= a.date), (f) => f.v)), est: true };
    };
    return sg.map((x) => { const la = laAt(x.to); return { date: x.to, sg: x.closing, la: la ? la.bal : null, laEst: la ? la.est : true }; });
  }

  // ---------- goals: where you are today and when the projection gets there ----------

  // ---------- the one statement ----------
  // Six cost buckets; every category sits in exactly one (this table is the only place that says so).
  const BUCKET6 = [['home', 'Home and bills'], ['everyday', 'Everyday'], ['lifestyle', 'Lifestyle'], ['family', 'Family'], ['trips', 'Trips'], ['tax', 'Tax']];
  const BUCKET6_OF = {
    'Rent': 'home', 'Energy': 'home', 'Internet & mobile': 'home', 'Home insurance': 'home', 'Bank fees': 'home', 'Subscriptions': 'home',
    'Groceries': 'everyday', 'Transport': 'everyday', 'Health & pharmacy': 'everyday',
    'Eating out & cafés': 'lifestyle', 'Shopping & leisure': 'lifestyle', 'Other spending': 'lifestyle', 'Card bill (closed)': 'lifestyle', 'Spent via Revolut': 'lifestyle', 'Spent via Trade Republic': 'lifestyle', 'To classify': 'lifestyle',
    'Support for parents': 'family', 'Paid for Paul': 'family',
    'Spending in Lebanon': 'trips', 'Trips & holidays': 'trips',
    'Income tax': 'tax',
  };
  // money sent to Paul is a Family cost; what he owes is a memo only, never in net worth, the budget or the forecast
  // Livret A and LDDS are two categories. Every movement up to the Oct26 budget month counts as Livret A; later ones go to the LDDS when the line names it (LDDS or ••0757)
  function splitSavings(cat, t, month) {
    if (month <= '2026-10') return 'Livret A';
    if (cat !== 'Livret A & LDDS') return cat;
    return /LDDS|0757/.test(txText(t)) ? 'LDDS' : 'Livret A';
  }
  const CAT_ALIAS = { 'Card bill (Amex)': 'Card bill (closed)' };
  let B6_OVR = {}; const setBucket6 = (m) => { B6_OVR = m || {}; }; // your own category to bucket choices (Settings); empty = the table above
  const bucket6Of = (c) => B6_OVR[c] || BUCKET6_OF[c] || (['in', 'save', 'own'].includes(catGroup(c)) ? null : 'lifestyle');
  const INCOME_CATS = ['Salary', 'Bonus', 'Other income & refunds'];
  const median = (a) => { const v = a.filter((x) => isFinite(x)).sort((x, y) => x - y); if (!v.length) return 0; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const TAPTAP = /TAPTAP/i;
  // opts: { trPea (PEA part of the Trade Republic transfer), bonus (bonus part of pay, from the month's P&L), direct (paid straight into a savings or locked account, e.g. participation) }
  // Money in = spendable + bonus + paid straight into savings. Costs are positive numbers. Left over = spendable + bonus - costs.
  // Where it went (To assets): current accounts, Livret A, LDDS, PEA, locked (PEE/PERCOL). Money paid straight into savings counts in Money in, so the total of To assets is Left over.
  function statement(txs, key, opts) {
    const o = opts || {}; const m = monthSummary(txs, key, { proj: { peaMonthly: o.trPea || 0 } }); const by = m.byCat; const mt = txs.filter((t) => t.month === key);
    const inc = sum(INCOME_CATS, (c) => by[c] || 0); const bonus = Math.min(inc, Math.max(0, o.bonus || 0));
    // direct: a number (all to locked, as before) or by account { la, ld, pea, pee, pc } from the income you add on Month
    const dBy = o.direct && typeof o.direct === 'object' ? o.direct : { pee: Math.max(0, +o.direct || 0) }; const dv = (k) => Math.max(0, +dBy[k] || 0);
    const direct = r2(sum(Object.keys(dBy), dv)); const KNOWN_D = ['la', 'ld', 'pea', 'pee', 'pc'];
    const buckets = BUCKET6.map(([id, name]) => {
      const cats = Object.entries(by).filter(([c, v]) => bucket6Of(c) === id && v !== 0).map(([c, v]) => ({ cat: c, amt: r2(-v) })).sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));
      const top = cats.length > 5 ? cats.slice(0, 4).concat([{ cat: 'Other', amt: r2(sum(cats.slice(4), (x) => x.amt)) }]) : cats;
      const b = { id, name, total: r2(sum(cats, (x) => x.amt)), cats: top };
      if (id === 'trips') b.taptap = r2(-sum(mt.filter((t) => t.cat === 'Spending in Lebanon' && TAPTAP.test(`${t.desc} ${(t.det || []).join(' ')}`)), (t) => t.amt));
      return b;
    });
    const costs = r2(sum(buckets, (b) => b.total)); const spendable = r2(inc - bonus); const left = r2(spendable + bonus + direct - costs);
    const into = (c) => r2(-(by[c] || 0)); const ldds = r2(-sum(mt.filter((t) => t.cat === 'LDDS'), (t) => t.amt));
    const la = into('Livret A'), pea = into('PEA & investments'), locked = into('Epsor (PEE / PERCOL)'); const savings = r2(la + ldds + pea + locked);
    const cur = r2(left - savings - direct); const total = r2(cur + la + ldds + pea + locked + direct);
    const directBy = { la: dv('la'), ld: dv('ld'), pea: dv('pea'), pee: dv('pee'), pc: dv('pc') }; const extra = {}; Object.keys(dBy).filter((k) => !KNOWN_D.includes(k) && dv(k)).forEach((k) => { extra[k] = dv(k); directBy[k] = dv(k); }); // other assets you added (gold, other investments...)
    return { key, n: m.n, income: { spendable, bonus: r2(bonus), direct, directBy, total: r2(spendable + bonus + direct) }, costs: { total: costs, buckets }, left, rate: spendable + bonus + direct > 0 ? left / (spendable + bonus + direct) : 0, rateExBonus: spendable + direct > 0 ? (left - bonus) / (spendable + direct) : 0,
      where: { cur, la: r2(la + directBy.la), ldds: r2(ldds + directBy.ld), pea: r2(pea + directBy.pea), locked: r2(locked + directBy.pee + directBy.pc), lockedPc: directBy.pc, extra, total, expected: left }, byCat: by };
  }
  // net worth, end = start + where it went + market gains. start/end = {cash, la, ld, pea, pee, pc, owed} balances; gains are the change in each savings or investment account not explained by money paid in.
  function bridge(start, end, st) {
    const w = st.where; const d = (k) => (end[k] || 0) - (start[k] || 0);
    const gains = { la: r2(d('la') - w.la), ld: r2(d('ld') - w.ldds), pea: r2(d('pea') - w.pea), locked: r2(d('pee') + d('pc') - w.locked) };
    const g = r2(sum(Object.values(gains), (x) => x)); const nw = (b) => sum(['cash', 'la', 'ld', 'pea', 'pee', 'pc'], (k) => b[k] || 0);
    const cashDrift = r2(d('cash') - w.cur); // how far the current accounts moved from what the statement says (0 when the cash check ties)
    return { start: r2(nw(start)), where: w.total, gains: g, gainsBy: gains, end: r2(nw(end)), cashDrift, gap: r2(nw(end) - (nw(start) + w.total + g)) };
  }
  // ---------- days away, from spending only ----------
  const BOOKING = /AIR FRANCE|TRANSAVIA|\bMEA\b|MIDDLE EAST|PEGASUS|TURKISH|RYANAIR|EASYJET|\bKLM\b|LUFTHANSA|VUELING|AJET|ROYAL JORDANIAN|AEGEAN|SKYSCANNER|KAYAK|OPODO|EDREAMS/i;
  const isoPlus = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  // A day is away when its purchases are in Spending in Lebanon or Trips and holidays (flight bookings do not count: you are not there that day) or paid in a foreign currency.
  // Gaps of up to two days inside a stay are filled. manual = { away: [[from,to]], home: [[from,to]] } corrects a stay by hand.
  function daysAway(txs, from, to, manual) {
    const hit = new Set(); const foreign = (t) => (t.cur && t.cur !== 'EUR') || /\b(USD|LBP)\b\s?[\d.,]+/.test(t.desc || '');
    for (const t of txs) { if (t.amt >= 0 || t.date < from || t.date > to) continue; if ((t.cat === 'Spending in Lebanon' || t.cat === 'Trips & holidays') ? !BOOKING.test(`${t.desc} ${(t.det || []).join(' ')}`) : foreign(t)) hit.add(t.date); }
    const days = []; for (let d = from; d <= to; d = isoPlus(d, 1)) days.push(d);
    const away = new Set(hit); const idx = days.map((d) => hit.has(d));
    for (let i = 0; i < days.length; i++) { if (idx[i]) continue; let j = i; while (j < days.length && !idx[j]) j++; const gap = j - i; if (i > 0 && j < days.length && gap <= 2) for (let k = i; k < j; k++) away.add(days[k]); i = j; }
    const inR = (d, rs) => (rs || []).some(([a, b]) => d >= a && d <= b);
    days.forEach((d) => { if (inR(d, (manual || {}).away)) away.add(d); if (inR(d, (manual || {}).home)) away.delete(d); });
    return { days, away, awayN: days.filter((d) => away.has(d)).length, parisN: days.filter((d) => !away.has(d)).length };
  }
  // ---------- usual month ----------
  const FLEXB = ['everyday', 'lifestyle', 'trips'];
  // Median of the last n closed months, per bucket and per category, without the bonus, flagged one-offs and day-to-day purchases made on days away.
  // months = [{ key, txs }]; oneoff = ids flagged as one-offs; awayOf(key) = Set of away dates.
  function usualMonth(months, n, oneoff, awayOf, trPea) {
    const pick = months.slice(-(n || 6)); const rows = pick.map((mo) => {
      const away = awayOf ? awayOf(mo.key) : new Set(); const keep = mo.txs.filter((t) => !(oneoff && oneoff[t.id]) && !(t.amt < 0 && away.has(t.date) && FLEXB.includes(bucket6Of(t.cat))));
      return statement(keep, mo.key, { trPea, bonus: 0 });
    });
    const cats = {}; rows.forEach((r) => r.costs.buckets.forEach((b) => b.cats.forEach((c) => { cats[c.cat] = 1; }))); rows.forEach((r) => Object.keys(r.byCat).forEach((c) => { if (bucket6Of(c)) cats[c] = 1; }));
    const catRows = Object.keys(cats).map((c) => ({ cat: c, bucket: bucket6Of(c), amt: r2(median(rows.map((r) => -(r.byCat[c] || 0)))) }));
    // Bonus is left out of money in: the usual spendable pay is the median of pay without it
    // the usual costs are the sum of the buckets, so every total equals the rows under it
    // a bucket's usual is the median of its monthly totals (a real month), not the sum of its category medians, which reads low for lumpy categories; the gap shows as Other under the bucket
    const bucketRows = BUCKET6.map(([id, name]) => ({ id, name, amt: r2(median(rows.map((r) => (r.costs.buckets.find((b) => b.id === id) || {}).total || 0))) }));
    // usual money in = usual pay + usual other income (refunds and the like), each its own median, so the total is the sum of its rows
    const othOf = (r) => r.byCat['Other income & refunds'] || 0; const other = r2(median(rows.map(othOf))), pay = r2(median(rows.map((r) => r.income.spendable - r.income.bonus - othOf(r))));
    return { n: pick.length, keys: pick.map((m) => m.key), pay, other, spendable: r2(pay + other), costs: r2(sum(bucketRows, (x) => x.amt)), buckets: bucketRows, cats: catRows };
  }
  // the plan's cost defaults: the usual month of each category, as a year
  const planSeed = (usual) => Object.fromEntries(usual.cats.filter((c) => c.amt > 0).map((c) => [c.cat, Math.round(c.amt * 12)]));
  // Spending money split over the day-to-day categories in proportion to the usual month; adds up to the budget
  function spendingSplit(budget, cats) {
    const tot = sum(cats, (c) => Math.max(0, c.amt)); if (!(budget > 0) || !(tot > 0)) return cats.map((c) => ({ cat: c.cat, amt: 0 }));
    const out = cats.map((c) => ({ cat: c.cat, amt: Math.round(Math.max(0, c.amt) / tot * budget) })); out[out.reduce((bi, x, i, a) => (x.amt > a[bi].amt ? i : bi), 0)].amt += Math.round(budget) - sum(out, (x) => x.amt); return out;
  }
  // ---------- watched lines, ratios and extra metrics (one month) ----------
  const WATCH_DEFAULT = ['groceries', 'eating', 'food', 'subs', 'other', 'friends', 'paul'];
  const FRIEND = /\b(LYDIA|PAYLIB|PAYPAL|VIR INST|VIREMENT INSTANTAN|WERO)\b/i;
  const DELIVERY = /UBER|BOLT|\bG7\b|TAXI|HEETCH|DELIVEROO|GLOVO|JUST EAT|FRICHTI/i;
  const cnt = (a) => a.length; const avg = (a, f) => (a.length ? r2(sum(a, f) / a.length) : 0);
  function watched(st, txs, key, ctx) {
    const c = ctx || {}; const mt = txs.filter((t) => t.month === key); const spend = (cat) => mt.filter((t) => t.cat === cat && t.amt < 0);
    const g = spend('Groceries'), e = spend('Eating out & cafés'), s = spend('Subscriptions'); const val = (a) => r2(-sum(a, (t) => t.amt)); const B = (id) => (st.costs.buckets.find((b) => b.id === id) || {}).total || 0;
    const food = r2(val(g) + val(e)); const day = r2(B('everyday') + B('lifestyle')); const other = -(st.byCat['Other spending'] || 0);
    const friends = r2(-sum(mt.filter((t) => FRIEND.test(`${t.desc} ${(t.det || []).join(' ')}`) && !['Paid for Paul', 'Support for parents', 'Between my accounts', 'Other own accounts'].includes(t.cat)), (t) => t.amt));
    const subNames = new Set(s.map((t) => merchant(t).toUpperCase()));
    return [
      { id: 'groceries', label: 'Groceries', value: val(g), sub: [{ label: 'Shop visits', value: cnt(g) }, { label: 'Average basket', value: avg(g, (t) => -t.amt) }] },
      { id: 'eating', label: 'Eating out', value: val(e), sub: [{ label: 'Times', value: cnt(e) }, { label: 'Average bill', value: avg(e, (t) => -t.amt) }] },
      { id: 'food', label: 'Food total', value: food, share: day > 0 ? food / day : null, shareOf: 'Everyday and Lifestyle' },
      { id: 'subs', label: 'Subscriptions', value: val(s), sub: [{ label: 'Count', value: subNames.size }, { label: 'Yearly cost', value: r2(val(s) * 12) }] },
      { id: 'other', label: 'Other spending', value: r2(other), share: st.costs.total > 0 ? other / st.costs.total : null, shareOf: 'all costs' },
      { id: 'friends', label: 'Friends, net', value: friends },
      { id: 'paul', label: 'Paid for Paul', value: r2(-(st.byCat['Paid for Paul'] || 0)), sub: [{ label: 'Owed after the period', value: c.paulOwed != null ? r2(c.paulOwed) : null }] },
    ];
  }
  const ratios = (st, nwParts, usualCosts) => ({
    homeShareOfPay: st.income.spendable > 0 ? (st.costs.buckets.find((b) => b.id === 'home').total) / st.income.spendable : null, rate: st.rate, rateExBonus: st.rateExBonus,
    shareInvested: nwParts && nwParts.total > 0 ? nwParts.invested / nwParts.total : null, emergencyMonths: nwParts && usualCosts > 0 ? nwParts.liquid / usualCosts : null,
  });
  function metrics(txs, key, away) {
    const mt = txs.filter((t) => t.month === key); const sp = mt.filter((t) => t.amt < 0 && bucket6Of(t.cat)); const small = sp.filter((t) => -t.amt < 5), deliv = sp.filter((t) => DELIVERY.test(`${t.desc} ${(t.det || []).join(' ')}`));
    const dayFlex = sp.filter((t) => ['everyday', 'lifestyle'].includes(bucket6Of(t.cat)) && !away.away.has(t.date)); const awaySp = sp.filter((t) => away.away.has(t.date) && FLEXB.includes(bucket6Of(t.cat)));
    const byCard = {}; sp.forEach((t) => { byCard[t.acct] = r2((byCard[t.acct] || 0) - t.amt); });
    return { daysParis: away.parisN, daysAway: away.awayN, everydayPerDayParis: away.parisN ? r2(-sum(dayFlex, (t) => t.amt) / away.parisN) : null, small: { n: cnt(small), total: r2(-sum(small, (t) => t.amt)) }, delivery: { n: cnt(deliv), total: r2(-sum(deliv, (t) => t.amt)) },
      costPerDayAway: away.awayN ? r2(-sum(awaySp, (t) => t.amt) / away.awayN) : null, byCard, largest: sp.slice().sort((a, b) => a.amt - b.amt).slice(0, 5).map((t) => ({ id: t.id, date: t.date, desc: merchant(t), cat: t.cat, amt: r2(-t.amt) })) };
  }
  // subscriptions started and stopped: merchants in Subscriptions this month that were not there last month, and the other way round
  function subsChange(txs, key) {
    const names = (k) => new Set(txs.filter((t) => t.month === k && t.cat === 'Subscriptions' && t.amt < 0).map((t) => merchant(t).toUpperCase())); const a = names(key), b = names(addMonths(key, -1));
    return { started: [...a].filter((x) => !b.has(x)), stopped: [...b].filter((x) => !a.has(x)) };
  }
  // Paul: what he owes after a date = the balance on its as-of date + every payment to him after it - every transfer received from him after it
  const paulOwed = (base, asOf, txs, upTo) => { const l = txs.filter((t) => t.cat === 'Paid for Paul' && t.date > (asOf || '') && (!upTo || t.date <= upTo)); return r2((+base || 0) - sum(l, (t) => t.amt)); };

  // ---------- day by day (for the Today chart, the Month strip and like-for-like comparisons) ----------
  const dayIdx = (from, d) => Math.round((Date.parse(d) - Date.parse(from)) / 86400000);
  const dayAdd = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  // amounts per day, from "from" for len days; pick(t) gives the amount of one line
  const dayArr = (txs, from, len, pick) => { const a = new Array(len).fill(0); txs.forEach((t) => { const i = dayIdx(from, t.date); if (i >= 0 && i < len) a[i] += pick(t); }); return a; };
  // day-to-day spending per day of a cycle, on the same lines and rules as statement(): Everyday, Lifestyle and Trips buckets, the PEA part of the Trade Republic transfer left out; a line dated outside the cycle sits on its first or last day
  const FLEX_DAY = ['everyday', 'lifestyle', 'trips'];
  function flexDays(txs, key, from, len, trPea, skip) {
    const a = new Array(len).fill(0); let peaTaken = 0;
    txs.filter((t) => t.month === key).forEach((t) => {
      if (skip && skip(t)) return;
      let amt = t.amt;
      if (t.cat === 'Spent via Trade Republic' && t.amt < 0) { const take = Math.max(0, Math.min(-t.amt, (trPea || 0) - peaTaken)); peaTaken += take; amt = t.amt + take; }
      if (!FLEX_DAY.includes(bucket6Of(t.cat))) return;
      const i = Math.max(0, Math.min(len - 1, dayIdx(from, t.date))); a[i] += -amt;
    });
    return a;
  }
  const cumul = (a, upTo) => { let s = 0; return a.map((v, i) => (upTo != null && i > upTo ? null : (s += v))); };
  // the median of several running totals, day by day (a curve shorter than len keeps its last value)
  const medCurve = (curves, len) => Array.from({ length: len }, (_, i) => (curves.length ? median(curves.map((c) => c[Math.min(i, c.length - 1)])) : null));
  const Core = { setBucket6, dayIdx, dayAdd, dayArr, flexDays, cumul, medCurve, savingsHistory, netPay, netPayCalc, effRecurring, monthlyEq, recurringPart, planBills, planCosts, defaults, mergeSettings, fixedEverydayBudget, parseCSV, csvToTx, CATS, GROUPS, RULES, TOPUPS, catGroup, classify, categorise, suggestKeyword, merchant, budgetMonth, monthRange, allTransactions, monthSummary, detectRecurring, incomeTax, bareme, marginalRate, budgetFor, addMonths, ymKey, monthLabel, BUCKET6, BUCKET6_OF, bucket6Of, statement, bridge, daysAway, usualMonth, planSeed, spendingSplit, WATCH_DEFAULT, watched, ratios, metrics, subsChange, paulOwed, median, fmtDate, titleCase, r2, sum, hash, MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);

