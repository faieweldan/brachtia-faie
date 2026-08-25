# Redesign "What's Included in Your Stay" section on property page

Replace the current two-card "What's included / Not included" layout below Facilities & Amenities with a single, clean "What's Included in Your Stay" section, matching the reference style: a minimal list with icons, included items plain and excluded items struck through.

## Changes

1. **Section title and structure**
   - Remove the existing `sm:grid-cols-2` card pair in `src/routes/properties.$slug.index.tsx`.
   - Add a new section titled **"What's Included in Your Stay"** directly under Facilities & amenities.
   - Render one combined list from `property.included` and `property.excluded`.

2. **Item styling**
   - Each item shows a small icon on the left.
   - **Included** items: normal text, icon in `text-brand`.
   - **Not included** items: text with a strikethrough line, icon in `text-muted-foreground`.
   - Layout: two-column grid on desktop (`sm:grid-cols-2`), single column on mobile.
   - Use the existing semantic tokens (`text-foreground`, `text-muted-foreground`, `border`, `text-brand`) and keep the rounded, card-free list style from the reference.

3. **Icons**
   - Use `Check` for included items and a slash/ban-style icon for excluded items (e.g. `X` or `Ban` from `lucide-react`).
   - Remove the `Check` and `X` imports if they are no longer used elsewhere after this change.

4. **Data**
   - No data model changes; continue using `property.included` and `property.excluded`.

## Out of scope
- No changes to the Facilities & amenities section above it.
- No changes to room cards, pricing tables, sidebar, or CTA band.
