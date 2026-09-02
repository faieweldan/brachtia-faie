# Quote PDF: single page, tighter header, new contact number

## What changes

1. **Contact number** — the PDF header shows `WhatsApp +6012 330 6815` instead of the current number. This is PDF-only; the site's WhatsApp links stay unchanged (say the word if you want it swapped site-wide too).

2. **Slimmer, cleaner top half**
   - Green header band shrinks (96pt -> ~74pt), smaller logo tile, tighter type: company name 14pt, tagline/contact 8pt.
   - "Stay quote" + date stay right-aligned, slightly smaller.
   - Residence name/location block moves up and loses excess spacing.
   - Prepared-for and listing-detail rows use tighter row padding and 8.5pt text, with a thin divider instead of large gaps.

3. **Guaranteed one page**
   - All blocks (lead, details, payment table, terms) render with compact styles; the terms list uses 7.5-8pt with tight leading.
   - After building, the code measures the last block's end position; if it would overflow, it re-renders once with a reduced scale (font sizes and paddings stepped down) so everything fits on page 1.
   - Footer disclaimer stays, pinned to the bottom of the single page.

## Technical notes

- All edits in `src/lib/quote-pdf.ts`.
- Introduce a `scale` factor applied to font sizes, cell padding, and section gaps; render the document body inside a function so it can be re-run into a fresh `jsPDF` at a smaller scale when `doc.getNumberOfPages() > 1`.
- Cap the terms table height; footer drawn once (no page loop needed after the fit pass).
