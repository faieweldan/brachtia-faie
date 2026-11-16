import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { syncBookingStage } from "../src/lib/booking-lifecycle";
import { fakeDb } from "./fake-db";

/*
 * Any payment can make the resident, once staff say yes to "Create resident
 * now?" (Wani asked, Lav agreed with a pop-up, 16 Nov 2026). The booking fee in
 * full still makes them with no question.
 */
const booking = (resident_id: string | null) =>
  fakeDb({
    enquiries: [{ id: "E1", status: "awaiting_payment", assigned_staff: "", resident_id }],
    invoices: [{ id: "I1", enquiry_id: "E1", status: "partially_paid" }],
    payments: [{ id: "P1", invoice_id: "I1", enquiry_id: "E1", amount: 200 }],
  });

const stageWritten = (db: ReturnType<typeof fakeDb>) =>
  (db.writes.find((w) => w.what === "enquiries" && w.op === "update")?.value as any)?.status;

describe("a resident made below the RM500 booking fee", () => {
  test("RM200 in and a resident made: the booking is Booked, so stage and resident agree", async () => {
    const db = booking("R1");
    await syncBookingStage(db.sb, "E1");
    expect(stageWritten(db)).toBe("booked");
  });

  test("RM200 in and no resident: it still waits for the rest of the fee", async () => {
    const db = booking(null);
    await syncBookingStage(db.sb, "E1");
    expect(stageWritten(db)).toBeUndefined(); // already awaiting_payment
  });

  test("the server makes the resident on the fee in full, or on staff's yes - nothing else", () => {
    const src = readFileSync("src/lib/admin.functions.ts", "utf8");
    expect(src).toContain("const makeResident = feeIn || createResident;");
    expect(src).toContain("data.createResident === true");
  });

  test("the box asks only on a booking with fee still to come, never on Amend", () => {
    const dialog = readFileSync("src/components/admin/RecordPaymentDialog.tsx", "utf8");
    expect(dialog).toContain("if (!amending && short > 0 && value > 0 && value + 0.005 < short)");
    const page = readFileSync("src/routes/admin.bookings.$id.tsx", "utf8");
    expect(page).toContain("feeShort: row.resident_id ? 0 : Math.max(BOOKING_FEE - feeIn, 0)");
  });

  test("a booking paid below the fee before 16 Nov gets Create resident, asked the same question, and moves to Booked", () => {
    const page = readFileSync("src/routes/admin.bookings.$id.tsx", "utf8");
    expect(page).toContain("{row.resident_id || feeIn > 0 ? (");
    expect(page).toContain("if (feeIn + 0.005 < BOOKING_FEE) setAskResident(true);");
    // one question for both places
    const dialog = readFileSync("src/components/admin/RecordPaymentDialog.tsx", "utf8");
    expect(dialog.match(/<AlertDialogTitle/g)?.length).toBe(1);
    const server = readFileSync("src/lib/admin.functions.ts", "utf8");
    expect(server).toMatch(
      /createResidentFromBooking[\s\S]*?residentFromBooking\(supabase, data\.enquiryId\);\n[\s\S]*?syncBookingStage\(supabase, data\.enquiryId\)/,
    );
  });
});
