# Room photos: proper framing, full-screen viewer, apartment photos included

## 1. Photos fit the frame, nothing cropped, nothing ugly

The room popup's photo panel gets a fixed 16:10 frame with a soft neutral backdrop. Each photo is scaled to fit fully inside it, so tall or oddly-cropped phone photos are never cut off, and the frame never jumps in height as you swipe. To avoid the empty side bars looking bare, the same photo is used as a blurred, dimmed fill behind it — a common gallery treatment that keeps the panel looking intentional rather than letterboxed.

## 2. Click to view the full image

- An expand button sits in the top-right corner of the photo panel; clicking the photo itself also opens it.
- Opening it shows the photo full screen on a dark backdrop at its true proportions, with the caption/room name, a photo counter ("3 / 6"), left/right arrows, thumbnail strip, close button.
- Keyboard: left/right to move, Escape to close. Swipe works on touch. The viewer opens on the photo you clicked.
- Focus returns to the popup when closed, and closing the viewer does not close the room popup underneath.

## 3. Apartment photos in the room photo scroll

The residence's "Inside your apartment" photos (living, dining, kitchen, yard) are appended after the room's own photos in the room popup's scroll, so a student sees the room first and then the shared spaces they'd be living in. Each photo carries a small label chip — "This room" or "Inside the apartment" — so it's clear what they're looking at, and captions from the residence gallery come through into the full-screen viewer. Room-table thumbnails and the photo-count chip stay based on the room's own photos only.

## Technical notes

- `RoomGallery.tsx`: accepts `items: { src: string; caption?: string; badge?: string }[]` (string[] still supported), a `fit` prop, a blurred backdrop layer, an expand affordance, and an `onOpen(index)` callback. Slide sizing moves to a fixed aspect frame.
- New `src/components/site/PhotoLightbox.tsx`: shadcn `Dialog` with a transparent/borderless content, dark overlay, arrow + keyboard + swipe navigation, counter, thumbnail rail. Nested inside the existing room `Dialog` (Radix supports nesting; Escape closes only the top layer).
- `RoomDetailDialog.tsx`: builds the photo list as `room.gallery` (or `[room.image]`) plus `property.gallery.filter(g => g.category === "apartment")`, tagged with badges/captions, and wires `RoomGallery` to `PhotoLightbox`.
- No data model or backend changes.
