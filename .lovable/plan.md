# Redesign "Why Students Stay" section with new 8-point copy

## Goal
Replace the current 6-item compact horizontal row with the user's new 8 benefit points, laid out in a way that is easy to scan, visually compelling, and consistent with the green + peach brand system.

## New copy

Eyebrow: **Why students stay**  
Headline: **Everything you need to settle in.**  
Subheadline: **From finding your room to feeling at home.**

| Title | Line |
|-------|------|
| Flexible Living | Single or twin-sharing rooms, with short and long-term stays. |
| Fully Digital Journey | From enquiry and booking to documents and check-in, all handled online. |
| Personal Welcome | Personal check-ins, city briefings and local tours to help you settle in. |
| Close to University | Conveniently located residences with easy access to campus. |
| Move-In Ready | Fully furnished units with Wi-Fi and monthly cleaning included. |
| Safe & Secure | 24/7 security and controlled access for greater peace of mind. |
| Easy Utility Splitting | Digital utility bills that make sharing costs with housemates simple. |
| 24/7 Support | A dedicated team available whenever you need help during your stay. |

## Proposed design direction

### Layout
- A clean white section (not tinted) to give the longer cards breathing room.
- Desktop: 4-column grid, 2 rows → all 8 items visible at once without scrolling.
- Tablet: 2-column grid, 4 rows.
- Mobile: 1-column stack with comfortable tap targets.

### Card treatment
- Slightly larger cards with generous padding (`p-6`).
- Circular peach icon badge (`bg-brand-soft`, `text-brand`) at the top-left of each card.
- Card background: very subtle off-white (`bg-brand-tint/40`) with a light border (`border-border/60`).
- No heavy shadows; rely on spacing and the icon color for impact.
- Title in `text-brand-deep`, description in `text-muted-foreground`.

### Visual rhythm
- Centered eyebrow/headline/subheadline block with tighter spacing.
- Add a faint decorative element: a soft peach radial wash behind the headline area, or a thin top/bottom divider line to frame the band.
- Keep vertical padding moderate (`py-16 sm:py-20`) so the section does not feel inflated.

## Files to edit
- `src/routes/index.tsx`: replace the `perks` array and the section markup.
- `src/styles.css`: no new tokens needed; reuse `brand`, `brand-soft`, `brand-tint`, `brand-deep`, and `border`.

## Acceptance criteria
- [ ] All 8 new benefit points render with the exact copy above.
- [ ] Desktop shows a 4×2 grid; tablet 2×4; mobile single column.
- [ ] Cards are easy to read with clear title/description hierarchy.
- [ ] Design stays on-brand with green headings, peach icon badges, and white/off-white surfaces.
