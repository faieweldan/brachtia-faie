import { describe, expect, test } from 'bun:test';
import { bookingNextAction, upcomingViewing, STAGE_ORDER, stageLabel, studentMayMoveStage } from '../src/lib/bookings-pipeline';

const booking = { id: 'b1', status: 'viewing_scheduled', stage_changed_at: '2026-09-20T00:00:00Z' };
const appt = (over: Record<string, unknown> = {}) => ({
  id: 'a1', enquiry_id: 'b1', type_slug: 'viewing-in-person', starts_at: '2026-09-28T02:00:00Z',
  status: 'scheduled', assigned_staff: '', ...over,
});

describe('the next action a booking is waiting on', () => {
  test('a viewing nobody is taking asks for a staff member first', () => {
    expect(bookingNextAction(booking, [appt()]).action).toBe('assign_viewing_staff');
  });
  test('once someone is assigned it moves on to the invoice', () => {
    // the bookings list passed the viewing time but not the staff, so every
    // booking with a viewing read as unassigned and the list said "Assign
    // staff" beside bookings the booking page already called invoiced-next
    expect(bookingNextAction(booking, [appt({ assigned_staff: 'Valsala' })]).action)
      .toBe('generate_invoice');
  });
  test('whitespace is not a staff member', () => {
    expect(bookingNextAction(booking, [appt({ assigned_staff: '   ' })]).action)
      .toBe('assign_viewing_staff');
  });
  test('a cancelled viewing is not the one being waited on', () => {
    // it stays on record, but nobody is going to it, so it cannot set the action
    expect(upcomingViewing([appt({ status: 'cancelled' })], 'b1')).toBeUndefined();
    expect(bookingNextAction(booking, [appt({ status: 'cancelled' })]).action)
      .toBe('generate_invoice');
  });
  test('the earliest standing viewing is the one that counts', () => {
    const later = appt({ id: 'a2', starts_at: '2026-10-05T02:00:00Z', assigned_staff: 'Valsala' });
    expect(upcomingViewing([later, appt()], 'b1')?.id).toBe('a1');
  });
  test('the student\'s check-in is never taken for their viewing', () => {
    // the viewing was cancelled; the arrival check-in on the same booking must
    // not slide into the Viewing card, where Cancel would cancel their arrival
    const checkIn = appt({ id: 'c1', type_slug: 'check-in', starts_at: '2026-10-01T05:00:00Z' });
    expect(upcomingViewing([appt({ status: 'cancelled' }), checkIn], 'b1')).toBeUndefined();
  });
  test('a virtual viewing counts as a viewing', () => {
    expect(upcomingViewing([appt({ type_slug: 'viewing-virtual' })], 'b1')?.id).toBe('a1');
  });
  test('another booking\'s viewing is never borrowed', () => {
    expect(upcomingViewing([appt({ enquiry_id: 'other' })], 'b1')).toBeUndefined();
  });
  test('later stages do not depend on the viewing at all', () => {
    expect(bookingNextAction({ ...booking, status: 'awaiting_fee' }, []).action)
      .toBe('upload_booking_fee');
    expect(bookingNextAction({ ...booking, status: 'booked', resident_id: 'r1' }, []).action)
      .toBe('view_resident');
  });
});

describe('a student who asked for their invoice', () => {
  const requested = { ...booking, status: 'invoice_requested' };
  test('is waiting on the invoice, not on a booking fee', () => {
    // it used to be filed as awaiting_fee - the stage meaning the invoice went
    // out - so staff were asked to collect money for an invoice nobody raised
    expect(bookingNextAction(requested, []).action).toBe('generate_invoice');
    expect(bookingNextAction(requested, []).label).toBe('Generate invoice');
  });
  test('sits between the viewing and the invoice going out', () => {
    expect(STAGE_ORDER['viewing_scheduled']).toBeLessThan(STAGE_ORDER['invoice_requested']!);
    expect(STAGE_ORDER['invoice_requested']).toBeLessThan(STAGE_ORDER['awaiting_fee']!);
  });
  test('says what is true of it on the list', () => {
    expect(stageLabel('invoice_requested')).toBe('Invoice requested');
  });
  test('once the invoice is out it is awaiting payment, and that asks for the fee', () => {
    expect(bookingNextAction({ ...booking, status: 'awaiting_fee' }, []).action)
      .toBe('upload_booking_fee');
  });
});

describe("what a student's own link may still move", () => {
  test("before any money, their link still decides the next step", () => {
    for (const stage of ["open", "room_reserved", "viewing_scheduled", "invoice_requested"]) {
      expect(studentMayMoveStage(stage)).toBe(true);
    }
  });
  test("once the invoice is out it is staff's booking, not the link's", () => {
    // the link stays live after they pay, and pressing "Request booking
    // invoice" again dragged a booked booking back to Invoice requested -
    // taking View resident off a booking holding their money
    for (const stage of ["awaiting_fee", "awaiting_payment", "booked", "closed"]) {
      expect(studentMayMoveStage(stage)).toBe(false);
    }
  });
  test("a stage nobody recognises is not one a student may move", () => {
    expect(studentMayMoveStage("")).toBe(false);
    expect(studentMayMoveStage(null)).toBe(false);
    expect(studentMayMoveStage("something new")).toBe(false);
  });
});
