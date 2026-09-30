import { describe, expect, test } from "bun:test";

import { checkInStatus, needsCheckInBooking } from "../src/lib/checkin";

describe("check-in status", () => {
  test("a day and a time is booked, whatever the reminder box says", () => {
    expect(checkInStatus({ on: "2026-10-16", slot: "10:00", remind: true })).toBe("booked");
  });
  test("the reminder, or nothing", () => {
    expect(checkInStatus({ on: null, slot: "", remind: true })).toBe("remind");
    expect(checkInStatus({ on: null, slot: "", remind: false })).toBe("none");
  });
});

describe("chasing an arrival", () => {
  const today = "2026-10-10";
  test("moving in within the week, not booked", () => {
    expect(needsCheckInBooking("2026-10-15", "remind", today)).toBe(true);
    expect(needsCheckInBooking("2026-10-17", "none", today)).toBe(true);
  });
  test("too far ahead, or already booked", () => {
    expect(needsCheckInBooking("2026-10-18", "none", today)).toBe(false);
    expect(needsCheckInBooking("2026-10-15", "booked", today)).toBe(false);
  });
  test("started, while the arrival window is open; not after", () => {
    expect(needsCheckInBooking("2026-10-03", "none", today)).toBe(true);
    expect(needsCheckInBooking("2026-10-02", "none", today)).toBe(false);
  });
  test("no move-in date", () => {
    expect(needsCheckInBooking("", "none", today)).toBe(false);
  });
});
