# Pricing calculator: 6-month short-term cutoff

## What changes

- A stay of **6 months or less** uses the short-term rate. Anything **longer than 6 months** uses the 12-month rate.
- Today the switch happens at 11 months and 15 days, so stays of 7-11 months are wrongly priced at the short-term rate.
- The rule is fixed site-wide (no admin toggle), as chosen.
- No change to admin & agreement charges — that value is already editable per residence under Website → Residences → Terms & fees → Admin fee (RM), for both the 12-month and short-term columns.

## Where it shows up

The same rule drives the room price table, the room detail popup, the stay calculator, the enquiry summary and the downloaded quotation, because they all derive the term from the selected move-in/move-out dates.

## Technical notes

- `termForRange()` in `src/data/properties.ts`: replace the 11-months-plus-15-days threshold with a 6-month one — `move-out > move-in + 6 months` returns `"long"`, otherwise `"short"`. Update the comment accordingly.
- No other call sites change; `termForRange` is consumed by `StayCalculator.tsx` and `properties.$slug.index.tsx`.
- No database migration and no fee changes.
