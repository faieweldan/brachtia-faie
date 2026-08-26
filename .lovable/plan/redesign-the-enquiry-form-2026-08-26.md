# Redesign the enquiry form

## What's broken

The phone row puts a native dropdown next to the number field. The dropdown renders the full label ("+60 · Malaysia") inside a fixed narrow width, so its text overflows and shoves the number input past the edge of the dialog — that's the cut-off you're seeing. Nationality is also a plain native dropdown with ~150 countries and no typing, so finding a country means scrolling forever.

## The fix

**Phone field**
- One joined control: a compact country-code button (flag + dial code only, e.g. "🇲🇾 +60") fused to the number input as a single bordered field, so nothing can overflow.
- Tapping the code opens a searchable list (type "mala" or "60" to filter) with the full country name shown inside the list, not in the button.
- Number input strips non-digits and gets a live-format hint; validation checks the combined value.

**Nationality**
- Same searchable pattern: a button that opens a type-to-filter country list. Malaysia, China, India, Indonesia, Bangladesh, Pakistan and Nigeria pinned to the top as common picks.

**Form layout — rebuilt for conversion**

Currently everything is one long two-column wall of eight fields. New structure inside the same dialog:

```text
Check availability
Reply within 24 hours · free, no payment yet

┌ YOUR STAY ─────────────────────────────┐
│ Residence · Room · Occupancy · Dates   │  compact summary chips,
│ RM x,xxx first payment · RM xxx/month  │  "Edit" reveals the pickers
└────────────────────────────────────────┘   (pickers auto-open if empty)

YOUR DETAILS
Full name              [------------------]
Email                  [------------------]
Mobile / WhatsApp      [🇲🇾 +60 |  number ]

STUDY DETAILS
University    Intake
Nationality   Gender

Anything else? (optional)

[ Submit enquiry ]
Availability confirmed within 24 hours · quotation available right after
```

- Stay details collapse to a read-only summary when already chosen in the calculator, so returning users see 7 fields instead of 11.
- Two clear labelled groups (contact first, study second) instead of one undifferentiated grid.
- Consistent control height and rounding across every field; errors shown inline under the field and the first invalid field is scrolled to and focused on submit.
- Dialog widened slightly on desktop with a sticky submit button at the bottom so the CTA is always visible while scrolling.
- Success state unchanged in function (PDF quotation + WhatsApp), tidied to match the new spacing.

## Technical notes

- Reuse existing shadcn `Popover` + `Command` for both searchable pickers; extract a shared `CountryCombobox` so nationality and dial code share one list.
- Move the `COUNTRIES` array out of `EnquiryDialog.tsx` into `src/data/countries.ts` and add ISO codes for flag emojis.
- Hidden inputs keep the current FormData + zod submit flow intact; no change to `stayQuote`, `downloadStayQuote`, or the residence page wiring.
- Files touched: `src/components/site/EnquiryDialog.tsx`, new `src/components/site/CountryCombobox.tsx`, new `src/data/countries.ts`.
