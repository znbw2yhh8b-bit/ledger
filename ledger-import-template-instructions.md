# Ledger CSV import: instructions for the AI filling the template

Convert my bank exports into ONE CSV with exactly this header (comma-separated, UTF-8, no extra columns):

date,account,amount,description,currency,balance,category,id

| Column | Rule |
|---|---|
| date | Booking date, YYYY-MM-DD |
| account | One of: sg (SG current), rev (Revolut), fo (Fortuneo), tr (Trade Republic cash), la (Livret A), ld (LDDS), pea (PEA), other (CTO), pee (Epsor PEE), pc (Epsor PERCOL) |
| amount | Signed number, dot as decimal, no currency sign, no thousands separator. Money out negative, money in positive |
| description | The bank's original label, unchanged (rules match on it). Remove line breaks and commas or wrap the field in double quotes |
| currency | EUR, or USD for dollar accounts |
| balance | The account balance AFTER this line. Fill it at least on the LAST line of each account for the period (the app checks it). Leave blank elsewhere if unknown |
| category | Leave blank (the app applies my rules). Fill only if the bank gives no useful label |
| id | The bank's transaction reference if there is one, otherwise blank |

Also:
- One row per transaction. Keep transfers between my own accounts on BOTH sides (out of one, into the other); the app pairs them.
- If an account had no transactions but you know its closing balance, add one row: amount 0, description "Closing balance", balance filled.
- Do not merge, total or round lines. Do not invent lines.
- Sort by account, then date.
