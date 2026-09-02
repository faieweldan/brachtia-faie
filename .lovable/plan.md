# Fix: advance rental ignores the admin "Advance months" setting

## What's wrong

The residence config for The Arc (and Solstice) has **Advance months = 2** for both 12-month and short-term stays, but the calculator never reads that value. Instead it derives the advance amount from the selected payment frequency: bi-monthly covers 2 months total, so after the pro-rated first month only **1** month of advance rent is charged — which is what the quote shows.

## The fix

Advance rental is driven by the admin setting, not the payment frequency:

- Line 1 stays: first month rent (pro-rated by move-in date).
- Line 2 becomes: **Advance rental (2 months)** = 2 x monthly rent, using the residence's configured `advanceMonths` for the applicable contract term (capped at the remaining months of the stay).
- Deposits, admin fees and the rest of the upfront table are unchanged.
- Payment frequency (bi-monthly / quarterly / full term) keeps doing what it does today for the ongoing rent schedule and the "then RM x/month" line; for a full-term selection the whole remaining rent is still collected upfront (so it takes precedence over the advance-months figure when it is larger).

Both the on-page calculator and the downloaded quote PDF pick this up automatically, since they share the same quote calculation.

## Technical notes

- `src/data/properties.ts`, `stayQuote()`: replace the `covered` derivation with `covered = min(schedule.length, 1 + cfg.advanceMonths)`, and keep the full-term branch as `schedule.length`. Label uses `formatMonths(advanceSegments.length)`.
- No database or admin UI changes needed — the values are already stored correctly.
