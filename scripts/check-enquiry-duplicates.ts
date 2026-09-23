/**
 * The duplicate rules, checked against made-up enquiries.
 *
 *   bun scripts/check-enquiry-duplicates.ts
 *
 * No database and no real people: every case below is invented, so this runs
 * anywhere and proves the rules rather than the data. It exits non-zero when a
 * case fails, so it can be wired into a check later.
 *
 * What it is guarding: a student who submits twice must be recognised as one
 * person, and two different people must never be merged into one. The first
 * mistake wastes staff time; the second loses an enquiry.
 */

import {
  DUPLICATE_WINDOW_HOURS,
  findRepeatOf,
  isWithinWindow,
  looksLikeSameSender,
  normaliseEmail,
  normaliseName,
  normalisePhone,
} from "@/lib/enquiry-duplicates";

let passed = 0;
const failures: string[] = [];

function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++;
  else
    failures.push(`${what}\n    wanted ${JSON.stringify(want)}\n    got    ${JSON.stringify(got)}`);
}

/* ---------------- the phone number ---------------- */
// the same Malaysian mobile, as three people would type it
const SAME_NUMBER = ["012-345 6789", "+60 12 345 6789", "60123456789", "0123456789"];
for (const written of SAME_NUMBER) {
  check(`normalisePhone("${written}")`, normalisePhone(written), "123456789");
}
check("a different number stays different", normalisePhone("012-999 0000"), "129990000");
check("nothing in, nothing out", normalisePhone(""), "");
check("punctuation only", normalisePhone("--- ()"), "");

/* ---------------- the email ---------------- */
check(
  "email is lowercased and trimmed",
  normaliseEmail("  Aisha@Example.COM "),
  "aisha@example.com",
);
check("empty email", normaliseEmail(""), "");

/* ---------------- the window ---------------- */
const now = new Date("2026-09-21T12:00:00Z");
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3600_000).toISOString();

check("an hour ago is inside the window", isWithinWindow(hoursAgo(1), now), true);
/*
 * Either side of the edge, counted from the window itself. Written as 23 and
 * 25 these read as the window while it was a day, and quietly stopped testing
 * the edge the moment it became a fortnight - both hours sat well inside it,
 * and the labels went on naming a boundary neither one was near.
 */
check(
  `${DUPLICATE_WINDOW_HOURS - 1}h ago is inside`,
  isWithinWindow(hoursAgo(DUPLICATE_WINDOW_HOURS - 1), now),
  true,
);
check(
  `${DUPLICATE_WINDOW_HOURS + 1}h ago is outside`,
  isWithinWindow(hoursAgo(DUPLICATE_WINDOW_HOURS + 1), now),
  false,
);
// a clock skewed forward must not make every new row a repeat of a future one
check("a row stamped in the future is not a repeat", isWithinWindow(hoursAgo(-2), now), false);
check("an unreadable date is not a repeat", isWithinWindow("not a date", now), false);

/* ---------------- same sender ---------------- */
check(
  "same email, different phone",
  looksLikeSameSender(
    { email: "a@b.com", phone: "0121111111" },
    { email: "A@B.com", phone: "0122222222" },
  ),
  true,
);
check(
  "same phone, different email",
  looksLikeSameSender(
    { email: "a@b.com", phone: "+60 12 345 6789" },
    { email: "c@d.com", phone: "012-345 6789" },
  ),
  true,
);
check(
  "two different people are never merged",
  looksLikeSameSender(
    { email: "a@b.com", phone: "0121111111" },
    { email: "c@d.com", phone: "0122222222" },
  ),
  false,
);
// two blanks are not a match - this is the bug that would group every row with
// no contact details into one
check("two empty senders do not match", looksLikeSameSender({}, {}), false);
check(
  "an empty side never matches a real one",
  looksLikeSameSender({ email: "", phone: "" }, { email: "a@b.com", phone: "0121111111" }),
  false,
);

/* ---------------- picking what it repeats ---------------- */
const recent = [
  { id: "second", email: "aisha@example.com", phone: "", created_at: hoursAgo(3) },
  { id: "first", email: "aisha@example.com", phone: "", created_at: hoursAgo(5) },
  /*
   * Older than the window, counted from the window itself. At a flat 30 hours
   * this was only stale while the window was a day: widened to a fortnight it
   * fell inside, became the oldest match, and won the "points at the first"
   * check below - the test reporting a real change in what a repeat links to,
   * not a fault.
   */
  {
    id: "stale",
    email: "aisha@example.com",
    phone: "",
    created_at: hoursAgo(DUPLICATE_WINDOW_HOURS + 6),
  },
  { id: "someone-else", email: "other@example.com", phone: "0129990000", created_at: hoursAgo(1) },
];

check(
  "a third submission points at the first, not the second",
  findRepeatOf({ email: "AISHA@example.com", phone: "" }, recent, now)?.id,
  "first",
);
check(
  "nothing inside the window means nothing to point at",
  findRepeatOf({ email: "nobody@example.com", phone: "" }, recent, now),
  null,
);
check(
  "a day-old enquiry is not dragged in",
  findRepeatOf({ email: "stale-only@example.com", phone: "" }, [recent[2]!], now),
  null,
);
check(
  "matched on the phone alone",
  findRepeatOf({ email: "brand-new@example.com", phone: "+60 12 999 0000" }, recent, now)?.id,
  "someone-else",
);

/* ---------------- the name ---------------- */
check(
  "spacing and case do not make two people",
  normaliseName("  Nur  Aisha binti Rahman "),
  "nur aisha binti rahman",
);
check("punctuation is dropped", normaliseName("Nur-Aisha bt. Rahman"), "nur aisha bt rahman");
check("nothing in, nothing out", normaliseName(""), "");
check(
  "the same name, nothing else in common",
  looksLikeSameSender(
    { email: "a@b.com", phone: "0121111111", full_name: "Nur Aisha" },
    { email: "c@d.com", phone: "0122222222", full_name: "nur  aisha" },
  ),
  true,
);
check(
  "different names, nothing else in common",
  looksLikeSameSender(
    { email: "a@b.com", phone: "0121111111", full_name: "Nur Aisha" },
    { email: "c@d.com", phone: "0122222222", full_name: "Siti Aminah" },
  ),
  false,
);
// two blank names are not a match, the same way two blank emails are not
check(
  "two people with no name given do not match",
  looksLikeSameSender({ email: "a@b.com" }, { email: "c@d.com" }),
  false,
);
// deliberately NOT matched: reversing the words is a different name often enough
check(
  "the words are not reordered to find a match",
  looksLikeSameSender(
    { email: "a@b.com", full_name: "Aisha Rahman" },
    { email: "c@d.com", full_name: "Rahman Aisha" },
  ),
  false,
);

/* ---------------- three from one person ---------------- */
// The shape that matters: every repeat points at the FIRST one, so staff open
// one group. If each pointed at the one before it they would form a chain and
// have to be walked back to find the original.
const sam = [
  { id: "one", email: "sam@example.com", phone: "", created_at: hoursAgo(6) },
  { id: "two", email: "sam@example.com", phone: "", created_at: hoursAgo(4) },
];
check(
  "the second submission points at the first",
  findRepeatOf({ email: "sam@example.com", phone: "" }, [sam[0]!], now)?.id,
  "one",
);
check(
  "the third points at the first too, not at the second",
  findRepeatOf({ email: "sam@example.com", phone: "" }, sam, now)?.id,
  "one",
);
// a fourth, matched on the phone this time, still lands on the same original
check(
  "a fourth from the same person joins the same group",
  findRepeatOf(
    { email: "different@example.com", phone: "012-345 6789" },
    [
      { id: "one", email: "sam@example.com", phone: "+60123456789", created_at: hoursAgo(6) },
      ...sam,
    ],
    now,
  )?.id,
  "one",
);

/* ---------------- what it found ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.error(`  FAILED  ${f}\n`);
if (failures.length) process.exit(1);
console.log("The duplicate rules hold.\n");
