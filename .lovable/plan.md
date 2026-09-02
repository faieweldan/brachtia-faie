# Admin-configurable add-ons per residence

Today the optional extras (Single / Queen / King bedding sets, RM250 / RM300 / RM350 and their contents) are fixed in the codebase. The only admin control is **Terms & fees → Single bed options**, which decides which of the three fixed sets appear. This replaces that with a real add-ons editor, per residence.

## What changes for the admin

In **Terms & fees** on the residence editor, a new **Optional add-ons** block: a compact table where each row is one add-on.

Per add-on:
- Name (e.g. "Queen Bedding Set")
- Price (RM)
- Charge type: One-time or Monthly
- What's included: short list of lines shown under the name on the site
- Offered for: Single only / Twin only / Both occupancies
- Visible toggle, plus reorder and delete

"Add add-on" appends an empty row. Everything saves with the single sticky "Save changes" bar, like the rest of the page.

The existing "Single bed options" field stays (it describes the bed configuration on the public page) but no longer controls which bedding sets are offered — the add-ons list does.

## What changes for the student

The calculator's "Optional bedding set" block becomes **Optional add-ons**, rendering the residence's own list, filtered by the selected occupancy. Selection behaviour changes slightly: instead of one-of-three, each add-on is independently selectable (a student could take bedding and another extra). One-time add-ons appear as one-time lines in the "due before move-in" list; monthly ones are added to the recurring instalment. Selected add-ons flow through to the enquiry record and the PDF quote exactly as the bedding line does now.

If a residence has no add-ons configured, the block simply doesn't render.

## Migration of existing data

The three current bedding sets are written into both residences as add-ons with their current prices and contents, respecting today's rules (twin → Single set only; single → the sets matching that residence's bed options). Nothing changes on the live site on day one.

## Technical notes

- Migration: add `addons jsonb not null default '[]'` to `public.residences`; existing grants/policies cover it. A data statement seeds the current bedding sets per residence.
- `src/data/properties.ts`: add `Addon = { id, label, price, chargeType: "onetime" | "monthly", items: string[], occupancies: Occupancy[], active: boolean }` and `Property.addons`. Replace `beddingOptionsFor` with `addonsFor(property, occupancy)`; keep `BEDDING_SETS` only as the seed source, then remove it.
- `stayQuote` gains a `selectedAddons: Addon[]` parameter: one-time entries append to the due-now list, monthly entries add to the monthly rent used for the schedule and instalment.
- `src/lib/site-mappers.ts`: map `addons` in `rowToProperty` / `propertyToRow`.
- `src/routes/admin.website.residences.$id.tsx`: new `AddonsEditor` rows inside the Terms & fees `Section`, driven by the existing `set()` form state.
- `src/components/site/StayCalculator.tsx`: state becomes a set of selected add-on ids; existing card styling reused.
- `src/lib/quote-pdf.ts` and `src/lib/public.functions.ts` already pass an `addons` string list — extend it to carry each selected add-on's label and price.
