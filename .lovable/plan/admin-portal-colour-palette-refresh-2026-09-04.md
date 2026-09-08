# Admin portal: colour palette refresh

Step one of a section-by-section admin redesign. This pass changes only colour, surface and border values — no layout, copy or logic changes. The public site is untouched.

## The palette (Soft Green Gradient)

- **Canvas: white.** Content sits on plain white, not a grey wash.
- **Deep green `#0B3A2E` → emerald `#3FB68B`** as a gradient, used on the sidebar rail and primary buttons; solid deep green for headings and active states, emerald for positive/chart accents.
- **Light grey `#F7F8F9`** for secondary surfaces: table header rows, hover states, inset panels.
- **Light beige `#F1EBE1`** as a sparing warm accent: badges, selected chips, subtle highlight blocks.
- **Hairline borders** in a light neutral, so separation comes from thin lines and whitespace rather than heavy shadows.

## Look and feel

- **Sidebar: solid dark green rail** (subtle vertical gradient), white text, active item as a lighter translucent block — the reference's anchored left rail, white content area.
- Mobile top nav picks up the same dark green treatment.
- One green for action, grey for structure, beige for gentle emphasis — so nothing competes for attention.

## Scope of this pass

Sidebar and mobile nav, dashboard cards, appointments (list, calendar, settings), bookings, website/residences list and editor, the unlock screen, and shared admin field/uploader components.

Not in this pass (later sections): spacing, layout, table structure, navigation reorganisation, per-screen polish.

## Technical notes

- Add an admin-scoped token override block in `src/styles.css` under `.admin-ui`, remapping `--background`, `--card`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--secondary`, `--primary`, `--ring`, `--brand`, `--brand-deep`, `--brand-tint`, plus new `--admin-gradient` and sidebar tokens. All values in `oklch`. Existing utilities (`bg-muted`, `bg-card`, `border-border`, `bg-brand-tint`) then pick up the new palette without touching most component files.
- `.admin-ui` is already on the admin layout root (`src/routes/admin.tsx`) and the unlock screen, so scoping is in place; the public site keeps its tokens.
- `src/routes/admin.tsx`: sidebar and mobile header switch to the dark green gradient surface with light foreground/active classes; page wash `bg-muted/30` becomes white.
- Adjust the few hardcoded shades that fight the new palette (e.g. `bg-muted/40` table headers in the residence editor, `bg-muted` chips in bookings/appointments) to the semantic tokens.
- Verify with a typecheck and screenshots of each admin route at desktop and mobile widths.
