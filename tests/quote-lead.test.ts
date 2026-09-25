import { describe, expect, test } from "bun:test";
import { quoteLeadFrom } from "../src/lib/booking-quote";

const row = {
  full_name: "test-poo", university: "", company: "misma", occupation: "guard",
  nationality: "Malaysia", gender: "Male", email: "poo@gmail.com", phone: "+60 12345678",
};

describe("who the saved quote is for", () => {
  test("an old snapshot with no employment is filled in from the booking", () => {
    const snap = { lead: { name: "test-poo", university: "", intake: "", nationality: "Malaysia", gender: "Male", email: "poo@gmail.com", mobile: "+60 12345678" } };
    const lead = quoteLeadFrom(snap, row);
    expect(lead.occupation).toBe("guard");
    expect(lead.company).toBe("misma");
  });
  test("what was quoted wins over the booking as it stands today", () => {
    const snap = { lead: { name: "test-poo", company: "old employer", occupation: "old job" } };
    const lead = quoteLeadFrom(snap, row);
    expect(lead.company).toBe("old employer");
    expect(lead.occupation).toBe("old job");
  });
  test("a student gets no employment from either side", () => {
    const student = { ...row, company: "", occupation: "", university: "Taylor's" };
    const lead = quoteLeadFrom({ lead: { university: "Taylor's" } }, student);
    expect(lead.company).toBe("");
    expect(lead.occupation).toBe("");
    expect(lead.university).toBe("Taylor's");
  });
  test("a snapshot with no lead at all still names the person", () => {
    const lead = quoteLeadFrom({}, row);
    expect(lead.name).toBe("test-poo");
    expect(lead.email).toBe("poo@gmail.com");
    expect(lead.mobile).toBe("+60 12345678");
  });
  test("blank and whitespace count as missing, not as an answer", () => {
    const lead = quoteLeadFrom({ lead: { company: "   ", name: "" } }, row);
    expect(lead.company).toBe("misma");
    expect(lead.name).toBe("test-poo");
  });
});
