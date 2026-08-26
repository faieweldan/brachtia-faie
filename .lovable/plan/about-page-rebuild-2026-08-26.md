# About page rebuild

Full rewrite of `/about` using your copy, in four sections plus a closing CTA. Same green/peach/white system already used across the site.

## 1. Hero (warm, visual — not a corporate banner)

- Eyebrow "About Brachtia Homes", two-line headline "Designed for Students. / Trusted by Parents and Universities."
- Two short paragraphs (17 years; appointed off-campus provider) and an "Explore Our Residences" button linking to `/properties`.
- Large warm photograph sitting alongside the copy on desktop, stacked on mobile, on a soft peach wash.
- Stats bar attached directly to the bottom of the hero as one white card that overlaps the section edge: 17+ Years Experience · 100+ Properties Managed · 20+ Nationalities · 24/7 Student Support.

## 2. Our university partners (second section, white)

- Heading "Our university partners", line "Appointed by leading universities to house their students."
- Four static logo tiles with generous whitespace: Multimedia University, Heriot-Watt University Malaysia, University of Cyberjaya, City University Malaysia. Name under each, no descriptions.
- Placeholder monogram tiles (initials in a clean frame) until you send the real logo files; swapping them in later is a one-line change per tile.

## 3. The Brachtia difference (light peach background for rhythm)

- Heading "More than a place to stay." with the intro line.
- Four plain blocks in one row on desktop (2 up on tablet, 1 on mobile): Student Housing Specialists, A Personal Welcome, Safe & Supported Living, Here Throughout Your Stay.
- Understated small line icons, 3–4 word heading, 2–3 lines of copy. No cards, no heavy borders — just spacing and a thin divider.

## 4. The human side (50/50 split)

- Left: large photograph (using an existing warm student photo for now — send real Brachtia photos of check-in, welcome, city orientation or group outings and I'll swap them in).
- Right: "Someone to turn to, even when home is far away." plus the two paragraphs, and a highlighted handwritten-style pull quote: "Finding the room is only the beginning."

## 5. Closing CTA

"Find your home away from home." with the supporting line and two buttons — Explore Residences and Book a Viewing — reusing the existing CTA band styling so it matches the rest of the site.

## Technical notes

- Rewrites `src/routes/about.tsx` only; updates its `head()` title/description to match the new positioning.
- Reuses existing tokens (`brand`, `brand-deep`, `brand-tint`, `brand-soft`, `shadow-card`) and lucide icons; no new dependencies.
- University logos and human-side photos use placeholders/existing assets until you upload the real files.
