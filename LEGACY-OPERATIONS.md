# Legacy Student Operations (Pre-Website)

## Purpose and status

This document records the manual process Brachtia Homes used before the website.
It was reconstructed from Rina's **Brachtia As-Is** Miro board and screenshots
shared on 10 September 2026.

Use it to understand the domain, identify required handoffs, and avoid designing
features in isolation. It is **discovery evidence**, not an approved policy or a
complete product specification. Items labelled **Unresolved** must be confirmed
with Brachtia before implementation.

## End-to-end student lifecycle

1. **Enquiry**
   - A student contacts Brachtia, normally through WhatsApp.
   - Staff collect the student's name, university, intake, contact details,
     nationality, preferred property or rental area, room type, move-in date,
     and intended rental period.
   - Staff check room availability against the existing student/room records.

2. **Viewing and booking decision**
   - Local students are offered a physical viewing, typically 30–45 minutes,
     with details coordinated through WhatsApp or email.
   - International students receive current photos of the available unit and
     confirm their arrival or flight details remotely.
   - After the student chooses a room, staff send payment details generated in
     QuickBooks.

3. **Booking fee and reservation**
   - The student or payor pays a booking fee, historically by bank transfer.
   - The payor sends proof of payment through WhatsApp or email.
   - Staff verify the payment and issue a booking receipt from QuickBooks.
   - The room is considered reserved only after payment verification.

4. **Application and documentation**
   - Staff send the declaration form to the student.
   - The student signs it and uploads it with the application form.
   - The application captures personal, education, room preference, emergency
     contact, payment/payor, identification, and supporting-document details.
   - Staff prepare and send the tenancy agreement.

5. **Pre-check-in preparation**
   - Staff prepare a physical "blue file" containing the inventory list, keys,
     access-card information, house rules, and payment details.
   - Where required, staff submit the building-management access-card
     application.
   - Staff send the check-in procedure and allocate a team member to assist.

6. **Arrival and check-in**
   - The student arrives and pays the remaining upfront amount.
   - The allocated staff member explains the tenancy agreement and house rules,
     gives an apartment tour, and performs the inventory/defect review with the
     student.
   - The tenancy agreement is signed, stamped, and emailed to the student.
   - The student is asked to install the relevant utility-billing application.

7. **Active tenancy operations**
   - Rent is invoiced according to the agreed schedule; the student sends proof
     of payment and staff issue a receipt.
   - Water bills are obtained from building management, allocated to the unit or
     students, and collected by Brachtia.
   - Electricity is paid to TNB and was manually monitored periodically.
   - Common-area cleaning is arranged monthly and cleaners provide photo updates.
   - Students report defects; staff coordinate internal or external maintenance,
     communicate progress, and retain photo evidence.

8. **Renewal or checkout**
   - For renewal, the student completes a renewal form, pays applicable fees,
     signs a new tenancy agreement, receives a receipt, and returns to the
     recurring rental-payment flow.
   - For checkout, staff confirm the date, inspect the unit, arrange post-checkout
     cleaning, calculate supported deductions, refund the remaining deposit, and
     issue a receipt.

## Product perspective

The website should make the lifecycle traceable rather than merely copy the old
paper and WhatsApp steps. In particular, designs should preserve these controls:

- A room changes from available to reserved only after a defined verification
  event.
- Application, declaration, identity documents, and tenancy agreement have
  visible completion states.
- Each payment has a purpose, payor, amount, evidence, verification state, and
  receipt.
- Check-in and checkout inventory records retain dated evidence so damage claims
  and deposit deductions can be explained.
- Rent, utility, cleaning, and maintenance work has an owner, due date, status,
  and communication history.
- Renewal and checkout are explicit branches from an active tenancy.
- WhatsApp and email may remain communication channels, but the system should be
  the durable source of status and evidence.

## Improvement ideas captured in discovery

- **Short term:** simplify enquiry-to-application, generate tenancy agreements
  digitally, provide digital onboarding, and reduce paper-based workflows.
- **Mid term:** establish a master student database and scheduling/monitoring for
  cleaning and maintenance.
- **Long term:** automate utility allocation and monitoring, payment processing,
  reconciliation, room inventory, and maintenance-cost tracking.

These are directional ideas from discovery and still require prioritisation.

## Unresolved business rules

Confirm these before treating them as acceptance criteria:

- Conversion rate and follow-up process for enquiries that do not book.
- Other accepted payment methods besides bank transfer, including cash or cheque.
- Whether receipts are issued to the student or the payor when they differ.
- Exact booking fee, deposit, administration, agreement, access-card, tag, and
  renewal charges; sample documents contain dated example amounts only.
- Invoice frequency and the monitoring/escalation process for payment defaults.
- How water and electricity costs are divided and who supplies each receipt.
- Who receives defect reports, who performs each type of maintenance, and who
  verifies completion.
- When maintenance is Brachtia's, building management's, or the student's cost.
- Evidence, approval, and communication requirements for deposit deductions.
- Formal check-in/check-out ownership and how confirmations are recorded.

## Design principle

When modernising a legacy step, preserve the business outcome and audit trail,
not necessarily the old medium. A paper form, spreadsheet, WhatsApp message, or
QuickBooks attachment may become a structured system action as long as staff and
students can still see what happened, who did it, and what comes next.
