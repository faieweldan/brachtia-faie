# Admin portal: colour palette refresh

Step one of a section-by-section admin redesign. This pass changes only colour, surface and border values — no layout, copy or logic changes. The public site is untouched.

## The new palette

- **Background: white.** The admin canvas becomes plain white instead of the current grey wash, so content panels read as content, not as cards floating on grey.
- **Dark green (brand) for intent.** Used for the active nav item, headings, primary buttons, focus rings and selected states. One green, used sparingly, so the eye always knows where the action is.
- **Light beige as the only accent.** Soft warm tints replace grey for hover states, table header rows, subtle panel fills, badges and the sidebar background. Beige carries "quiet surface"; green carries "this matters".
- **Hairline borders** in a warm light tone, so separation comes from thin lines and whitespace rather than heavy rounded boxes and shadows.
- Text: near-black warm neutral for body, muted warm grey for secondary labels — improving contrast against white.

Net effect: a calm white workspace, green only where you can act, beige only where things are grouped. Less colour noise, less to scan.

## Scope of this pass

Applies everywhere inside the admin portal: sidebar and mobile nav bar, dashboard cards, appointments (list, calendar, settings), bookings, website/residences list and editor, the unlock screen, and shared admin field/uploader components.

Not in this pass (coming in later sections): spacing, layout, table structure, navigation reorganisation, component-by-component polish.

## Technical notes

- Define an admin-scoped token override block in `src/styles.css` under `.admin-ui` — remapping `--background`, `--card`, `--muted`, `--muted-foreground`, `--accent`, `--border`, `--input`, `--secondary`, `--primary`, `--ring`, plus the beige tint values — so every existing semantic utility (`bg-muted`, `bg-card`, `border-border`, `bg-brand-tint`) picks up the new palette without touching component files. All values in `oklch`, matching the existing convention.
- The `.admin-ui` class is already on the admin layout root (`src/routes/admin.tsx`) and the unlock screen, so scoping is already in place; the public site keeps its current tokens.
- Where components hardcode a shade that fights the new palette (e.g. `bg-muted/30` page wash on `src/routes/admin.tsx`, `bg-muted/40` table headers), adjust those few class usages to the semantic token instead.
- Verify with a typecheck and screenshots of each admin route at desktop and mobile widths.
