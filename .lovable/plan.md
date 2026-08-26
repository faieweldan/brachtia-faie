# Booking page + Admin portal

Two connected pieces: a real viewing-booking flow on the public site, and a private admin portal at `/admin` for appointments, enquiries and residence content. This needs a backend, so Lovable Cloud gets enabled (database, login, file storage for photos).

## 1. Book a Viewing page (public)

Replaces the current simple form at `/book-viewing` with a two-panel scheduler like the reference:

```text
+------------------+--------------------------------------------+
|  Select Date     |  Select Time        (30 min)      < >      |
|  [ month cal ]   |  Thu Aug 27 | Fri Aug 28 | Sat Aug 29       |
|  MYT             |  10:00AM    | 1:15PM     | 10:15AM          |
|                  |  10:30AM    | 1:30PM     | 1:15PM           |
+------------------+--------------------------------------------+
```

- Step 1: residence + visit type — **In person** or **Virtual tour** (video call) — as two clear cards.
- Step 2: date calendar (past/unavailable days greyed out) with the next 3 bookable days of slots beside it.
- Step 3: short details form (name, email, mobile with country code, university, notes) reusing the enquiry form styling.
- Confirmation screen: date, time (MYT), visit type, residence, plus a WhatsApp button.
- Slots come from the admin's weekly availability; already-booked slots disappear. Virtual tours can have their own availability if the admin wants.
- Mobile: calendar on top, slots stacked below.

## 2. Admin portal at `/admin` (not linked anywhere public)

Single admin account (no public signup, no signup link). Sign in at `/admin/login`; everything else is behind that gate. Clean sidebar layout, neutral and minimal — white surfaces, one accent, plenty of space, no marketing styling.

### Appointment Manager
- **Calendar / list view** of all appointments with status (Pending, Confirmed, Completed, Cancelled, No-show) and filters by date range, residence, type.
- **Appointment types**: Viewing (in person), Viewing (virtual), Check-in, Check-out, plus admin-defined custom types with their own colour and duration.
- **Availability settings**: weekly schedule per residence (e.g. Mon–Sat 10:00–18:00), slot length (15/30/45/60 min), buffer between slots, max bookings per slot, and a date-blocking list for holidays/one-offs. Live preview of generated slots.
- Detail drawer per appointment: student details, notes, change status, reschedule, add internal note.

### Bookings (enquiries)
- Table of every enquiry submitted from the residence pages: student details, residence, room type, occupancy, move-in/out, monthly rate, first-time payment, add-ons, submitted date.
- Status pipeline: New → Contacted → Availability confirmed → Booked → Closed. Internal notes per enquiry.
- Detail view mirrors the quotation, with a download of the same PDF and a WhatsApp/email link to the student.
- CSV export.

### Residences
Full content editing for what the public pages show (this is website content, not unit-level inventory):
- Residence: name, slug, location, tagline, summary, description paragraphs, map coordinates, Waze link, terms, payment cycle.
- Photos: hero + gallery upload with captions and reorder.
- Facilities & amenities: the three lists (Building facilities, Included in your stay, Inside your apartment) plus the utilities note.
- Location: nearby universities and points of interest with distance and walk/bike/transit times.
- Room types: name, unit type, description, size, ensuite/shared, view, bed setup, features, furnishing, photos, visible-on-site toggle, and the four rates (12-month single/twin, short-term single/twin — blank means not offered).
- Fees & add-ons: advance months, deposits, access card, admin fee per term; bedding sets and other add-on prices.
- Add / archive residences.

Changes save to the database and the public site renders from it.

## Technical notes

- Enable Lovable Cloud. Tables: `residences`, `residence_media`, `room_types`, `amenities`, `nearby_places`, `fee_configs`, `addons`, `enquiries`, `appointments`, `appointment_types`, `availability_rules`, `blocked_dates`, `admin_notes`, plus `user_roles` with a `has_role` security-definer function.
- RLS: public/anon gets SELECT only on published residence content; every write and every read of `enquiries`/`appointments` requires the admin role. Appointment creation from the public booking form goes through a server function that validates the slot against availability server-side (never trusting the posted time) and writes with the service role.
- Slot generation is derived at request time from `availability_rules` + `blocked_dates` − existing appointments; no pre-materialised slot rows.
- A migration seeds `residences`, `room_types`, amenities, nearby places and fee configs from the current `src/data/properties.ts` content so nothing on the live site changes on day one. Public routes then read via public server functions; the helper functions in `properties.ts` (quote maths, term thresholds, formatting) stay as pure logic.
- Admin routes live under `src/routes/_authenticated/admin.*`; the public site has no link to them.
- Photos go to a Cloud storage bucket: public read, admin-only write.
- The existing `EnquiryDialog` submit gains a server-function call that persists the enquiry (PDF and success screen behaviour unchanged).

## Build order

1. Cloud + schema + seed migration; public pages switched to read from the database (no visible change).
2. Enquiry submissions persisted; admin login + shell + **Bookings** tab.
3. Availability settings + **Appointment Manager**, then the new public Book a Viewing page wired to it.
4. **Residences** editor.
