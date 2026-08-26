# Website tab → Residences editor in Admin

Add a new top-level **Website** tab to the admin portal, with **Residences** as its first sub-tab. From there admin can edit everything the public residence pages show — residence content, room types, and pricing — and the public site renders the saved values.

## Navigation

- Sidebar gets a "Website" item (Dashboard, Appointment Manager, Bookings, Website).
- Selecting Website shows a sub-tab row: **Residences** (only one for now, built so more sub-tabs like Homepage or Contact can be added later).
- On mobile, the same items appear in the existing scrollable top bar.

## Residences editor

**List view** — all residences with name, location, published toggle, room count, and an Edit button. Add a new residence, or archive (unpublish) one.

**Edit view** — sections, each saved with an explicit Save button:

1. **Basics** — name, slug, location, tagline, summary, description paragraphs, published toggle, sort order.
2. **Photos** — hero image URL + gallery list (add / remove / reorder). Image URLs for now; upload can come later.
3. **Facilities** — the three lists (Building facilities, Included in your stay, Inside your apartment) as editable line items, plus the utilities note and apartment footnote.
4. **Location** — map coordinates, Waze link, nearby universities and points of interest (name, distance, walk/drive time).
5. **Terms & fees** — payment cycle, contract terms offered, terms list, and the fee config (booking fee, deposits, access card, admin fee, add-on prices such as car park and bedding sets).
6. **Room types** — a table of rooms with add/edit/delete. Per room: name, room code/tag, unit type, description, size, bathroom (ensuite/shared), view, bed setup, features, furnishing, images, visible-on-site toggle, sort order, and the four rates (12-month single/twin, short-term single/twin — blank means not offered).

Everything writes to the existing database tables, and the public pages already read from those tables, so changes appear on the live site after saving.

## Technical notes

- Route files: `src/routes/admin.website.tsx` (sub-tab shell with `<Outlet />`), `src/routes/admin.website.residences.index.tsx` (list), `src/routes/admin.website.residences.$id.tsx` (editor). `admin.website.index.tsx` redirects to the residences sub-tab.
- Server functions already exist in `src/lib/admin.functions.ts`: `listResidences`, `saveResidence`, `deleteResidence`, `saveRoomType`, `deleteRoomType`. No new backend or migration needed.
- Field shape follows `src/lib/site-mappers.ts` (`propertyToRow` / `roomTypeToRow`) so saved rows map cleanly back to the public `Property` / `RoomType` types.
- Data fetched with TanStack Query (`["admin","residences"]`), invalidated on save; toasts via sonner, matching `admin.bookings.tsx`.
- JSON-ish fields (lists, nearby places, fees, rates) get proper repeating-row form controls rather than raw JSON textareas.
- Public pages load site data through the root loader, so after an edit the admin sees the change on next page load of the public site.
