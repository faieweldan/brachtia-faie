# Restructure property amenities into 3 collapsible sections

Replace the current "Facilities & amenities" and the two "What's included / Not included" cards on the property detail page with three clean, icon-led sections: Building Facilities & Amenities, Included in Your Stay, and Inside Your Apartment. Match the reference style (minimal two-column list with icons, plus a small dropdown arrow to expand long sections).

## Changes

### 1. Data model update (`src/data/properties.ts`)
- Replace the flat `facilities`, `included`, and `excluded` arrays on `Property` with three typed arrays:
  - `buildingFacilities: string[]`
  - `includedInStay: string[]`
  - `insideApartment: string[]`
- Update both properties (`The Arc` and `Solstice Residence`) with the exact copy provided by the user.
- Add a short `utilitiesNote: string` field for the "Water and electricity are billed separately..." line under Included in Your Stay.
- Add an optional `footnote?: string` field for the "*Where available." note under Inside Your Apartment.

### 2. New reusable component (`src/components/site/AmenitySection.tsx`)
- Accept `title`, `items`, optional `note`, optional `footnote`, and optional `defaultOpen` props.
- Render the title with a small chevron icon on the right.
- Render items in a two-column grid on desktop (`sm:grid-cols-2`) and single column on mobile.
- Each item: a small icon on the left + label.
- Use `Check` icon for "Included in Your Stay" and "Inside Your Apartment" items.
- Use matching facility icons for "Building Facilities & Amenities" via `facilityIcon()`.
- Add a collapsible wrapper: when items exceed a threshold (e.g. 6), show a "Show more" / "Show less" toggle with the chevron.
- Use existing semantic tokens (`text-foreground`, `text-muted-foreground`, `border`, `text-brand`, `text-brand-deep`).

### 3. Property detail page (`src/routes/properties.$slug.index.tsx`)
- Remove the old "Facilities & amenities" block and the two "What's included / Not included" cards.
- Insert the three new `AmenitySection` instances in order:
  1. Building Facilities & Amenities
  2. Included in Your Stay
  3. Inside Your Apartment
- Remove now-unused imports (`Check`, `X`, `facilityIcon` if no longer used directly here).

### 4. Styling
- Keep the card-free, clean list style from the reference image.
- Use the current green brand palette and Plus Jakarta Sans typography.
- Ensure adequate spacing between the three sections.

## Out of scope
- No changes to room cards, pricing tables, sidebar, gallery, or CTA band.
- No changes to other routes.
