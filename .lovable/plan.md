# Redesign the Tenancy tab on the Resident page

Rebuild the Tenancy tab in `src/routes/admin.residents.$id.tsx` around three things: **Tenancy Agreements** (legal documents and their revisions), **Access Cards**, and **Checkout Statement**. Document templates arrive later via the Settings tab, so this pass builds the structure, statuses, versioning and data-review flow with placeholder document previews; the Settings template upload plugs in afterwards.

## 1. Resident header actions

Add three actions to the resident header (next to the existing buttons), not inside the tab:

- **Room Change** — dialog to pick a new bed. Keeps the current Agreement No.; on confirm it issues revised **Schedule A** and **Schedule C** versions (previous versions kept).
- **Update Tenancy** — dialog for date and/or rent changes. Keeps the Agreement No.; issues a revised **Schedule A** only.
- **Initiate Check-out** — reveals the Checkout Statement section in the Tenancy tab.

## 2. Tenancy tab — before documents exist

When the profile is complete and a tenancy exists but no document pack has been generated, show a single prompt panel:

- "Resident profile complete — review the resident and tenancy information before generating the initial documents."
- **Create Document Pack** button.

### Create Document Pack screen

A dedicated route (`admin.residents.$id.document-pack.tsx`) with a 3-column layout:

- **Left — Documents menu**: Agreement group (Tenancy Agreement, Schedule A – Particulars, Schedule B – House Rules & Additional Charges, Schedule C – Inventory & Condition Record) and Other Documents (Access Card Form). Each individually selectable.
- **Centre — Document preview**: placeholder-document preview of the selected document, updating on selection. Previews are rendered from the same merge-field values shown on the right; real templates replace these once uploaded in Settings.
- **Right — Data review**: every merge-field value used by the selected document (agreement date, resident name, NRIC/passport, unit, room, dates, rent, schedule, deposit…), pre-filled from the resident, booking, assigned room and tenancy records. Admin can correct values here; corrections apply to the documents only — changing a source record requires editing that record itself (with a note saying so).

Final action: **Generate Document Pack** — creates one Agreement No. (`TA-XXXX` sequence) shared by the four agreement documents, plus the first Access Card Form, all at status **Generated**.

## 3. Tenancy tab — after generation

Replaces the prompt with three sections.

### A. Tenancy Agreements

One hierarchical table: `Document | Agreement No. | Effective Date | Period | Status | Action`.

- Tenancy Agreement is the parent row; Schedules A, B, C nested underneath (expandable).
- Each document is individually viewable, status-tracked and version-controlled; revised schedules appear as new versions under the same document, never overwriting.
- Statuses per document: **Generated → Pending Signature → Signed → Pending Stamping → Stamped** (only applicable ones shown).
- **Renewal** (via Update Tenancy → Renewal option) generates a brand-new Agreement No. with a fresh set of four documents; the previous agreement stays visible as history.
- No room details or rent amounts in this table — those live inside the documents.

### B. Access Card

Independent table: `Form | Date | Reason | Card No. | Status | Action`.

- First form auto-created with the pack (reason: Initial Tenancy).
- **New Access Card Form** button for replacements; reasons: Initial Tenancy, Lost Card, Damaged Card, Unit Change, Other.
- Workflow: **Form Generated → Submitted → Card Received → Issued**; issued cards can later be marked **Returned / Lost / Damaged**. Card number entered when received, before marking issued.
- Every application is a new record; nothing is overwritten.

### C. Checkout Statement

Hidden until **Initiate Check-out** is triggered. Then shows:

- Checkout date, room condition / inspection notes, comparison against the applicable Schedule C (referenced, never modified), key return, access card return, damages/deductions, outstanding amounts, deposit/refund calculation, final amount payable or refundable, statement status.

## 4. What happens to the current tab

- The existing **Placement** panel and **Declaration** panel stay as they are.
- The current `TenancyCard` (stage stepper, agreement upload rows, pre-check-in checklist) is replaced by the new sections; the pre-check-in checklist moves into a small panel above the Agreements table so existing tasks keep working.

## Technical notes

- New tables (idempotent migrations, run on test-bratchia first then sent for the live database, logged in `docs/PENDING-ON-LOVABLE.md`):
  - `tenancy_agreements` — id, resident_id, agreement_no, kind (initial/renewal), created_at.
  - `agreement_documents` — id, agreement_id, doc_type (agreement/sched_a/sched_b/sched_c), version, status, effective_date, period_start/end, merge_values jsonb (the reviewed values snapshot), supersedes id. RLS + grants per project rules.
  - `access_card_forms` — id, resident_id, reason, card_no, status, dates.
  - `checkout_statements` — id, resident_id, tenancy/agreement ref, inspection notes, deductions jsonb, amounts, status.
- Server functions in a new `src/lib/tenancy-docs.functions.ts` (generate pack, revise schedule, renew, access-card CRUD, checkout CRUD), following the existing `residents.functions.ts` patterns.
- Document previews reuse the on-screen document styling from the quote/invoice PDF components; actual PDF generation from uploaded templates is a later pass once Settings templates exist.
- Merge-field values are snapshotted onto each document version at generation time, so later profile edits never silently change issued documents.
