# SEO & AEO clean-up

Goal: make every public page correctly titled, canonical, shareable, crawlable and answer-engine friendly (Google AI Overviews, ChatGPT, Perplexity).

## What's missing today

- No sitemap.xml at all.
- No canonical URLs and no `og:url` on any page — crawlers can't tell which URL a page is.
- No structured data (JSON-LD) anywhere, so answer engines have no machine-readable facts about the company, residences, prices or contact details.
- No social preview images (`og:image` / `twitter:image`), so shared links look bare.
- Property, properties list, contact and book-viewing pages are missing `og:type` and `twitter:card`.
- Root has a leftover `twitter:site` pointing at `@Lovable`.
- Admin pages are `noindex` (good) but nothing stops crawling of `/book-viewing` query variants.

## Changes

### 1. URLs and crawlability
- Add a dynamic `sitemap.xml` server route listing the public pages: `/`, `/properties`, each residence (`/properties/the-arc`, `/properties/solstice-residence`), `/about`, `/contact`, `/book-viewing`. Admin routes excluded.
- Update `robots.txt`: keep the existing user-agent blocks, add `Disallow: /admin`, and point crawlers at the sitemap.

### 2. Per-page metadata
For every public route: unique title (<60 chars), description (<160), `og:title`, `og:description`, `og:url`, `og:type`, `twitter:card`, and a self-referencing `<link rel="canonical">` on the leaf route. Base URL: `https://campus-pad-finder-18.lovable.app`.
- Residence pages get canonical/og:url built from the slug, `og:type: product`, plus the residence hero photo as `og:image` and `twitter:image`.
- Home and About get their hero images as `og:image`.
- Remove the `@Lovable` twitter handle from the root; root keeps only sitewide defaults.
- `/book-viewing` stays indexable but its canonical drops the `?property=` param so the query variants don't split ranking.

### 3. Structured data (AEO)
- Sitewide in the root: `Organization` + `WebSite` JSON-LD with the legal name, Cyberjaya address, phone numbers, email and logo.
- Residence pages: `Apartment`/`LodgingBusiness` JSON-LD with address, amenity list and an `offers` block carrying the real monthly room rates and currency (MYR), generated from the existing room-type data.
- Contact page: `LocalBusiness` with opening contact channels.
- Breadcrumb JSON-LD on residence pages (`Home > Properties > Residence`).

### 4. Answer-engine content hygiene
- Ensure each page has exactly one `<h1>` and descriptive `alt` text on hero and gallery images (currently several are empty or generic) — this is what LLM crawlers read.
- Add concise, factual answer blocks that already reflect real site data (price-from, deposit, booking fee RM500, location, terms) so answer engines can quote them. No invented facts, no FAQ schema.

## Technical notes

- Metadata goes through each route's `head()` (TanStack pattern already in use); canonical only on leaf routes since `links` are concatenated, not deduped.
- Sitemap as `src/routes/sitemap[.]xml.ts` returning XML; residence entries derived from the existing `properties` data, no new database access.
- No `lastmod` values unless a real per-page timestamp exists.
- No visual/layout redesign — only alt text and small factual copy blocks change on screen.
