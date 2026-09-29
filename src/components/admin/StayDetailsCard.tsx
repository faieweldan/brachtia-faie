/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Pencil, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Choice } from "@/components/admin/Choice";
import { SHARING_PREFERENCES } from "@/data/form-options";
import { SCHEDULES } from "@/lib/reference-data";
import {
  addonsFor,
  formatRM as money,
  stayQuote,
  termForRange,
  type Occupancy,
  type PaymentTerm,
} from "@/data/properties";
import { fmtDate, isSoldAsSingle, type BedRow } from "@/lib/ops-store";
import { bedRent, offersTerm, wholeUnitRate, type SiteRoomType } from "@/lib/room-types";
import { rowToProperty, rowToRoomType } from "@/lib/site-mappers";
import { roomFitChanged } from "@/lib/stay-fit";
import { bookingAddonNames, selectedBookingAddons, quoteAmountsMatch } from "@/lib/booking-quote";
import { stayLength } from "@/lib/stay-length";
import { DateInput } from "@/components/ui/date-input";
import { BOOKING_FEE, discountPerMonth } from "@/lib/invoices";
import { firstInvoiceLines } from "@/lib/invoice-lines";

/**
 * A booking's stay, worked out the way the website works it out.
 *
 * Admin picks the residence, room, occupancy, dates, payment frequency and
 * add-ons. The rest follows from those and is not typed in: the term from the
 * dates, the monthly rent from the assigned room (or, before one is assigned,
 * from the room preference and occupancy), and the first payment estimation from
 * the same quote the student saw. Update quote rebuilds that quote from the stay.
 */

/*
 * Every cycle the system knows, from the one list of them - so a stay brought
 * in from the master list can be shown and kept as it is, rather than rounded
 * to the nearest of three.
 */
const PAYMENT: { value: PaymentTerm; label: string }[] = SCHEDULES.map((s) => ({
  value: s.value as PaymentTerm,
  label: s.label,
}));

const SHARING_SHORT: Record<string, string> = {
  single: "Single",
  twin: "Twin",
  unit: "Whole unit",
};

type Stay = {
  residenceSlug: string;
  unitType: string;
  roomCode: string;
  occupancy: string;
  moveIn: string;
  moveOut: string;
  paymentTerm: string;
  addons: string[];
};

const fromRow = (row: any): Stay => ({
  residenceSlug: String(row.residence_slug ?? ""),
  unitType: String(row.unit_type ?? ""),
  roomCode: String(row.room_code ?? ""),
  occupancy: String(row.occupancy ?? ""),
  moveIn: String(row.move_in ?? ""),
  moveOut: String(row.move_out ?? ""),
  paymentTerm: String(row.payment_term ?? ""),
  addons: bookingAddonNames(row),
});

const selectClass = "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Why a stay cannot be priced from Website's room types. */
type PriceBlock = null | "no-dates" | "no-room" | "unknown-room" | "whole-unit" | "no-rate";

function Item({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A value worked out from the others - shown, not typed. */
function Derived({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="mt-1 flex h-9 items-center rounded-md bg-muted/60 px-3 text-sm font-medium">
        {children}
      </div>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StayDetailsCard({
  row,
  residences,
  rooms,
  assignedBed,
  canEdit,
  onBlocked,
  onSave,
  invoice,
  onQuoteUpdated,
}: {
  row: any;
  /** residence rows and room type rows - listResidences */
  residences: any[];
  rooms: any[];
  /** the bed reserved for this booking, if any - its rent wins */
  assignedBed?: BedRow | undefined;
  /** a booking is only edited by its staff member */
  canEdit: boolean;
  /** says why, and points at the staff field */
  onBlocked: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<unknown>;
  /** the booking's first invoice, if one has been raised, and what is paid on it */
  invoice?:
    | {
        number: string;
        paid: number;
        /** the invoice row and its lines, to tell whether the stay has moved on from it */
        row?: any;
        items?: any[];
      }
    | null
    | undefined;
  /** after Update quote: bring that invoice into line with the new quote */
  onQuoteUpdated?: (() => Promise<unknown>) | undefined;
}) {
  /*
   * Update quote changes the invoice too, while it can still be changed: no
   * invoice yet, or no more than the booking fee paid on it. Past that, the
   * invoice is what the student is paying against, so the quote is not
   * rewritten under it either - the two would no longer agree.
   */
  const invoiceLocked = Boolean(invoice && invoice.paid > BOOKING_FEE + 0.005);
  /*
   * Once an invoice is raised, the booking is at the invoice stage and the
   * quote stays as it was sent (Dani and Lav, 29 Sep 2026). A reserved room
   * alone does not count. The button then updates the invoice from the stay and leaves the
   * quote alone, so the two can differ - and that difference is how a change
   * after the quote is spotted, not a fault.
   */
  const invoiceStage = Boolean(invoice);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Stay>(() => fromRow(row));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Stay>) => setDraft((d) => ({ ...d, ...patch }));

  /** Everything that follows from a stay: term, rent, add-ons offered, the quote. */
  function work(s: Stay) {
    const resRow = residences.find((r) => r.slug === s.residenceSlug) ?? null;
    const property = resRow ? rowToProperty(resRow) : null;
    const roomRows = resRow ? rooms.filter((r) => r.residence_id === resRow.id) : [];
    /*
     * The booking names its room type by the code Website gave it. A booking made
     * on the site carries that code, but one imported or typed earlier can carry
     * the room's own code or only its name - and a room type not found at all
     * left the rent quietly at whatever was last saved. So it is looked for three
     * ways, and when it is still not found the card says so instead of pricing.
     */
    /*
     * A room reserved for this booking IS its room preference - a stay placed
     * into a bed often names no room of its own. Pricing already knew that and
     * took the rent from the bed, but the room TYPE was only ever looked for
     * under the room preference. So such a stay priced fine and resolved no
     * room type, and Update quote saved everything except the quote snapshot -
     * then said the quote had been updated. The bed names its type, so it is
     * asked when the room preference has nothing to say.
     */
    const bedFits = Boolean(assignedBed) && !roomFitChanged(row, s);
    const roomRow =
      (s.roomCode
        ? (roomRows.find((r) => String(r.code ?? "") === s.roomCode) ??
          roomRows.find((r) => String(r.room_code ?? "") === s.roomCode) ??
          roomRows.find(
            (r) =>
              String(r.name ?? "") === String(row.room_name ?? "") &&
              (!s.unitType || String(r.unit_type ?? "") === s.unitType),
          ))
        : null) ??
      (bedFits && assignedBed
        ? (() => {
            /*
             * The bed names its type by code, but older beds carry the room's
             * own code or only its letter - the same three-way spread the room
             * preference above allows for. A type found under none of them
             * leaves the stay priced from the bed and still unable to quote.
             */
            const wanted = String(assignedBed.room.roomTypeCode ?? "");
            const letter = String(assignedBed.room.letter ?? "");
            const ofUnitType = (r: any) => !s.unitType || String(r.unit_type ?? "") === s.unitType;
            return (
              (wanted
                ? (roomRows.find((r) => String(r.code ?? "") === wanted) ??
                  roomRows.find((r) => String(r.room_code ?? "") === wanted))
                : null) ??
              (letter
                ? roomRows.find((r) => String(r.room_code ?? "") === letter && ofUnitType(r))
                : null) ??
              null
            );
          })()
        : null) ??
      null;
    const roomType = roomRow && resRow ? rowToRoomType(roomRow, resRow.slug) : null;
    const term = s.moveIn && s.moveOut ? termForRange(s.moveIn, s.moveOut) : null;
    // a whole unit is let as one home, so no per-person room rate prices it
    const wholeUnit = s.occupancy === "unit";
    const occupancy: Occupancy = s.occupancy === "twin" ? "twin" : "single";

    let rent = 0;
    let rentFrom = "";
    let blocked: PriceBlock = null;
    // a room that no longer fits the stay is released on save - it prices nothing
    if (bedFits && assignedBed) {
      const soldWhole = assignedBed.room.beds.some(
        (b) => b.id !== assignedBed.bed.id && isSoldAsSingle(b),
      );
      // short and long term are priced differently, so the term goes in with the room
      rent = bedRent(
        rooms as SiteRoomType[],
        assignedBed.unit,
        assignedBed.room,
        assignedBed.bed,
        soldWhole,
        term ?? "long",
      );
      rentFrom = `From the assigned room · Unit ${assignedBed.unit.unitNo} Room ${assignedBed.room.letter}`;
      if (!(rent > 0)) blocked = "no-rate";
    } else if (!term) {
      blocked = "no-dates";
    } else if (wholeUnit) {
      // one rent for the whole apartment, set on the unit type in Website
      const rate = wholeUnitRate(resRow, s.unitType, term);
      if (rate > 0) {
        rent = rate;
        rentFrom = "Whole unit rate for this unit type";
      } else {
        blocked = "whole-unit";
      }
    } else if (!s.roomCode) {
      blocked = "no-room";
    } else if (!roomType) {
      blocked = "unknown-room";
    } else {
      const rate = Number((roomType.rent as any)?.[term]?.[occupancy]) || 0;
      if (rate > 0) {
        rent = rate;
        rentFrom = "From the room preference and occupancy";
      } else {
        blocked = "no-rate";
      }
    }

    const offered = property ? addonsFor(property, occupancy) : [];
    const chosen = property ? selectedBookingAddons(property, s.addons) : [];
    const plan = PAYMENT.find((p) => p.value === s.paymentTerm)?.value ?? "bimonthly";
    const quote =
      property && rent > 0 && term
        ? stayQuote(property, rent, term, s.moveIn, s.moveOut, plan, chosen)
        : null;
    return {
      resRow,
      property,
      roomRows,
      roomType,
      term,
      occupancy,
      rent,
      rentFrom,
      blocked,
      wholeUnit,
      offered,
      quote,
    };
  }

  const saved = work(fromRow(row));
  const live = work(draft);
  const shown = editing ? live : saved;
  // the stay as it stands (or as being edited) would change the invoice
  const invoiceBehind = invoiceStage && invoiceDiffers(editing ? draft : fromRow(row));

  // the quote the student has, against the stay as it now stands
  const snap = row.quote_snapshot as any;
  const hasQuote = Boolean(snap?.property && snap?.room && snap?.quote);
  const quoteStale =
    hasQuote &&
    (snap.moveIn !== row.move_in ||
      snap.moveOut !== row.move_out ||
      snap.occupancy !== row.occupancy ||
      snap.property?.slug !== row.residence_slug ||
      snap.room?.id !== (saved.roomType?.id ?? row.room_code) ||
      ((snap.paymentTerm ?? snap.quote?.paymentTerm) != null &&
        (snap.paymentTerm ?? snap.quote?.paymentTerm) !== row.payment_term) ||
      (saved.quote !== null && !quoteAmountsMatch(snap.quote, saved.quote)));

  function patchFor(s: Stay, w: ReturnType<typeof work>, withQuote: boolean) {
    const roomName = w.roomRows.find((r) => r.code === s.roomCode)?.name;
    return {
      residenceSlug: s.residenceSlug,
      residenceName: w.resRow?.name ?? row.residence_name ?? "",
      unitType: s.unitType,
      roomCode: s.roomCode,
      // cleared along with the room code: a name left behind reads as a room that is still set
      roomName: s.roomCode ? (roomName ?? row.room_name ?? "") : "",
      occupancy: s.occupancy,
      moveIn: s.moveIn,
      moveOut: s.moveOut,
      paymentTerm: s.paymentTerm,
      addons: s.addons,
      ...(w.term ? { term: w.term } : {}),
      ...(w.quote
        ? { monthlyRent: w.quote.monthlyAfter, firstPayment: w.quote.totalUpfront }
        : w.rent > 0
          ? { monthlyRent: w.rent }
          : {}),
      ...(withQuote && w.quote && w.property && w.roomType && w.term
        ? {
            quoteSnapshot: {
              addons: s.addons,
              paymentTerm: s.paymentTerm,
              property: w.property,
              room: w.roomType,
              occupancy: w.occupancy,
              term: w.term,
              moveIn: s.moveIn,
              moveOut: s.moveOut,
              quote: w.quote,
              lead: snap?.lead ?? {
                name: row.full_name ?? "",
                // studying or working, as every other copy of the quote says
                currentStatus: row.current_status ?? "",
                university: row.university ?? "",
                intake: row.intake ?? "",
                // somebody working has an employer where a student has a
                // university; the quote prints whichever they gave
                company: row.company ?? "",
                occupation: row.occupation ?? "",
                nationality: row.nationality ?? "",
                gender: row.gender ?? "",
                email: row.email ?? "",
                mobile: row.phone ?? "",
              },
            },
          }
        : {}),
    };
  }

  /**
   * Whether this stay would put anything different on the invoice - the same
   * question Update invoice answers by rebuilding it, asked without saving.
   * Dates, occupancy, residence and payment cycle are compared as written; the
   * money is compared line by line, worked out the way the invoice would be,
   * with the discount already on the invoice kept.
   */
  function invoiceDiffers(s: Stay) {
    const inv = invoice?.row;
    if (!inv) return false;
    const w = work(s);
    if (!w.quote || !w.property || !w.term) return false;
    const listRent = w.quote.monthlyAfter;
    const rent =
      listRent - discountPerMonth(listRent, inv.discount_type, Number(inv.discount_value || 0));
    const lines =
      firstInvoiceLines({
        property: w.property,
        rent,
        addons: selectedBookingAddons(w.property, s.addons),
        term: w.term,
        moveIn: s.moveIn,
        moveOut: s.moveOut,
        frequency: s.paymentTerm as PaymentTerm,
      }) ?? [];
    const key = (l: any) => `${String(l.label)}|${Number(l.amount || 0).toFixed(2)}`;
    const want = lines.map(key).sort().join("\n");
    const have = (invoice?.items ?? []).map(key).sort().join("\n");
    return (
      want !== have ||
      String(inv.tenancy_start ?? "").slice(0, 10) !== s.moveIn ||
      String(inv.tenancy_end ?? "").slice(0, 10) !== s.moveOut ||
      String(inv.payment_frequency ?? "") !== s.paymentTerm ||
      String(inv.occupancy ?? "") !== s.occupancy ||
      String(inv.residence_name ?? "") !== String(w.resRow?.name ?? row.residence_name ?? "")
    );
  }

  /** Update invoice: save the stay, then rebuild the invoice from it. The quote is not touched. */
  async function persistInvoice(s: Stay) {
    const w = work(s);
    if (!w.quote) {
      toast.error("The invoice needs a room rate, move in and move out");
      return;
    }
    if (invoiceLocked) {
      toast.error("More than the booking fee is paid, so the invoice can no longer change");
      return;
    }
    if (
      invoice &&
      !window.confirm(
        `Update invoice ${invoice.number}?\n\nThe invoice will change to match the stay. The quote stays as it was sent. The invoice is kept in its history as the previous version, and the resident should be sent the new one.`,
      )
    )
      return;
    setBusy(true);
    try {
      await onSave(patchFor(s, w, false));
      if (invoice && onQuoteUpdated) await onQuoteUpdated();
      toast.success(invoice ? "Invoice updated" : "Stay details saved", {
        description: invoice
          ? "It now matches the stay details."
          : "The invoice will be worked out from these when it is generated.",
      });
      setEditing(false);
    } catch {
      // the page already says what went wrong
    } finally {
      setBusy(false);
    }
  }

  async function persist(s: Stay, withQuote: boolean) {
    const w = work(s);
    if (withQuote && !w.quote) {
      toast.error("The quote needs a room rate, move in and move out");
      return;
    }
    if (withQuote && invoiceLocked) {
      toast.error("More than the booking fee is paid, so the quote and invoice can no longer change");
      return;
    }
    if (
      withQuote &&
      invoice &&
      !window.confirm(
        `Update the quote and invoice ${invoice.number}?\n\nThe invoice will change to match the stay. It is kept in its history as the previous version, and the resident should be sent the new one.`,
      )
    )
      return;
    const patch = patchFor(s, w, withQuote);
    /*
     * The snapshot has conditions of its own, so a save could quietly leave it
     * out and still report "Quote updated" - which is how a quote sat out of
     * date through any number of presses, each one saying it had worked. If the
     * quote is not in the patch, this did not update the quote, and says so.
     */
    if (withQuote && !("quoteSnapshot" in patch)) {
      toast.error("The quote needs a room type Website prices", {
        description: "Pick a room preference, then update the quote again.",
      });
      return;
    }
    setBusy(true);
    try {
      await onSave(patch);
      if (withQuote && invoice && onQuoteUpdated) await onQuoteUpdated();
      // the quote is rebuilt from the stay as it now stands, so "out of date"
      // is answered by this save - say so plainly rather than leaving the user
      // to notice the warning has gone
      toast.success(
        withQuote ? (invoice ? "Quote and invoice updated" : "Quote updated") : "Stay details saved",
        {
          ...(withQuote ? { description: "It now matches the stay details." } : {}),
        },
      );
      setEditing(false);
    } catch {
      // the page already says what went wrong
    } finally {
      setBusy(false);
    }
  }

  const unitTypes = Array.from(
    new Set(live.roomRows.map((r) => String(r.unit_type ?? "")).filter(Boolean)),
  );
  const roomChoices = live.roomRows.filter(
    (r) => !draft.unitType || r.unit_type === draft.unitType,
  );
  /*
   * Changing the unit type used to clear the room preference every time. A stay
   * saved that way has no room, so it cannot be priced and its quote can never
   * be brought up to date again - the card sat on "Pick a room preference" with
   * Update quote greyed out for good. The room is only dropped when it really
   * is not a room of the newly picked unit type.
   */
  const roomSurvives = (unitType: string) =>
    Boolean(draft.roomCode) &&
    live.roomRows.some(
      (r) => String(r.code ?? "") === draft.roomCode && String(r.unit_type ?? "") === unitType,
    );
  /*
   * What this stay can be let as. Single and twin come from the room type; a
   * whole unit is not a room, so it is offered when the unit type has a
   * whole-unit rate in Website - whichever room preference is picked, since the
   * apartment is let as one home rather than by the room.
   */
  const wholeUnitOffered = Boolean(wholeUnitRate(live.resRow, draft.unitType, live.term ?? "long"));
  const occupancyChoices = SHARING_PREFERENCES.filter((o) =>
    o.value === "unit"
      ? wholeUnitOffered || draft.occupancy === "unit"
      : !live.roomType || live.roomType.occupancies.includes(o.value as Occupancy),
  );
  // Website sells each room type by term: no rate for this stay's term, not offered
  const draftTerm = live.term;
  const offeredFor = (roomRow: any, occupancy?: string) =>
    !draftTerm || offersTerm(roomRow as SiteRoomType, draftTerm, occupancy);
  const draftRoomRow = live.roomRows.find((r) => r.code === draft.roomCode) ?? null;
  const notOffered = `no ${draftTerm === "short" ? "short-term" : "Standard"} rate`;
  const releasesRoom = editing && Boolean(assignedBed) && roomFitChanged(row, draft);
  const termName = shown.term === "short" ? "short-term" : "Standard";

  /** Why there is no rent - short, because it sits inside the card. */
  const priceProblem = (() => {
    switch (shown.blocked) {
      case "no-dates":
        return "Set move in and move out to price this stay.";
      case "no-room":
        return "Pick a room preference to price this stay.";
      case "unknown-room":
        return `${row.room_name ? `"${row.room_name}"` : "That room"} is not a room type of this residence.`;
      case "whole-unit":
        return `No ${termName} whole-unit rate for ${row.unit_type || "this unit type"} in Website.`;
      case "no-rate":
        return `No ${termName} rate for ${shown.roomType?.name ?? "this room"} (${
          SHARING_SHORT[shown.occupancy] ?? shown.occupancy
        }).`;
      default:
        return "";
    }
  })();

  /*
   * Every room type of the chosen unit type has no rate for this term: the unit
   * type itself is not sold for a stay this long, whichever room is picked.
   */
  const unitTypeWanted = editing ? draft.unitType : String(row.unit_type ?? "");
  const unitTypeRooms = shown.roomRows.filter(
    (r) => !unitTypeWanted || String(r.unit_type ?? "") === unitTypeWanted,
  );
  const unitTypeClosed = Boolean(
    shown.term &&
    unitTypeWanted &&
    unitTypeRooms.length &&
    !unitTypeRooms.some((r) => offersTerm(r as SiteRoomType, shown.term!)),
  );
  const termLabel = shown.term ? (shown.term === "short" ? "Short term" : "Long term") : "—";
  const monthly = shown.quote?.monthlyAfter ?? shown.rent;
  const monthlyAddons = shown.quote && shown.quote.monthlyAfter !== shown.rent;

  function startEditing() {
    // every step on a booking is done by its staff member - this one too
    if (!canEdit) return onBlocked();
    setDraft(fromRow(row));
    setEditing(true);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-brand-deep">Stay details</p>
          {/*
            A stay that cannot be priced has no out-of-date quote - it has no
            quote at all, and saying both left two messages arguing on one card
            while the real problem (no room preference) read as the smaller one.
            The reason it cannot be priced wins, because that is the thing to
            act on.
          */}
          {!editing && priceProblem ? (
            <p className="text-[11px] font-medium text-amber-700">{priceProblem}</p>
          ) : !editing && invoiceBehind ? (
            <p className="text-[11px] font-medium text-amber-700">
              Stay details differ from invoice {invoice?.number}
            </p>
          ) : !editing && quoteStale && !invoiceStage ? (
            <p className="text-[11px] font-medium text-amber-700">Quote is out of date</p>
          ) : !editing && !hasQuote ? (
            <p className="text-[11px] text-muted-foreground">No quote yet</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/* at the invoice stage the button only appears when the stay would
              change the invoice - an edit that changes something, or a stay
              saved without updating it. With nothing different, pressing it
              only saved the same invoice again as a new version (Dani, 29 Sep
              2026) */}
          {invoiceBehind ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || invoiceLocked || !(editing ? live.quote : saved.quote)}
              title={
                invoiceLocked
                  ? "More than the booking fee is paid on the invoice, so it can no longer change"
                  : (editing ? live.quote : saved.quote)
                    ? invoice
                      ? `Updates invoice ${invoice.number} from the stay; the quote stays as sent`
                      : "Saves the stay; the invoice is worked out from it when generated"
                    : priceProblem || "The invoice needs a room rate, move in and move out"
              }
              onClick={() =>
                canEdit ? void persistInvoice(editing ? draft : fromRow(row)) : onBlocked()
              }
            >
              <RefreshCw className="size-4" /> Update invoice
            </Button>
          ) : !invoiceStage && (editing || quoteStale || !hasQuote) ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || invoiceLocked || !(editing ? live.quote : saved.quote)}
              /* a greyed button with no reason on it is the commonest failure
                 there is: the explanation sat in a line above and read as a
                 separate remark rather than as why this cannot be pressed */
              title={
                invoiceLocked
                  ? "More than the booking fee is paid on the invoice, so the quote can no longer change"
                  : (editing ? live.quote : saved.quote)
                  ? invoice
                    ? `Also updates invoice ${invoice.number}`
                    : undefined
                  : priceProblem || "The quote needs a room rate, move in and move out"
              }
              onClick={() =>
                canEdit ? void persist(editing ? draft : fromRow(row), true) : onBlocked()
              }
            >
              <RefreshCw className="size-4" /> Update quote
            </Button>
          ) : null}
          {editing ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => void persist(draft, false)}>
                <Check className="size-4" /> {releasesRoom ? "Save and release room" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                <X className="size-4" /> Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              title={canEdit ? undefined : "Assign a staff member to this booking first"}
              onClick={startEditing}
            >
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/*
        What Website cannot price, in a line each - the card says the rest with
        a dash. Closed up top when not editing: the header already carries the
        price problem there, and printing it twice left two amber lines on one
        card saying the same thing.
      */}
      {[
        unitTypeClosed ? `${unitTypeWanted} has no ${termName} rates in Website.` : "",
        editing ? priceProblem : "",
      ]
        .filter(Boolean)
        .map((note) => (
          <p key={note} className="mb-2 flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
            <span>{note}</span>
          </p>
        ))}

      {releasesRoom && assignedBed ? (
        // said before it happens: saving undoes the reservation and what was built on it
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Saving releases Unit {assignedBed.unit.unitNo} · Room {assignedBed.room.letter} and
          cancels any unpaid invoice. The booking goes back to reserving a room.
        </p>
      ) : null}

      {editing ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Residence</label>
            <select
              value={draft.residenceSlug}
              onChange={(e) => set({ residenceSlug: e.target.value, unitType: "", roomCode: "" })}
              className={selectClass}
            >
              <option value="">—</option>
              {residences.map((r) => (
                <option key={r.id} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Unit type</label>
            <select
              value={draft.unitType}
              onChange={(e) =>
                set({
                  unitType: e.target.value,
                  ...(roomSurvives(e.target.value) ? {} : { roomCode: "" }),
                })
              }
              className={selectClass}
            >
              <option value="">—</option>
              {unitTypes.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Room preference</label>
            <select
              value={draft.roomCode}
              onChange={(e) => set({ roomCode: e.target.value })}
              className={selectClass}
            >
              <option value="">—</option>
              {roomChoices.map((r) => {
                const offered = offeredFor(r);
                return (
                  // the one already on the booking stays selectable, so a saved stay is never stuck
                  <option
                    key={r.code}
                    value={r.code}
                    disabled={!offered && r.code !== draft.roomCode}
                  >
                    {r.name}
                    {offered ? "" : ` — ${notOffered}`}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Occupancy</label>
            <select
              value={draft.occupancy}
              onChange={(e) => set({ occupancy: e.target.value, addons: [] })}
              className={selectClass}
            >
              <option value="">—</option>
              {occupancyChoices.map((o) => {
                const offered =
                  o.value === "unit"
                    ? wholeUnitOffered
                    : !draftRoomRow || offeredFor(draftRoomRow, o.value);
                return (
                  <option
                    key={o.value}
                    value={o.value}
                    disabled={!offered && o.value !== draft.occupancy}
                  >
                    {o.label}
                    {offered ? "" : ` — ${notOffered}`}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Move in</label>
            <DateInput
              value={draft.moveIn}
              onChange={(e) => set({ moveIn: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Move out</label>
            <DateInput
              value={draft.moveOut}
              onChange={(e) => set({ moveOut: e.target.value })}
              className="mt-1"
            />
          </div>
          <Derived label="Term" hint="From move in and move out">
            {termLabel}
          </Derived>
          <Derived label="Stay duration">{stayLength(draft.moveIn, draft.moveOut)}</Derived>
          <Derived
            label="Monthly rent (RM)"
            hint={
              live.rentFrom
                ? `${live.rentFrom}${monthlyAddons ? " · with monthly add-ons" : ""}`
                : "Pick a room preference, occupancy and dates"
            }
          >
            {monthly > 0 ? money(monthly) : "—"}
          </Derived>
          <div>
            <label className="text-xs text-muted-foreground">Payment frequency</label>
            <Choice
              value={draft.paymentTerm}
              onChange={(v) => set({ paymentTerm: v })}
              options={PAYMENT}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Add-ons</label>
            {live.offered.length ? (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {live.offered.map((a) => {
                  const on = draft.addons.includes(a.label) || draft.addons.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set({
                          addons: on
                            ? draft.addons.filter((x) => x !== a.label && x !== a.id)
                            : [...draft.addons, a.label],
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                        on
                          ? "border-brand-deep bg-brand-deep text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {on ? <Check className="size-3" /> : null}
                      {a.label}
                      <span className={on ? "text-primary-foreground/80" : "text-muted-foreground"}>
                        {money(a.price)}
                        {a.chargeType === "monthly" ? "/mo" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                No add-ons for this residence and occupancy
              </p>
            )}
          </div>
          <Derived label="Estimated initial payment (RM)" hint="Worked out like the website quote">
            {live.quote ? money(live.quote.totalUpfront) : "—"}
          </Derived>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Item label="Residence">{row.residence_name || "—"}</Item>
          <Item label="Unit type">{row.unit_type || "—"}</Item>
          <Item label="Room preference">{row.room_name || "—"}</Item>
          <Item label="Occupancy">{SHARING_SHORT[row.occupancy] ?? (row.occupancy || "—")}</Item>
          <Item label="Move in">{row.move_in ? fmtDate(row.move_in) : "—"}</Item>
          <Item label="Move out">{row.move_out ? fmtDate(row.move_out) : "—"}</Item>
          <Item label="Term">{termLabel}</Item>
          <Item label="Stay duration">{stayLength(row.move_in, row.move_out)}</Item>
          <Item
            label="Monthly rent (RM)"
            hint={
              monthly > 0
                ? `${saved.rentFrom}${monthlyAddons ? " · with monthly add-ons" : ""}`
                : Number(row.monthly_rent) > 0
                  ? `Not priced for these dates · last saved ${money(Number(row.monthly_rent))}`
                  : "Not priced for these dates"
            }
          >
            {monthly > 0 ? money(monthly) : "—"}
          </Item>
          <Item label="Payment frequency">
            {PAYMENT.find((p) => p.value === row.payment_term)?.label ?? (row.payment_term || "—")}
          </Item>
          <Item label="Add-ons">
            {bookingAddonNames(row)
              .map((name) => saved.property?.addons?.find((a) => a.id === name)?.label ?? name)
              .join(", ") || "—"}
          </Item>
          <Item
            label="Estimated initial payment (RM)"
            hint={
              saved.quote
                ? undefined
                : Number(row.first_payment) > 0
                  ? `Not worked out for these dates · last saved ${money(Number(row.first_payment))}`
                  : "Not worked out for these dates"
            }
          >
            {saved.quote ? money(saved.quote.totalUpfront) : "—"}
          </Item>
        </dl>
      )}
    </div>
  );
}
