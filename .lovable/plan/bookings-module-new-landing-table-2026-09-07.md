# Bookings module — new landing table

Rebuild the Bookings page as an operations table driven by the pipeline, with sorting, filters, staff assignment, small counters and a right-hand detail drawer.

## Quote / enquiry reference

New format for enquiries created from now on:

```text
BH-DDMMYY-QT0042
```

- `BH` = Brachtia Homes
- `DDMMYY` = the date the enquiry was created
- `QT####` = one running number that never resets (continues from the current counter, so the next enquiry is 0010)

Existing references (BRH-2609-000x) stay exactly as they are so old quotations and emails still match.

## Landing table

Columns, matching the reference image:

Student · Requirements · Move-in · Room Assigned · Stage · Staff · SLA · Next Action

- Student shows name and gender initial (Rachel · F).
- Requirements shows university · sharing · room (MMU · Single · Room C).
- Room Assigned shows the assigned unit/bed once a room is reserved, otherwise a dash.
- Stage is a read-only pill. Admin can no longer pick a status from a dropdown — the stage only moves when the matching action is completed.
- Staff is an inline picker on each row: Syazwani, Norfadirah, Valsala (or unassigned).
- SLA shows time left against the deadline for the current stage, turning amber when under 25% and red when overdue.
- Next Action is a button that jumps straight to the step.

### Sorting

Click a column heading to sort, click again to reverse:

- Student — A–Z / Z–A
- Move-in — earliest / latest
- Stage — pipeline order
- Staff — alphabetical
- SLA — most urgent first

### Filters

Stage, Staff and Next Action, plus the existing search box.

### Counters

Four small counts above the table: New enquiries, Need availability check, Viewings upcoming, Awaiting payment.

## Pipeline and SLA

| Stage | Next action | SLA | Clock starts |
| --- | --- | --- | --- |
| New | Check availability | 24 hours | Enquiry submitted |
| Room reserved | Schedule viewing | 2 days | Room reserved |
| Viewing | Complete viewing | Viewing date | Viewing scheduled |
| Viewing | Generate invoice | 2 days | Viewing completed |
| Awaiting payment | Confirm payment | 5 days | Invoice issued |
| Booked | Create resident | 3 days | Booking fee received |
| Booked (resident created) | View resident | — | — |
| Closed | — | — | — |

Progression: New → (reserve room) → Room reserved → (schedule viewing) → Viewing → (proceed) → Awaiting payment → (payment verified) → Booked → (create resident) → Resident. From Room reserved an admin can also proceed without a viewing straight to Awaiting payment.

## Next Action shortcuts

Clicking Next Action skips the detail drawer where possible:

- Check availability → room availability / assignment drawer
- Schedule viewing / View appointment → that viewing appointment
- Generate invoice → pricing + invoice generation
- Verify booking fee → payment verification panel
- Create resident → Create Resident flow, prefilled from the booking

Clicking anywhere else on the row opens a Booking Detail drawer sliding in from the right (replacing the centre modal). This first pass moves the existing detail content into the drawer; the drawer and each action step get refined afterwards.

## Technical notes

- Database migration: switch the reference generator to `'BH-' || to_char(now(),'DDMMYY') || '-QT' || lpad(nextval(...)::text,4,'0')` reusing the existing sequence; add `assigned_staff text`, `stage_changed_at timestamptz`, `viewing_completed_at timestamptz`, `invoice_issued_at timestamptz`, `fee_received_at timestamptz` and `resident_id text` to `public.enquiries` so SLA clocks and the resident link have real timestamps.
- Server functions: extend `updateEnquiry` in `src/lib/admin.functions.ts` to accept `assignedStaff` and stage-transition timestamps; add an `advanceEnquiryStage` function that sets status plus the matching timestamp instead of a free-form status write.
- `src/routes/admin.bookings.tsx` is rewritten: sortable header cells, filter bar, counter strip, `Sheet` (side="right") for the detail drawer, and a `nextActionFor(row)` helper returning label + target route. Room Assigned is read from `src/lib/ops-store.ts` beds tagged with the enquiry id.
- Staff list lives in `src/data/form-options.ts` as `STAFF`.
