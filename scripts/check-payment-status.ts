/**
 * The five payment states, checked against made-up invoices.
 *
 *   bun scripts/check-payment-status.ts
 *
 * No database and no real people. Exits non-zero when a case fails.
 *
 * What it is guarding: the status is worked out fresh every time a page opens,
 * so the edges are where it goes wrong - an invoice paid after its due date, a
 * due date exactly a week away, an invoice with no due date at all.
 */

import { COMING_DUE_DAYS, daysBetween, paymentStateOf } from "@/lib/payment-status";

let passed = 0;
const failures: string[] = [];

function check(what: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else
    failures.push(`${what}\n    wanted ${JSON.stringify(want)}\n    got    ${JSON.stringify(got)}`);
}

const TODAY = "2026-09-21";
const inDays = (n: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ---------------- counting days ---------------- */
check("today to today is nothing", daysBetween(TODAY, TODAY), 0);
check("a week ahead", daysBetween(TODAY, inDays(7)), 7);
check("a week behind is negative", daysBetween(TODAY, inDays(-7)), -7);
check("a timestamp is read as its date", daysBetween(`${TODAY}T23:59:00Z`, inDays(1)), 1);

/* ---------------- scheduled ---------------- */
check(
  "rent planned but not raised is Scheduled",
  paymentStateOf({ scheduled: true, outstanding: 1600, dueDate: inDays(30) }, TODAY).status,
  "Scheduled",
);
// nobody owes a scheduled invoice, even one whose day has gone by
check(
  "a scheduled invoice is never Past Due",
  paymentStateOf({ scheduled: true, outstanding: 1600, dueDate: inDays(-5) }, TODAY).status,
  "Scheduled",
);

/* ---------------- paid ---------------- */
check(
  "nothing outstanding is Paid",
  paymentStateOf({ outstanding: 0, dueDate: inDays(3) }, TODAY).status,
  "Paid",
);
// the one that would otherwise stay red for ever
check(
  "paid after its due date is still Paid",
  paymentStateOf({ outstanding: 0, dueDate: inDays(-40) }, TODAY).status,
  "Paid",
);
check(
  "an overpayment is Paid, not owed",
  paymentStateOf({ outstanding: -50, dueDate: inDays(-2) }, TODAY).status,
  "Paid",
);

/* ---------------- the seven day line ---------------- */
check(
  "due in a month is Invoiced",
  paymentStateOf({ outstanding: 1600, dueDate: inDays(30) }, TODAY).status,
  "Invoiced",
);
check(
  `due in ${COMING_DUE_DAYS + 1} days is still Invoiced`,
  paymentStateOf({ outstanding: 1600, dueDate: inDays(COMING_DUE_DAYS + 1) }, TODAY).status,
  "Invoiced",
);
// the boundary itself counts as coming due, not as comfortably invoiced
check(
  `due in exactly ${COMING_DUE_DAYS} days is Coming Due`,
  paymentStateOf({ outstanding: 1600, dueDate: inDays(COMING_DUE_DAYS) }, TODAY).status,
  "Coming Due",
);
check(
  "due tomorrow is Coming Due",
  paymentStateOf({ outstanding: 1600, dueDate: inDays(1) }, TODAY).status,
  "Coming Due",
);
check(
  "due today is Coming Due, not late",
  paymentStateOf({ outstanding: 1600, dueDate: TODAY }, TODAY).status,
  "Coming Due",
);

/* ---------------- past due ---------------- */
check(
  "a day past is Past Due",
  paymentStateOf({ outstanding: 1600, dueDate: inDays(-1) }, TODAY).status,
  "Past Due",
);
check(
  "and it counts the days",
  paymentStateOf({ outstanding: 1600, dueDate: inDays(-8) }, TODAY).daysOverdue,
  8,
);
check(
  "nothing else reports days overdue",
  paymentStateOf({ outstanding: 1600, dueDate: inDays(3) }, TODAY).daysOverdue,
  0,
);

/* ---------------- partly paid ---------------- */
// the distinction this exists for: some money in, versus none at all
check(
  "some of it in, due in a month",
  paymentStateOf({ outstanding: 800, paid: 800, dueDate: inDays(30) }, TODAY).status,
  "Partially paid",
);
check(
  "some of it in, and it beats Coming Due",
  paymentStateOf({ outstanding: 800, paid: 800, dueDate: inDays(3) }, TODAY).status,
  "Partially paid",
);
// but never beats late - money past its date is the more pressing fact
check(
  "some of it in, but overdue: Past Due wins",
  paymentStateOf({ outstanding: 800, paid: 800, dueDate: inDays(-4) }, TODAY).status,
  "Past Due",
);
check(
  "and it still counts the days",
  paymentStateOf({ outstanding: 800, paid: 800, dueDate: inDays(-4) }, TODAY).daysOverdue,
  4,
);
check(
  "nothing in is not Partially paid",
  paymentStateOf({ outstanding: 1600, paid: 0, dueDate: inDays(3) }, TODAY).status,
  "Coming Due",
);
check(
  "partly paid is sky, not amber",
  paymentStateOf({ outstanding: 800, paid: 800, dueDate: inDays(30) }, TODAY).tone,
  "part",
);

/* ---------------- no due date ---------------- */
// an older invoice with no NET terms: it is out and owed, and that is all we know
check(
  "owed with no due date is Invoiced",
  paymentStateOf({ outstanding: 1600, dueDate: "" }, TODAY).status,
  "Invoiced",
);
check(
  "a missing due date is not late",
  paymentStateOf({ outstanding: 1600 }, TODAY).status,
  "Invoiced",
);

/* ---------------- cancelled ---------------- */
// A voided invoice owes nothing, so every other rule would call it Paid. It is
// asked first, and these are the cases that catch it if that order ever moves.
check(
  "a cancelled invoice says so",
  paymentStateOf({ cancelled: true, outstanding: 0 }, TODAY).status,
  "Cancelled",
);
check(
  "cancelled beats Paid",
  paymentStateOf({ cancelled: true, outstanding: 0, paid: 0 }, TODAY).status,
  "Cancelled",
);
check(
  "cancelled beats Past Due",
  paymentStateOf({ cancelled: true, outstanding: 500, dueDate: inDays(-30) }, TODAY).status,
  "Cancelled",
);
check(
  "cancelled beats Partially paid",
  paymentStateOf({ cancelled: true, outstanding: 800, paid: 800 }, TODAY).status,
  "Cancelled",
);
check(
  "cancelled beats Scheduled",
  paymentStateOf({ cancelled: true, scheduled: true, outstanding: 1 }, TODAY).status,
  "Cancelled",
);
check(
  "a cancelled invoice is never late",
  paymentStateOf({ cancelled: true, outstanding: 500, dueDate: inDays(-30) }, TODAY).daysOverdue,
  0,
);
check("cancelled is grey", paymentStateOf({ cancelled: true, outstanding: 0 }, TODAY).tone, "idle");

/* ---------------- colours ---------------- */
check("late is rose", paymentStateOf({ outstanding: 1, dueDate: inDays(-1) }, TODAY).tone, "late");
check("paid is green", paymentStateOf({ outstanding: 0 }, TODAY).tone, "done");
check("scheduled is grey", paymentStateOf({ scheduled: true, outstanding: 1 }, TODAY).tone, "idle");

console.log(`\n${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.error(`  FAILED  ${f}\n`);
if (failures.length) process.exit(1);
console.log("The payment states hold.\n");
