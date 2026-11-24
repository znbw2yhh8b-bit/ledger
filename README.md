# Ledger

A personal finance app for one person, built for the iPad. Plain static files: HTML, CSS and JavaScript. Nothing to install and no build step. It works from any web host.

## Run it

1. Put this folder on any static host. For example, drag it onto Netlify Drop, or use GitHub Pages or Cloudflare Pages. It needs a real `https://` address: opening `index.html` straight from the Files app does not work on iPad.
2. Open the address in Safari on the iPad, tap **Share > Add to Home Screen**, then always open the app from that icon. It runs full-screen, and its data belongs to the Home Screen app, not to Safari tabs.
3. **Settings > Your data > Import data**: choose the `ledger-backup-YYYY-MM-DD.json` exported from the Claude version.

## Files

| File | What it holds |
|---|---|
| `index.html` | Loader: head, manifest, icons, script tags in dependency order |
| `config.js` | Storage choice: empty = this iPad only; Supabase url + anonKey = your Supabase project |
| `storage.js` | **The only code that touches storage.** `Store.init / get / set / list / remove`, two backends (local IndexedDB, Supabase) |
| `core.js` | Shared helpers, statement maths, categories, buckets, pay cycle |
| `model.js` | The engine: forecast (first column = rest of this year, then 5 full years; PEA block bootstrap on MSCI World EUR history), settings defaults and migration |
| `app-shell.js` | Routing, navigation, page header, persistence (calls `Store`), shared components |
| `app-now.js` | Current cycle, quick add, Apple Pay helpers |
| `app-report.js` | Month report, Transactions |
| `app-wealth.js`, `app-wealth2.js` | Wealth page |
| `app-plan.js` | The one forecast run (`fcRun`), goals |
| `app-time.js`, `app-overtime.js` | Over time (Actuals, Forecast) |
| `app-assume.js` | Assumptions (income, costs, savings order, returns, inflation) |
| `app-update.js` | Update page: add files, month-close checklist, reconciliation |
| `app-settings.js` | Settings, Apple Pay log reader |
| `app-events.js` | Click and input handlers |
| `app-files.js` | File readers (Ledger CSV template, Trade Republic, Revolut, SG CSV), export and import, startup |
| `styles.css` | The one stylesheet (light and dark) |
| `manifest.webmanifest`, `icons/` | Home Screen app |
| `vendor/supabase.js` | Supabase client v2.119.0, loaded only when `config.js` names a Supabase project |

## Storage keys

Each key holds one JSON value.

| Key | Holds |
|---|---|
| `model` | Settings, accounts and balances, assumptions, savings order, goals, Paul, pay, payslip, PEA holdings and trades, `lastExport` |
| `rules` | `{ list: [[keyword, category, account], ...] }`: your category rules |
| `overrides` | `{ map: {lineId: category}, oneoff: {lineId: true}, reviewed: {cycle: date} }`: category fixes, one-offs, closed cycles |
| `snapshots` | `{ points: {date: {account: balance}}, auto }`: balances recorded at each close (history) |
| `tax` | Earlier tax-file records, kept for history (the page is gone) |
| `model-backup-2026-11b` | One-time copy of the model before the v7 assumptions conversion |
| `stmts/<id>` | One imported bank file: `{ id, account, acctKey, role, from, to, opening, closing, tx: [{ id, date, desc, amt, acct, cat0? }] }` |
| `live/<id>` | One Apple Pay or quick entry: `{ id, date, amt, merchant, cat, card, src }` |

When it opens for the first time on a device, the app also reads `localStorage['ledger.v3']` (and the older `ledger.v1`), if present, and moves them into the store.

## Backup file (Export all data)

`ledger-backup-YYYY-MM-DD.json`:

```json
{
  "app": "ledger",
  "schemaVersion": 1,
  "exportedAt": "2026-11-15T11:00:00.000Z",
  "model": { },
  "rules": { "list": [] },
  "overrides": { "map": {}, "oneoff": {}, "reviewed": {} },
  "snapshots": { "points": {} },
  "tax": { },
  "stmts": { "<id>": { } },
  "live": { "<id>": { } }
}
```

Import accepts this format and the older "Download a backup" format (`v: 3`, with `cfg`). It shows counts and the date range, then replaces everything after you confirm.

On iPad, Export opens the share sheet: choose **Save to Files > iCloud Drive**. The month-close checklist reminds you when your last export is older than the cycle you are closing.

## Monthly close from bank CSVs

The simplest path is the **Ledger CSV template**: one file for all banks, header

```
date,account,amount,description,currency,balance,category,id
```

- **Accounts:** `sg`, `rev`, `fo`, `tr`, `la`, `ld` become statements. `pea`, `other`, `pee`, `pc` and any account key of yours only update the balance, taken from the last row with a balance.
- **Duplicates:** lines already imported are skipped, matched by id, or by date + amount + description.
- **Categories:** your rules apply, and a filled `category` overrides them. Lines still "To classify" are listed in the close checklist. Classifying one offers "Always file … as …", which saves a new rule.
- **Transfers** between your own accounts are filed as "Between my accounts" by the rules.
- **Balance check:** the file's last balance minus its lines must equal the previous statement's closing. A gap is shown before you save.

### Closing a cycle

A cycle runs from the 23rd to the 22nd and is named by its end month (Nov26 = 23 Oct to 22 Nov). From the 23rd, the app is in the next cycle (Dec26C) and Nov26 waits to be closed on **Update**:

1. **Add statements ending 22 Nov** for SG, Revolut and Trade Republic, cut at the 22nd. An SG statement that stops on the Friday or Saturday before a weekend 22nd counts (banks post nothing at weekends).
2. **Every line has a category.**
3. **Reconcile balances** (Wealth > Reconcile): each account's balance at the previous cycle end plus its own lines must give its statement balance at this cycle end. Fix a gap on one account (a missing or wrong line), then book what is left (cents, interest) with **Book**.
4. **Type your balances** (PEA and the other market values).
5. **Close Nov26A.** Once a cycle has ended it shows as an actual column on Wealth and Over time; until you close it, its Wealth header says "to close".

During the cycle, Wealth's current column (Dec26C) and its headline move with the month: for current accounts, Livret A and LDDS each account takes the newer of its last statement balance and the balance you typed, then adds the lines and Apple Pay entries dated after it. Market-valued accounts (PEA, PEE, PERCOL) start from the value you typed and add what was paid in after that day: transfers into the PEA, Epsor payments, and income you added on Month straight to an account (participation, abondement). The same carry applies at each cycle end, so a check-in typed mid-cycle no longer turns a later payment into a market loss.

Mid-cycle uploads are checked as they come in: Reconcile shows "Dec26C so far" for each account whose file carries a balance (the template's `balance` column, Revolut's CSV): its balance at the last cycle end plus its lines must give the file's last balance. A gap there means a line is missing or doubled; booking waits for the cycle end. An SG CSV export has no balance, so fill the template's `balance` column to have SG checked mid-cycle.

The bank-specific readers still work: Trade Republic export (cash and PEA), Revolut consolidated statement, SG CSV, plus a column matcher for anything else.

## Apple Pay log

The iPhone automation appends lines to `iCloud Drive/Shortcuts/Ledger/ApplePay.txt`:

```
2026-11-06 12:31 | 4,50 € | Monoprix | SG Visa
```

On the iPad, tap **Update from Apple Pay log** (Month or Update) and pick the file. Only lines not already imported are added, and the count is shown.

## Switching storage to Supabase

1. Create a Supabase project. Then in **Authentication > Users > Add user**, create yourself with an email and a password.
2. In the SQL editor, run:

```sql
create table public.ledger_kv (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.ledger_kv enable row level security;
create policy "own rows" on public.ledger_kv
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

3. In `config.js`, set `url` and `anonKey` from **Project settings > API**. The anon key is meant to be public: row level security keeps the rows yours.
4. Open the app, sign in, then **Settings > Import data** with your latest export. Data is not copied from the iPad automatically.

The app then saves every change to Supabase and reloads changes from other devices each time you come back to it. If two devices edit the same thing at once, the last save wins.

**Another backend:** write an object with `init`, `get`, `set`, `list` and `remove` in `storage.js`, and pick it in the `Store` line at the bottom. No page needs to change.

## Changes in v11.4

- PEA, PEE and PERCOL follow the money paid in: a typed value is carried to the cycle end (and to today) with the payments made after it, so only real market moves show as gain or loss.

## Changes in v11.3

- Wealth today moves with the month: statements and Apple Pay entries after your last check-in update current accounts, Livret A and LDDS, in the current column, the headline and the split.
- Reconcile checks files uploaded mid-cycle ("Dec26C so far"), each at its own last balance.

## Changes in v11.2

- The current cycle follows the pay cycle: from the 23rd, Nov26 has ended and moves to the actual columns on Wealth and Over time; Dec26C is the current column.
- An SG statement that stops on a weekend before the 22nd now covers the cycle (it blocked Nov26, whose statement ends on Saturday 21 Nov).
- Wealth actual columns take each account's balance at the cycle end from its statements first (before check-ins typed during the month); Livret A and LDDS from the SG transfers; an account whose first file starts later counts as not open yet.
- Reconcile on Wealth: only ended cycles, one open table per group with each account's start, lines, expected and statement balance, the source of each figure, and the part of the difference no account explains.
- Close step 3 is that Reconcile; its button opens it.
- A Revolut or Trade Republic line from "M. Charbel Alhelou" is a move between current accounts, not Livret A (a Livret A at SG only pays to the SG current account).

## Removed in this version

- Tax file page, with its document storage, AI document check and zip download. Its saved records stay in the `tax` key and in exports.
- Claude account sync, Claude downloads, the Resources PDFs, and the PDF statement and payslip readers.
- Alpha Vantage: no code called it any more. The last mention is gone.
