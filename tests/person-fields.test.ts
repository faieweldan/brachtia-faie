import { describe, expect, test } from "bun:test";

import { personFrom, personOwner, personPatch } from "../src/lib/person-fields";

describe("an appointment's person is their record's, not a copy (15 Oct 2026)", () => {
  test("a resident's answers fill every field they keep, under their own column names", () => {
    const p = personFrom("resident", { full_name: "Larveena", mobile: "+60 18", current_status: "student", referral_source: "Friend" });
    expect(p.phone).toBe("+60 18");
    expect(p.current_status).toBe("student");
    expect(p.heard_about).toBe("Friend");
    // a resident keeps no intake: it stays the appointment's own
    expect("intake" in p).toBe(false);
  });
  test("a save writes back to the same columns it read", () => {
    expect(personPatch("resident", { phone: "+60 19", heard_about: "Agent", intake: "Sep 2026", status: "confirmed" })).toEqual({ mobile: "+60 19", referral_source: "Agent" });
    expect(personPatch("booking", { phone: "+60 19", intake: "Sep 2026" })).toEqual({ phone: "+60 19", intake: "Sep 2026" });
  });
  test("a resident link wins over a booking link; neither is nobody's", () => {
    expect(personOwner({ resident_id: "r", enquiry_id: "e" })).toEqual({ owner: "resident", id: "r" });
    expect(personOwner({ enquiry_id: "e" })).toEqual({ owner: "booking", id: "e" });
    expect(personOwner({ resident_id: "", enquiry_id: null })).toBeNull();
  });
});
