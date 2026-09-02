# Residence editor: cleaner admin UI + image uploads

Rework `/admin/website/residences/:id` so editing a residence feels like a proper content manager instead of a long stack of rounded boxes, and let admins upload photos directly instead of pasting URLs.

## What changes for the admin

**Layout**
- One page header with the residence name, published toggle, and a single sticky "Save changes" bar that appears only when there are unsaved edits (replaces the six separate Save buttons).
- A left sticky section nav (Basics, Photos, Facilities, Location, Terms & fees, Rooms) that scrolls to each block; on mobile it becomes a horizontal tab strip.
- Sections become flat panels separated by hairlines with a compact header, not nested pill-shaped cards. Inputs get a smaller admin radius and tighter density so the form reads as a grid, not a pile of ovals.
- Repeating lists (description paragraphs, facilities, nearby places) get compact rows: drag-free up/down and delete as small hover icons, aligned columns, "Add" as a subtle inline button.
- Fee fields grouped into a small two-column table (12-month vs short-term) instead of two boxed grids.

**Photos**
- Drag-and-drop / click-to-upload area. Uploads go to a new public storage bucket; the stored URL is written into the residence record.
- Gallery becomes a thumbnail grid: each tile shows the image, caption input, a category selector (Building amenities / Inside your apartment / Inside your room), reorder arrows and delete.
- Hero image shown as a preview tile with "Replace" upload.
- Existing `asset:` values and plain URLs keep working; a "paste URL instead" option stays available.
- Room type photos in the room dialog use the same uploader.

## Technical notes

- New public storage bucket `residence-photos` with an RLS policy allowing public read and authenticated/admin writes; upload from the browser via the storage client, then save the public URL.
- New `src/components/admin/ImageUploader.tsx` (single image) and `GalleryEditor.tsx` (grid, captions, category, reorder), reused by residence and room forms.
- `src/components/admin/fields.tsx` restyled: Section becomes a hairline panel with an `id` anchor; Field/TextField/StringList/RowList get denser spacing and a `rounded-md` admin input override scoped to the admin layout (no change to the public site's rounded look).
- Residence editor keeps its current form state and `saveResidence` server function; the per-section save keys are merged into one dirty-tracked save call.
- Gallery items already support `category` in the public data type, so the public residence page grouping works unchanged.
