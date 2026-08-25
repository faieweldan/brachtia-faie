# Landing page rebuild: green brand, white space, new copy

Bring back the forest-green brand colour, but on a mostly-white page — green used for the logo, links, buttons, stats and accents only. Rebuild the home page section by section with the copy you supplied.

## 1. Colour and type

- Restore green tokens in `src/styles.css`: primary/brand deep forest green, `brand-deep` near-black-green for headings, `brand-soft`/`brand-tint` as very light green washes used sparingly.
- Page background becomes plain white; cards white with light borders and soft shadows instead of tinted panels. Alternating sections use white and a barely-there off-white, not coloured bands.
- Keep Plus Jakarta Sans (it stays clean and modern); no colour hardcoding — all through tokens, so every other page picks the green up automatically.

## 2. Header

- Logo, then: Home · Residences (dropdown with The Arc, Cyberjaya and Solstice Residence, Cyberjaya) · About · Contact.
- Buttons: "Book a Viewing" (outline) and "WhatsApp" (green).
- Dropdown on desktop (hover/click menu), expanded as an indented list in the mobile sheet.
- Because there is no separate residences page, the dropdown links straight to each residence page.

## 3. Home sections (top to bottom)

1. **Hero** — "Student living, made simple." + your subhead, buttons "Explore Residences" (scrolls to the residences section) and "Check Availability" (goes to the enquiry form). Small line under: "Student accommodation for local and international students studying in Cyberjaya." Large lifestyle image of student living, generated to match.
2. **University strip** — "Home to students from" with a continuously scrolling marquee of MMU, HWUM, UTP, UCSI, CUCMS. Rendered as clean typographic wordmark chips (we don't hold the official logos; you can drop real logo files in later and I'll swap them).
3. **Our Residences** — "Find your place in Cyberjaya." + subline, the 2 existing property cards, no "View all".
4. **Why students stay** — "Everything sorted. Nothing complicated." 6 icon tiles with your exact labels and lines.
5. **How it works** — "Find your room in 3 simple steps." rendered as a connected 3-step diagram: numbered nodes (01/02/03) joined by a line that runs horizontally on desktop and vertically on mobile, each with its title and line. Below: "Check Availability" button, the reassurance line, and the small availability disclaimer.
6. **Why Brachtia** — "Student accommodation you can count on." 4 stats: 100+ / 17+ / 20+ / 24/7.
7. **Student reviews** — unchanged.
8. **For parents** — "Away from home, but never on their own." two paragraphs + "About Brachtia" button, paired with a warm student/community image (generated) rather than a property shot.
9. **Final CTA band and footer** — unchanged apart from picking up the green tokens.

## 4. Routing note

`/properties` stays in place as a route (it is linked from a few pages) but the home page no longer points at it; residence links go direct to each property page. If you'd rather delete it entirely, say so and I'll redirect it to home.

## Technical notes

- `src/styles.css`: revert brand/primary/ring/chart tokens to the green scale, set `--background` to white, lighten borders.
- `src/routes/index.tsx`: full rewrite with the new section order and copy.
- `src/components/site/Header.tsx`: add the Residences dropdown (shadcn `NavigationMenu` on desktop, disclosure list on mobile).
- New components: `UniversityStrip.tsx` (CSS marquee, pauses on hover, respects reduced motion), `HowItWorks.tsx` (step diagram), `StatsBand.tsx`, `ParentsSection.tsx`.
- Two new generated images: hero lifestyle shot and parents/community shot.
- Head metadata for `/` updated to the new positioning copy.
