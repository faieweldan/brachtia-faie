/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createInvoice,
  getBookingBilling,
  getEnquiry,
  listResidences,
  updateInvoice,
} from "@/lib/admin.functions";
import { allBeds, isSoldAsSingle, useOps } from "@/lib/ops-store";
import { NO_ROOM_TYPES, bedRent, type SiteRoomType } from "@/lib/room-types";
import { invoicePdfUrl, type InvoiceDoc } from "@/lib/invoice-pdf";
import { SCHEDULES } from "@/lib/reference-data";
import { INVOICE_TERMS } from "@/lib/invoice-terms";
import { nextRentalPayment } from "@/lib/rental-schedule";
import { bookingAddonNames, selectedBookingAddons } from "@/lib/booking-quote";
import { Choice } from "@/components/admin/Choice";
import { discountLabel, discountPerMonth, type DiscountType } from "@/lib/invoices";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import {
  addonsFor,
  stayQuote,
  formatDate,
  type Addon,
  type ContractTerm,
  type Occupancy,
  type PaymentTerm,
  type Property,
} from "@/data/properties";

export const Route = createFileRoute("/admin/bookings/$id_/invoice")({
  component: InvoiceGenerator,
  // an invoice already generated, opened to be edited
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["invoice"] === "string" && search["invoice"]
      ? { invoice: search["invoice"] }
      : {}),
  }),
});


const KINDS = [
  { value: "advance", label: "Advance rent" },
  { value: "refundable", label: "Refundable" },
  { value: "onetime", label: "One-time" },
];

const money = (n: number) =>
  `RM${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Line = { label: string; kind: string; amount: number };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * A detail the invoice states. Blank is not a dash - it is something to go and
 * fill in on the booking, so it says so and the invoice waits for it.
 */
function Value({ v, className = "" }: { v?: string | null; className?: string }) {
  const s = String(v ?? "").trim();
  if (!s) {
    return <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Missing</p>;
  }
  return <p className={`text-sm ${className}`}>{s}</p>;
}

function InvoiceGenerator() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: row, isLoading } = useQuery({
    queryKey: ["admin", "enquiry", id],
    queryFn: () => getEnquiry({ data: { id } }),
  });

  const [lines, setLines] = useState<Line[]>([]);
  const [manual, setManual] = useState(false);
  /*
   * The rent an invoice was raised at, when one is being edited.
   *
   * Rent is agreed on the booking and is not typed again here - so a price
   * changed on the website later cannot rewrite money already invoiced. An
   * issued invoice keeps the rent it was issued at, whatever Website says today.
   */
  const [issuedRent, setIssuedRent] = useState<number | null>(null);
  // taken off the monthly rent - everything worked out from rent follows it
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  // a discount is rare - it stays behind a link until someone asks for it
  const [showDiscount, setShowDiscount] = useState(false);
  // why it was given - it becomes the discount line's own words on the invoice
  const [discountNote, setDiscountNote] = useState("");
  const [notes, setNotes] = useState("");
  /*
   * What falls due next. The standard terms go on every invoice now - there is
   * nothing to switch on, so only these two figures are held here, and both are
   * filled in from the rent before anyone touches them.
   */
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("NET15");
  const [ready, setReady] = useState(false);

  /**
   * The booking's money so far: its booking fee invoice, and - when an invoice
   * is being edited - that invoice with its lines. Edit is only offered while
   * nothing is paid on it, and the server refuses otherwise.
   */
  const { invoice: editingId } = Route.useSearch();
  const { data: billing } = useQuery({
    queryKey: ["admin", "billing", id],
    queryFn: () => getBookingBilling({ data: { enquiryId: id } }),
  });
  const editing =
    editingId && (billing as any)?.invoice?.id === editingId ? (billing as any) : null;
  const [loadedEdit, setLoadedEdit] = useState(false);
  useEffect(() => {
    if (!editing || loadedEdit) return;
    const inv = editing.invoice;
    setLines(
      ((editing.items ?? []) as any[]).map((l) => ({
        label: String(l.label ?? ""),
        kind: String(l.kind ?? "onetime"),
        amount: Number(l.amount ?? 0),
      })),
    );
    setManual(true);
    setNotes(String(inv.notes ?? ""));
    if (inv.invoice_date) setInvoiceDate(String(inv.invoice_date));
    if (inv.payment_terms) setPaymentTerms(String(inv.payment_terms));
    // the rent before its discount, then the discount
    const listed = Number(inv.list_rent || inv.monthly_rent);
    if (listed) setIssuedRent(listed);
    if (inv.discount_type && Number(inv.discount_value) > 0) {
      setDiscountType(inv.discount_type as DiscountType);
      setDiscountValue(Number(inv.discount_value));
      setDiscountNote(String(inv.discount_note ?? ""));
      setShowDiscount(true);
    }
    if (inv.payment_frequency) setFrequencyOverride(String(inv.payment_frequency));
    setLoadedEdit(true);
  }, [editing, loadedEdit]);

  const snapshot = (row as any)?.quote_snapshot;
  const r = row as any;

  /* The real assigned room comes from the room assignment made on Booking details. */
  const ops = useOps();
  const assignedBed = useMemo(
    () => allBeds(ops.units).find((b) => b.bed.enquiryId === id),
    [ops.units, id],
  );
  const assignedRoomLabel = assignedBed
    ? `Unit ${assignedBed.unit.unitNo} · Room ${assignedBed.room.letter}`
    : "";
  const assignedRoomDetail = assignedBed
    ? `${assignedBed.room.occupancy === "twin" ? "Twin sharing" : "Single"} · ${assignedBed.bed.label}`
    : "";
  const invoiceRoomName = assignedRoomLabel || r?.room_name || "";

  /*
   * Rent follows the bed the student is placed in, priced the way Homes prices
   * it: a twin bed at the twin rate, a single - or a room taken whole - at the
   * single rate, both from Website. The room's own stored rent is one number
   * for the whole room, so a twin bed was being invoiced the single price.
   * Admin can still override it for exceptions.
   */
  const { data: site } = useQuery({
    queryKey: ["admin", "residences"],
    queryFn: () => listResidences(),
  });
  const roomTypes = (site as { rooms?: SiteRoomType[] } | undefined)?.rooms ?? NO_ROOM_TYPES;
  const roomRent = assignedBed
    ? bedRent(
        roomTypes,
        assignedBed.unit,
        assignedBed.room,
        assignedBed.bed,
        // the other bed held "sold as single" means this student has the room
        assignedBed.room.beds.some((b) => b.id !== assignedBed.bed.id && isSoldAsSingle(b)),
        // a short stay is priced higher than a 12-month one
        r?.term === "short" ? "short" : "long",
      )
    : 0;
  const bookingRent = Number(r?.monthly_rent || snapshot?.quote?.monthlyAfter || 0);
  const autoRent = bookingRent || roomRent;
  // an invoice being edited keeps the rent it was raised at; a new one takes the
  // rent agreed on the booking
  const listRent = issuedRent ?? autoRent;
  const discount = discountPerMonth(listRent, discountType, discountValue);
  const discountName = discount > 0 ? discountLabel(discountType, discountValue) : "";
  // the rent the invoice is worked out from - after the discount
  const rent = listRent - discount;
  // the booking's plan, unless admin picks another for this invoice
  const [frequencyOverride, setFrequencyOverride] = useState<string | null>(null);
  const frequency = frequencyOverride ?? String(r?.payment_term || "bimonthly");

  const property = snapshot?.property as Property | undefined;

  /*
   * Add-ons the student picked, unless admin changes them while raising this
   * invoice - a student who decides on a bedding set after enquiring, or drops
   * one, would otherwise leave admin no way to charge for it.
   *
   * The choice lives on the invoice, not the booking: raising an invoice is not
   * the moment to rewrite the stay the student was quoted.
   */
  const [addonOverride, setAddonOverride] = useState<string[] | null>(null);
  const addonNames = addonOverride ?? bookingAddonNames(r ?? {});
  const offeredAddons = useMemo(
    () => (property ? addonsFor(property, (r?.occupancy ?? "single") as Occupancy) : []),
    [property, r?.occupancy],
  );
  const selectedAddons = useMemo(
    () => (property ? selectedBookingAddons(property, addonNames) : []),
    // addonNames is a fresh array each render; its contents are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [property, addonNames.join(" ")],
  );
  const toggleAddon = (a: Addon) => {
    const on = addonNames.includes(a.id) || addonNames.includes(a.label);
    setAddonOverride(
      on ? addonNames.filter((x) => x !== a.id && x !== a.label) : [...addonNames, a.id],
    );
  };
  const monthlyExtras = selectedAddons
    .filter((a) => a.chargeType === "monthly")
    .reduce((sum, a) => sum + a.price, 0);

  /* Everything on the invoice is derived from monthly rent + payment frequency. */
  const calculated = useMemo<Line[] | null>(() => {
    if (!property || !rent || !r?.move_in || !r?.move_out) return null;
    const term = (r.term === "short" ? "short" : "long") as ContractTerm;
    // every cycle prices itself now, so monthly no longer borrows the bi-monthly
    // one and have its advance line filtered back out afterwards
    const cycle = frequency as PaymentTerm;
    // the lowered rent prices the whole invoice: advance rent and the deposits with it
    // Booking rent already includes recurring extras. Add them only once;
    // keep their names/prices when rebuilding one-time charges as well.
    const baseRent = Math.max(0, rent - monthlyExtras);
    const q = stayQuote(property, baseRent, term, r.move_in, r.move_out, cycle, selectedAddons);
    if (!q) return null;
    return q.firstPayment.map((l) => ({
      label: l.label,
      kind: String(l.kind),
      amount: Number(l.amount || 0),
    }));
  }, [property, rent, monthlyExtras, selectedAddons, frequency, r?.move_in, r?.move_out, r?.term]);

  const snapshotLines = useMemo<Line[]>(
    () =>
      ((snapshot?.quote?.firstPayment as any[] | undefined) ?? []).map((l) => ({
        label: String(l.label ?? ""),
        kind: String(l.kind ?? "onetime"),
        amount: Number(l.amount ?? 0),
      })),
    [snapshot],
  );

  useEffect(() => {
    if (!row || ready) return;
    // an invoice being edited keeps its own date
    if (!editingId) setInvoiceDate(new Date().toISOString().slice(0, 10));
    setReady(true);
  }, [row, ready, editingId]);

  /** Any manual line edit stops the automatic recalculation. */
  const editLines = (fn: (rows: Line[]) => Line[]) => {
    setManual(true);
    setLines(fn);
  };

  /*
   * Auto-fill the lines from the calculation unless admin has typed over them.
   * An invoice opened to be edited starts "manual", so its lines are kept as
   * issued - but the rent and the discount are prices, not line edits, so while
   * the lines still match what the app worked out they follow a change to
   * either. Typed-over lines are left alone and the header says what to do.
   */
  const lastAuto = useRef<Line[] | null>(null);
  useEffect(() => {
    const auto = calculated ?? snapshotLines;
    const untouched =
      !manual ||
      (lastAuto.current !== null && JSON.stringify(lines) === JSON.stringify(lastAuto.current));
    if (!untouched) return;
    lastAuto.current = auto;
    setLines(auto);
  }, [manual, calculated, snapshotLines, lines]);

  // lines were typed over and no longer say what the rent and discount do
  const linesStale =
    manual &&
    discount > 0 &&
    calculated !== null &&
    JSON.stringify(lines) !== JSON.stringify(calculated);


  const total = useMemo(() => lines.reduce((n, l) => n + Number(l.amount || 0), 0), [lines]);
  const deposits = useMemo(
    () => lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + Number(l.amount || 0), 0),
    [lines],
  );

  /*
   * What the student pays next, worked out rather than typed in.
   *
   * The advance rent on this invoice pays the start of the stay; the next
   * payment is the first rent period after that runs out. Both the day and the
   * amount come from the same engine that will later raise the rent invoice, so
   * what this invoice promises is what the schedule actually bills - typing it
   * by hand is how the two came to disagree.
   *
   * Nothing for a full-term stay: that invoice pays the whole tenancy, so there
   * is no next payment to state.
   */
  const nextPayment = useMemo(
    () =>
      nextRentalPayment({
        tenancyStart: String(r?.move_in ?? ""),
        tenancyEnd: String(r?.move_out ?? ""),
        frequency,
        monthlyRent: rent,
        items: lines,
      }),
    [lines, rent, frequency, r?.move_in, r?.move_out],
  );
  const nextPaymentDate = nextPayment?.due ?? "";
  const nextPaymentAmount = nextPayment?.amount ?? 0;

  const roomAssigned = Boolean(assignedBed);

  /*
   * What the invoice states about who it is for and what they are renting. An
   * invoice generated with any of it blank is a document that has to be issued
   * again, so it is not generated at all until the booking has them - Lav, 21
   * Sept 2026. They are filled in on Booking details, never typed here.
   */
  const missingDetails = (
    [
      ["Student", r?.full_name],
      ["Email", r?.email],
      ["Mobile", r?.phone],
      ["Residence", r?.residence_name],
      ["Unit type", r?.unit_type],
      ["Occupancy", r?.occupancy],
      ["Tenancy start", r?.move_in],
      ["Tenancy end", r?.move_out],
    ] as [string, unknown][]
  )
    .filter(([, v]) => !String(v ?? "").trim())
    .map(([k]) => k);

  function clearDiscount() {
    setDiscountValue(0);
    setDiscountNote("");
    setShowDiscount(false);
  }

  const termDays = paymentTerms === "NET30" ? 30 : 15;
  const dueDate = invoiceDate
    ? new Date(new Date(invoiceDate).getTime() + termDays * 86400000)
        .toISOString()
        .slice(0, 10)
    : "";

  const invoiceValues = () => ({
    full_name: r.full_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    university: r.university ?? "",
    nationality: r.nationality ?? "",
    residence_name: r.residence_name ?? "",
    room_name: invoiceRoomName,
    occupancy: r.occupancy ?? "",
    tenancy_start: r.move_in ?? null,
    tenancy_end: r.move_out ?? null,
    monthly_rent: rent,
    list_rent: discount > 0 ? listRent : null,
    discount_type: discount > 0 ? discountType : null,
    discount_value: discount > 0 ? discountValue : 0,
    discount_note: discount > 0 ? discountNote.trim() : "",
    payment_frequency: frequency,
    show_terms: true,
    // only what was actually stated - an empty box is not a date of nothing
    next_payment_date: nextPaymentDate || null,
    next_payment_amount: Number(nextPaymentAmount) > 0 ? Number(nextPaymentAmount) : null,
    notes,
  });

  const create = useMutation({
    mutationFn: () =>
      editing
        ? updateInvoice({
            data: {
              invoiceId: editing.invoice.id,
              items: lines,
              invoiceDate,
              paymentTerms,
              values: invoiceValues(),
            },
          })
        : createInvoice({
            data: {
              enquiryId: id,
              items: lines,
              invoiceDate,
              paymentTerms,
              values: invoiceValues(),
            },
          }),
    onSuccess: (res: any) => {
      toast.success(editing ? `Invoice ${res.number} updated` : `Invoice ${res.number} generated`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-ledger"] });
      void navigate({ to: "/admin/bookings/$id", params: { id } });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not save the invoice"),
  });

  if (isLoading || !row) {
    return <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading booking…</div>;
  }

  function draft(): InvoiceDoc {
    return {
      number: "INV-Draft",
      issued_at: new Date().toISOString(),
      // blank until the booking has made them a resident - a booking invoiced
      // before that has no resident ID to state yet
      ...((billing as any)?.residentCode
        ? { resident_code: String((billing as any).residentCode) }
        : {}),
      invoice_date: invoiceDate || null,
      payment_terms: paymentTerms,
      due_date: dueDate || null,
      reference: r.reference ?? null,
      full_name: r.full_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      university: r.university ?? "",
      nationality: r.nationality ?? "",
      residence_name: r.residence_name ?? "",
      room_name: invoiceRoomName,
      occupancy: r.occupancy ?? "",
      tenancy_start: r.move_in ?? null,
      tenancy_end: r.move_out ?? null,
      monthly_rent: rent,
      ...(discount > 0
        ? {
            list_rent: listRent,
            discount_label: discountName,
            ...(discountNote.trim() ? { discount_note: discountNote.trim() } : {}),
          }
        : {}),
      payment_frequency: frequency,
      show_terms: true,
      next_payment_date: nextPaymentDate || null,
      next_payment_amount: Number(nextPaymentAmount) > 0 ? Number(nextPaymentAmount) : null,
      total,
      deposits_total: deposits,
      notes,
      items: lines,
    };
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <button
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => void navigate({ to: "/admin/bookings/$id", params: { id } })}
      >
        <ArrowLeft className="size-4" /> Back to booking
      </button>

      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {editing ? `Edit ${editing.invoice.number}` : "Invoice generator"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Booking {r.reference ?? r.id} · {r.full_name}
        </p>
      </div>

      {/* Billing Details — read-only summary */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Billing details</h2>
          <Link
            to="/admin/bookings/$id"
            params={{ id }}
            className="text-xs text-brand hover:underline"
          >
            Edit in Booking details →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Student">
            <Value v={r.full_name} className="font-medium" />
          </Field>
          <Field label="Email">
            <Value v={r.email} />
          </Field>
          <Field label="Mobile">
            <Value v={r.phone} />
          </Field>
          <Field label="Residence">
            <Value v={r.residence_name} />
          </Field>
          <Field label="Unit type">
            <Value v={r.unit_type} />
          </Field>
          <Field label="Assigned room">
            {assignedBed ? (
              <>
                <p className="text-sm font-semibold text-foreground">{assignedRoomLabel}</p>
                <p className="text-xs text-muted-foreground">{assignedRoomDetail}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Not assigned</p>
            )}
          </Field>
          <Field label="Occupancy">
            <Value v={r.occupancy} className="capitalize" />
          </Field>
          <Field label="Tenancy start">
            <Value v={r.move_in} />
          </Field>
          <Field label="Tenancy end">
            <Value v={r.move_out} />
          </Field>
          {/* Rent is agreed on the booking and only stated here, so an invoice
              cannot quietly be raised at a price nobody agreed to. A discount is
              the rare exception, and waits behind a link. */}
          <div className="sm:col-span-2">
            <Field label="Monthly rent">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {money(rent)}
                  <span className="font-normal text-muted-foreground"> / month</span>
                </span>
                {discount > 0 ? (
                  <span className="text-xs tabular-nums text-muted-foreground line-through">
                    {money(listRent)}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {issuedRent !== null
                  ? "As invoiced"
                  : roomRent
                    ? "From the assigned room"
                    : "From the booking"}
                {discount > 0 ? ` · ${money(discount)} off each month` : ""}
              </p>
              {showDiscount || discount > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Discount
                  </span>
                  <div
                    role="group"
                    aria-label="Discount"
                    className="flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40"
                  >
                    <input
                      type="number"
                      min={0}
                      value={discountValue || ""}
                      placeholder="0"
                      aria-label="Discount amount"
                      className="w-16 bg-transparent px-2 text-right text-sm tabular-nums outline-none placeholder:text-muted-foreground"
                      onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                    />
                    {(["percent", "amount"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={discountType === type}
                        onClick={() => setDiscountType(type)}
                        className={`border-l border-input px-2.5 text-xs font-medium transition-colors ${
                          discountType === type
                            ? "bg-brand-deep text-white"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {type === "percent" ? "%" : "RM"}
                      </button>
                    ))}
                  </div>
                  {/* the reason fills whatever room is left, so it stops looking
                      like a stray box wedged between two controls */}
                  <Input
                    value={discountNote}
                    placeholder="Why — e.g. Corporate rate"
                    aria-label="Why the discount was given"
                    className="h-8 min-w-40 flex-1 text-sm"
                    onChange={(e) => setDiscountNote(e.target.value)}
                  />
                  {/* the same green dot every other required field carries: a
                      rent below the set price is given with a reason, never
                      bare, and this is the field that says so */}
                  {discount > 0 && !discountNote.trim() ? (
                    <span
                      aria-hidden
                      title="Still empty"
                      className="size-1.5 shrink-0 rounded-full bg-brand"
                    />
                  ) : null}
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={clearDiscount}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
                  onClick={() => setShowDiscount(true)}
                >
                  Add discount
                </button>
              )}
            </Field>
          </div>
          {/* Set on the booking, not here. An invoice states the frequency that
              was agreed; changing it while raising one would leave the invoice
              and the stay disagreeing about what the student signed up to. */}
          <Field label="Payment frequency">
            <Choice value={frequency} readOnly options={SCHEDULES} className="h-8 max-w-56" />
          </Field>
        </div>
        {offeredAddons.length ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Add-ons</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {offeredAddons.map((a) => {
                const on = addonNames.includes(a.id) || addonNames.includes(a.label);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAddon(a)}
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
            <p className="mt-1.5 text-xs text-muted-foreground">
              {addonOverride
                ? "Changed for this invoice only — the booking keeps what the student picked."
                : "Picked by the student on the booking. Tick or untick to charge differently here."}
            </p>
          </div>
        ) : null}
        {!roomAssigned || missingDetails.length ? (
          <div className="mt-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {missingDetails.length ? (
              <p>
                {missingDetails.join(", ")} {missingDetails.length === 1 ? "is" : "are"} still
                blank. Fill {missingDetails.length === 1 ? "it" : "them"} in on the{" "}
                <Link to="/admin/bookings/$id" params={{ id }} className="font-semibold underline">
                  Booking details
                </Link>{" "}
                page before generating the invoice.
              </p>
            ) : null}
            {!roomAssigned ? (
              <p>
                No room is assigned yet. Reserve a room under Room assignment on the{" "}
                <Link to="/admin/bookings/$id" params={{ id }} className="font-semibold underline">
                  Booking details
                </Link>{" "}
                page before generating the invoice.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Invoice settings */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Invoice settings</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Invoice date">
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="h-9"
            />
          </Field>
          <Field label="Payment terms">
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="NET15">NET 15</option>
              <option value="NET30">NET 30</option>
            </select>
          </Field>
          <Field label="Due date">
            <p className="text-sm pt-2">{dueDate || "—"}</p>
          </Field>
        </div>
      </section>

      {/* Line items — accounting-style table */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Initial payment</h2>
            <p className="text-xs text-muted-foreground">
              {manual
                ? "Manually edited — no longer following the rent and payment frequency."
                : `Calculated from ${money(listRent)}/month${discountName ? ` less ${discountName}` : ""} · ${SCHEDULES.find((f) => f.value === frequency)?.label ?? frequency}`}
            </p>
          </div>
          {manual && calculated ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setManual(false);
                setLines(calculated);
              }}
            >
              Recalculate
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => editLines((l) => [...l, { label: "", kind: "onetime", amount: 0 }])}
          >
            <Plus className="size-4" /> Add line
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 font-medium" style={{ width: "140px" }}>Type</th>
                <th className="py-2 pl-3 text-right font-medium" style={{ width: "130px" }}>Amount (RM)</th>
                <th className="py-2" style={{ width: "36px" }} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => (
                <tr key={i} className="group">
                  <td className="py-2 pr-3">
                    <Input
                      value={l.label}
                      placeholder="Description"
                      className="h-8 border-transparent bg-transparent focus-visible:border-input"
                      onChange={(e) =>
                        editLines((rows) =>
                          rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={l.kind}
                      onChange={(e) =>
                        editLines((rows) =>
                          rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)),
                        )
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pl-3">
                    <Input
                      type="number"
                      value={l.amount}
                      className="h-8 text-right"
                      onChange={(e) =>
                        editLines((rows) =>
                          rows.map((x, j) =>
                            j === i ? { ...x, amount: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="invisible text-muted-foreground hover:text-destructive group-hover:visible"
                      onClick={() => editLines((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No lines yet — add the first one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between font-semibold">
            <span>Total initial payment</span>
            <span>{money(total)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Refundable deposits included</span>
            <span>{money(deposits)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Notes on invoice</h2>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note shown on the invoice"
        />

        {/* Always there, never asked for: every invoice carries the same terms,
            so a tick only invited somebody to leave them off by accident. Shown
            as it will print, so nobody has to generate the PDF to find out what
            the student is agreeing to. */}
        <div className="mt-4 border-t border-border pt-4">
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
                Terms &amp; conditions
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
                {INVOICE_TERMS.map((clause) => (
                  <li key={clause}>{clause}</li>
                ))}
              </ol>
            </div>

            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Next billing period">
                  <p className="text-sm font-medium">
                    {nextPayment
                      ? `${formatDate(nextPayment.start)} — ${formatDate(nextPayment.end)}`
                      : "—"}
                  </p>
                </Field>
              </div>
              <Field label="Next payment due">
                <p className="flex h-9 items-center text-sm font-medium">
                  {nextPaymentDate ? formatDate(nextPaymentDate) : "—"}
                </p>
              </Field>
              {/* stated, not typed: it is the rent and the frequency above
                  worked out, and a figure edited here would promise the student
                  something the schedule will not bill */}
              <Field label="Next payment amount">
                <p className="flex h-9 items-center text-sm font-semibold tabular-nums text-foreground">
                  {Number(nextPaymentAmount) > 0 ? money(Number(nextPaymentAmount)) : "—"}
                </p>
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {nextPayment
                  ? "Calculated from advance rent, the discounted monthly rent and payment frequency above."
                  : "No further rental payment is scheduled for these stay details."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Generate sits a long way below the field that disables it, so the
            one thing still outstanding is said here, quietly, on the same line.
            The tooltip stays for the detail - but nobody hovers a dead button,
            so it cannot be the only place this is written down. */}
        {roomAssigned && lines.length > 0 && !create.isPending ? (
          missingDetails.length ? (
            <p className="mr-auto text-xs text-muted-foreground">
              Still blank on the booking: {missingDetails.join(", ")}
            </p>
          ) : discount > 0 && !discountNote.trim() ? (
            <p className="mr-auto text-xs text-muted-foreground">
              Add a reason for the discount to generate this invoice.
            </p>
          ) : null
        ) : null}
        <PdfPreviewButton
          variant="outline"
          disabled={!roomAssigned || lines.length === 0}
          title="Invoice preview"
          fileName="Brachtia-invoice-preview.pdf"
          build={() => invoicePdfUrl(draft())}
        >
          Preview invoice
        </PdfPreviewButton>
        <Button
          disabled={
            !roomAssigned ||
            // the invoice states these - it is not issued with them blank
            missingDetails.length > 0 ||
            lines.length === 0 ||
            create.isPending ||
            // a rent below the set price is given with a reason, never bare
            (discount > 0 && !discountNote.trim())
          }
          title={
            missingDetails.length
              ? `Still blank on the booking: ${missingDetails.join(", ")}`
              : discount > 0 && !discountNote.trim()
                ? "Say why the discount was given"
                : undefined
          }
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Saving…" : editing ? "Save changes" : "Generate invoice"}
        </Button>
      </div>
    </div>
  );
}
