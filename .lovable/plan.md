# Brachtia Homes — Student Accommodation Website

A modern, mobile-first marketing + browsing site for Brachtia Homes, using the brand and content from the Company Profile and 2026 Accommodation Flyer. All data is realistic sample data held in typed files, structured so an admin backend can replace it later without redesigning pages.

## Brand

- Deep forest green primary (from the logo/profile), warm off-white background, charcoal text, soft green accents for tags and highlights.
- Tagline: "Where You Belong". Est. 2009, 15+ years, 80+ properties managed.
- Clean, trustworthy, generous whitespace, rounded cards, no purple/gradient AI look.

## Pages

**Home (/)**
- Hero: "Where You Belong" — off-campus student accommodation in Cyberjaya, with Browse Properties and WhatsApp CTAs.
- Trust strip: Est. 2009, 15 years, 80+ properties, 24/7 warden support.
- About Us — company write-up adapted from the profile (property management, long/short-term rentals, students local & international).
- What's included: furnished units, technical support, student support & warden 24/7, safety, cleanliness, halal / non-smoking / gender-segregated policy note.
- Featured properties (2 cards).
- Google-style reviews section: rating summary (stars, average, review count, "Google Reviews" styling) plus a scrollable row of sample review cards with avatar initials, star rating, date and text.
- Contact / CTA band with phones, email, WhatsApp.

**Properties (/properties)**
- Grid of the 2 properties: The Arc, Cyberjaya and Solstice Residence, Cyberjaya — photo, location, "from RM x/month", room count available, key facility icons.

**Property detail (/properties/$slug)**
- Photo gallery (hero + thumbnails, lightbox-free simple selector).
- Overview and terms & services specific to the property (The Arc: free Wi-Fi, monthly cleaning included, bi-monthly rental; Solstice: Wi-Fi RM105/mo, cleaning RM150 on request, monthly rental).
- Facilities grid (pool, gym, cafe, mini mart, squash court, laundry, prayer room, 24/7 security/CCTV/access card).
- Amenities around Cyberjaya (transport, malls, clinics, food).
- Pricing tables with a 12-month / short-term toggle, by unit type and room type, single vs twin-share.
- Available units & rooms list: unit number, unit type, gender, room label, occupancy, monthly rent, available-from date, status badge — each links to the room page.
- Sticky CTA bar on mobile: Book a Viewing / WhatsApp.

**Room detail (/properties/$slug/rooms/$roomId)**
- Room photos, unit and room description, size where known (e.g. 10' x 10.5').
- Monthly rent, occupancy option (single or twin sharing), availability date, gender of unit.
- Upfront cost breakdown table matching the flyer: 2 months rental in advance, utilities deposit (½ month), security deposit (2 months), access card deposit RM50, access card charge RM20, admin + agreement RM200, total payable — with a short-term variant (no utilities deposit, ½ month security, RM150 admin).
- Note on refundable vs one-time items, booking fee RM500 / USD100 and RM150 disbursement note.
- CTAs: Book a Viewing, Apply, WhatsApp.

**Book a Viewing (/book-viewing)** and **Apply (/apply)**
- Clean multi-field forms (name, email, phone, nationality, university, property/room, preferred date, tenancy length, message). On submit they show a success confirmation and a WhatsApp fallback; no backend yet — submissions are not stored until the admin backend is added.

**Contact (/contact)**
- Phones (+6012-950 5670, +6012-226 6815, +6012-330 6815), contact@brachtiahomes.com, office address in Cyberjaya, Waze link to The Arc, WhatsApp button.

## Sample data

- 2 properties, ~6 units across them, ~14 rooms with mixed availability (available, twin-share one bed left, occupied), realistic availability dates through 2026, all pricing taken from the flyer.
- ~8 Google-style reviews with names, ratings and dates.

## Technical notes

- TanStack Start file routes: `index`, `properties.index`, `properties.$slug.index`, `properties.$slug.rooms.$roomId`, `book-viewing`, `apply`, `contact`. Each route gets its own head() metadata.
- Sample data in `src/data/properties.ts` and `src/data/reviews.ts` with exported TypeScript types, plus small lookup helpers — the same shapes a future API will return.
- Brand tokens added to `src/styles.css` (oklch); shared Header/Footer in `__root.tsx`; shadcn components for cards, tabs, tables, badges, forms; lucide icons.
- Photography: property and room images generated as project assets in the brand's clean, natural style (the flyer PDF images are too low-resolution for web use); real photos can be swapped in later.
- Cost breakdowns computed from a single helper so future rate changes flow everywhere.
- WhatsApp CTAs use `https://wa.me/60129505670` with a prefilled message including property/room context.
