/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Download,
  Eye,
  Link2,
  Mail,
  Phone,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { StageStepper } from "@/components/admin/ops-ui";
import { PdfPreviewButton } from "@/components/admin/PdfPreview";
import { company } from "@/data/properties";
import { WelcomeMessageCard } from "@/components/admin/WelcomeMessageCard";
import { StayDetailsCard } from "@/components/admin/StayDetailsCard";
import { roomFitChanged, stayChanges } from "@/lib/stay-fit";
import { offersTerm, wholeUnitRate, type SiteRoomType } from "@/lib/room-types";
import { RoomMessageCard } from "@/components/admin/RoomMessageCard";
import {
  refreshResidents,
  refreshUnits,
  useOps,
  allBeds,
  updateBed,
  convertRoomOccupancy,
  bedFreeForPeriod,
  isUnitSlot,
  unitAccepts,
  unitGender,
  vacateBed,
  fmtDate,
  type BedRow,
  roomCountFor,
} from "@/lib/ops-store";

type Candidate = { row: BedRow; convert: boolean; blocked?: string };

import {
  STAFF,
  SHARING_PREFERENCES,
  GENDERS,
  HEARD_ABOUT,
  universityAbbr,
} from "@/data/form-options";
import {
  ACTIONS,
  STAGES,
  STAGE_ORDER,
  STAGE_PILL,
  actionLabel,
  nextActionFor,
  stageLabel,
  type ActionKey,
} from "@/lib/bookings-pipeline";
import {
  getBookingActivity,
  recordBookingEvent,
  type ActivityEvent,
  type TrailStep,
} from "@/lib/booking-activity.functions";
import { NEED_STAFF } from "@/lib/booking-events";
import {
  getEnquiry,
  listAppointments,
  listResidenceOptions,
  updateEnquiry,
  advanceEnquiryStage,
  bookViewingForEnquiry,
  assignViewingStaff,
  cancelViewing,
  generateViewingToken,
  getBookingBilling,
  duplicateCandidates,
  duplicatesOf,
  createResidentFromBooking,
  cancelInvoice,
  listResidences,
} from "@/lib/admin.functions";
import { proofOwner, refreshMoney, releaseBookingFor } from "@/lib/billing-client";
import { RecordPaymentDialog, type PayableInvoice } from "@/components/admin/RecordPaymentDialog";
import { GenderMark } from "@/components/admin/GenderMark";
import { SlaCountdown } from "@/components/admin/SlaCountdown";

import { fetchDaySlots } from "@/lib/public.functions";
import { formatSlot } from "@/lib/slots";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as DayPicker } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/bookings/$id")({
  component: BookingDetail,
});

/*
 * Why a booking was closed. "Duplicate" is not just a label: it takes the
 * booking out of the list and points it at the one being kept, so it asks for
 * that booking before it will close.
 */
const CLOSE_DUPLICATE = "Duplicate";
/** "Other" says nothing on its own, so it asks what it was. */
const CLOSE_OTHER = "Other";
const CLOSE_REASONS = ["Lost to competitor", "No response", "Budget", CLOSE_DUPLICATE, "Other"];

const money = (n: number) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

const fullDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const fullDateTime = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/**
 * A Malaysian mobile as wa.me needs it: country code, no plus, no spaces.
 * "012-330 6815" is how it is written here and how it is stored, but wa.me reads
 * it as an unknown number - it wants 60123306815. A number already written with
 * its country code is left alone.
 */
function waNumber(phone: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("60")) return digits;
  return digits.startsWith("0") ? `60${digits.slice(1)}` : digits;
}

function hasSnapshot(row: any) {
  const q = row?.quote_snapshot;
  return Boolean(q && q.property && q.room && (q.quote || (q.moveIn && q.moveOut)));
}

function genderChip(gender?: string) {
  if (!gender) return null;
  const m = gender.charAt(0).toUpperCase() === "M";
  return (
    <span
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        m ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
      }`}
    >
      {gender.charAt(0).toUpperCase()}
    </span>
  );
}

function BookingDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ops = useOps();

  const [editingStudent, setEditingStudent] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  // the booking being kept, when this one is closed as its duplicate
  const [duplicateOf, setDuplicateOf] = useState("");
  // what "Other" actually was - the reason is read months later by someone else
  const [otherReason, setOtherReason] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const { data: row, isLoading } = useQuery({
    queryKey: ["admin", "enquiry", id],
    queryFn: () => getEnquiry({ data: { id } }),
  });

  /*
   * Only fetched once they say "Duplicate" - it reads every open booking, and
   * most closes are not duplicates.
   */
  const { data: dupCandidates } = useQuery({
    queryKey: ["admin", "duplicate-candidates", id],
    enabled: closeReason === CLOSE_DUPLICATE,
    queryFn: () => duplicateCandidates({ data: { enquiryId: id } }),
  });

  /*
   * The bookings closed against this one. Always asked for, not only when
   * something says there are some: staff open the booking they are keeping
   * without knowing anything was closed against it, and that is exactly when
   * they need to be told.
   */
  const { data: duplicates = [] } = useQuery({
    queryKey: ["admin", "duplicates-of", id],
    queryFn: () => duplicatesOf({ data: { enquiryId: id } }),
  });

  /*
   * The booking this one was closed against, when it was one. This is the only
   * place it is said: the list shows a closed booking's stage and nothing more,
   * so what it duplicates is told here, on the booking itself.
   */
  const parentId = String((row as any)?.duplicate_of ?? "");
  const { data: duplicateParent } = useQuery({
    queryKey: ["admin", "enquiry", parentId],
    enabled: !!parentId,
    queryFn: () => getEnquiry({ data: { id: parentId } }),
  });

  const { data: apptData } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const appointments = ((apptData as any)?.appointments ?? []) as any[];

  const { data: resOptions } = useQuery({
    queryKey: ["admin", "residence-options"],
    queryFn: () => listResidenceOptions(),
  });

  // residences and room types: Stay details prices the stay the way the website does
  const { data: site } = useQuery({
    queryKey: ["admin", "residences"],
    queryFn: () => listResidences(),
  });

  /** Maps the snake_case field keys used by EditableCard to the camelCase keys updateEnquiry expects. */
  const FIELD_KEY_MAP: Record<string, string> = {
    full_name: "fullName",
    phone: "phone",
    email: "email",
    nationality: "nationality",
    university: "university",
    gender: "gender",
    intake: "intake",
    heard_about: "heardAbout",
    heard_about_other: "heardAboutOther",
    residence_name: "residenceName",
    residence_slug: "residenceSlug",
    occupancy: "occupancy",
    room_name: "roomName",
    room_code: "roomCode",
    unit_type: "unitType",
    move_in: "moveIn",
    move_out: "moveOut",
    term: "term",
    monthly_rent: "monthlyRent",
    first_payment: "firstPayment",
    payment_term: "paymentTerm",
    message: "message",
  };

  const mutate = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      updateEnquiry({ data: { id, ...input } as any }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save changes"),
  });

  const advance = useMutation({
    mutationFn: (input: {
      to: any;
      note?: string;
      residentId?: string;
      // why it was closed, and - for a duplicate - the booking being kept
      closeReason?: string;
      duplicateOf?: string;
    }) => advanceEnquiryStage({ data: { id, ...input } }),
    onSuccess: () => {
      toast.success("Booking updated");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not update the booking"),
  });

  const beds = useMemo(() => allBeds(ops.units), [ops.units]);
  const linkedBeds = useMemo(() => beds.filter((b) => b.bed.enquiryId === id), [beds, id]);
  const assignedBed = linkedBeds[0];

  const viewing = appointments
    .filter((a) => a.enquiry_id === id && a.status !== "cancelled")
    .sort((x, y) => new Date(x.starts_at).getTime() - new Date(y.starts_at).getTime())[0];

  /* ----- viewing scheduling ----- */
  const [viewingPanel, setViewingPanel] = useState(false);
  const [vDate, setVDate] = useState<Date | undefined>(undefined);
  const [vSlot, setVSlot] = useState<string | null>(null);
  const [vMode, setVMode] = useState<"in_person" | "virtual">("in_person");
  const [vStaff, setVStaff] = useState("");

  const todayDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const vISO = vDate
    ? `${vDate.getFullYear()}-${String(vDate.getMonth() + 1).padStart(2, "0")}-${String(
        vDate.getDate(),
      ).padStart(2, "0")}`
    : "";

  const slotsQuery = useQuery({
    queryKey: ["slots", row?.residence_slug ?? "", vMode, vISO],
    enabled: Boolean(vISO && viewingPanel),
    queryFn: () =>
      fetchDaySlots({
        data: { residenceSlug: (row?.residence_slug as string) ?? "", mode: vMode, date: vISO },
      }),
  });
  const vSlots = slotsQuery.data?.slots ?? [];

  const bookView = useMutation({
    mutationFn: (input: {
      startsAt: string;
      mode: "in_person" | "virtual";
      assignedStaff?: string;
      appointmentId?: string;
    }) => bookViewingForEnquiry({ data: { enquiryId: id, ...input } }),
    onSuccess: () => {
      toast.success("Viewing confirmed");
      setViewingPanel(false);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not book the viewing"),
  });

  const cancelView = useMutation({
    mutationFn: (appointmentId: string) => cancelViewing({ data: { appointmentId } }),
    onSuccess: () => {
      toast.success("Viewing cancelled");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not cancel the viewing"),
  });

  const assignStaff = useMutation({
    mutationFn: (input: { appointmentId: string; assignedStaff: string }) =>
      assignViewingStaff({ data: input }),
    onSuccess: () => {
      toast.success("Viewing staff assigned");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not assign the viewing"),
  });

  const linkGen = useMutation({
    mutationFn: () => generateViewingToken({ data: { enquiryId: id } }),
    onSuccess: (res) => {
      const url = `${window.location.origin}/viewing/${(res as any).token}`;
      void navigator.clipboard.writeText(url);
      toast.success("Booking link copied");
    },
    onError: () => toast.error("Could not create the link"),
  });

  /* ----- billing ----- */
  const { data: billing } = useQuery({
    queryKey: ["admin", "billing", id],
    queryFn: () => getBookingBilling({ data: { enquiryId: id } }),
  });
  // who did what - Recent activity lists it, Booking progress puts names on its steps.
  // Under "admin", so every action on this page refreshes it
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["admin", "activity", id],
    queryFn: () => getBookingActivity({ data: { enquiryId: id } }),
  });
  const invoice = (billing as any)?.invoice ?? null;
  const invoiceItems = ((billing as any)?.items ?? []) as any[];
  const receipts = ((billing as any)?.receipts ?? []) as any[];
  const paidTotal = Number((billing as any)?.paid ?? 0);
  const balanceDue = Number((billing as any)?.balance ?? 0);
  // one invoice: the booking fee the website quotes is the first payment on it
  const BOOKING_FEE = Number(company.bookingFee.replace(/[^0-9.]/g, "")) || 0;

  /**
   * Their money is in, so this booking is a real person with a real payment
   * against it - it cannot be somebody else's enquiry sent twice. Closing it as
   * a duplicate would point a paid booking at another one and strand the
   * payment, so Duplicate stops being offered once the fee is recorded. Every
   * other reason still is: a paid booking can still be lost or cancelled.
   */
  const feePaid = Boolean(row?.fee_received_at || paidTotal > 0);

  /**
   * Payments are recorded in one place. Once the student is a resident, their
   * money is recorded on their Payments tab. Before that - the booking fee - the
   * same Record payment box opens here, and admin then creates the resident.
   */
  const [paying, setPaying] = useState<PayableInvoice | null>(null);

  // every step on a booking is done by someone - its assigned staff member - so
  // nothing happens until one is picked. The server refuses it too.
  const staffRef = useRef<HTMLSelectElement>(null);

  // Next action takes you to where the step is done: the card scrolls into view
  // and is outlined for a moment
  const [flash, setFlash] = useState<string | null>(null);
  function goTo(section: string) {
    setFlash(section);
    // the card can appear a moment later - Welcome Message, once the resident exists
    let tries = 0;
    const find = () => {
      const el = document.getElementById(`booking-${section}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (tries++ < 30) window.setTimeout(find, 100);
    };
    requestAnimationFrame(find);
    window.setTimeout(() => setFlash((f) => (f === section ? null : f)), 2400);
  }
  // a box inside a card, outlined the same way
  const boxClass = (section: string) =>
    `scroll-mt-6 rounded-lg border p-3 transition-shadow duration-500 ${
      flash === section ? "border-brand-deep/40 ring-2 ring-brand-deep/20" : "border-border"
    }`;
  function needStaff() {
    if (row?.assigned_staff) return false;
    toast.error(NEED_STAFF);
    staffRef.current?.focus();
    return true;
  }

  // an invoice nothing is paid on can be cancelled, and generated again
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  async function cancelTheInvoice() {
    if (!invoice || needStaff()) return;
    setCancelling(true);
    try {
      await cancelInvoice({ data: { invoiceId: invoice.id } });
      toast.success("Invoice cancelled");
      setConfirmCancel(false);
      void refreshMoney(queryClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the invoice");
    } finally {
      setCancelling(false);
    }
  }
  /** The payment a receipt was issued for - this billing comes back as the raw rows. */
  function paymentFor(rc: any) {
    return (((billing as any)?.payments ?? []) as any[]).find((p) => p.id === rc?.payment_id);
  }

  /**
   * Whether that payment came with a slip. Uploading one is optional, so the
   * document and the message only promise a proof when there is one.
   */
  const hasProofFor = (rc: any) => Boolean(paymentFor(rc)?.proof_path);

  /** The bank slip behind a receipt, fetched so it can go into the welcome pack. */
  async function loadProof(rc: any) {
    const path = String(paymentFor(rc)?.proof_path ?? "");
    if (!path) return null;
    try {
      const { paymentProofUrl } = await import("@/lib/resident-billing.functions");
      const { url } = await paymentProofUrl({ data: { path } });
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      return { name: path.split("/").pop() ?? "proof", type: blob.type, blob };
    } catch {
      // a proof was uploaded but will not open - say so, rather than quietly
      // sending a document the student is told has three parts and has two
      toast.error("Could not add the payment proof", {
        description: "The invoice and receipt are still attached.",
      });
      return null;
    }
  }

  /** The booking fee: the first payment on the invoice - from the receipt card or Next action. */
  function recordBookingFee() {
    if (!invoice || !row || needStaff()) return;
    const outstanding = Math.max(balanceDue, 0);
    setPaying({
      id: invoice.id,
      number: invoice.number,
      outstanding,
      owner: proofOwner(row.resident_id, id),
      label: row.full_name ?? "",
      title: "Record booking fee",
      description: "Booking fee",
    });
  }

  const next = row ? nextActionFor(row, viewing?.starts_at, viewing?.assigned_staff) : null;

  if (isLoading || !row) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Loading booking…</div>
    );
  }

  // Non-null alias so closures defined below keep the narrowed type.
  const r = row;

  /*
   * When the student said they did not want a viewing. Read through a cast
   * because the generated types predate the column - the table has it, from
   * the 2026-09-21 migration - and read once here rather than cast at each of
   * the places the Viewing card asks for it.
   */
  const viewingSkippedAt = ((row as any).viewing_skipped_at ?? "") as string;

  /** Why it was closed, read the same way and for the same reason as above. */
  const closedReason = ((row as any).close_reason ?? "") as string;

  /*
   * A closed booking is finished with: no room, no viewing, no invoice. The
   * only thing left to do with it is reopen it, so every step that would move
   * it forward is refused rather than quietly working on a dead booking.
   */
  const isClosed = row.status === "closed";

  async function downloadQuote(r: any) {
    if (!hasSnapshot(r)) {
      toast.error("No quote snapshot on this enquiry");
      return;
    }
    setDownloading(true);
    try {
      const { downloadStayQuote } = await import("@/lib/quote-pdf");
      const snap = r.quote_snapshot as any;
      let quote = snap.quote;
      if (!quote) {
        // Older enquiries were saved without a computed quote — rebuild it.
        const { stayQuote, termForRange } = await import("@/data/properties");
        const moveIn = snap.moveIn || r.move_in;
        const moveOut = snap.moveOut || r.move_out;
        const occupancy = snap.occupancy || r.occupancy || "single";
        const term = snap.term || (moveIn && moveOut ? termForRange(moveIn, moveOut) : "long");
        const rent = Number(r.monthly_rent) || snap.room?.rent?.[term]?.[occupancy];
        if (!moveIn || !moveOut || !rent) {
          toast.error("This enquiry is missing dates or a rate — add them in Stay Details first");
          return;
        }
        quote = stayQuote(
          snap.property,
          rent,
          term,
          moveIn,
          moveOut,
          (r.payment_term as any) || "full",
          [],
        );
        snap.term = term;
        snap.occupancy = occupancy;
        snap.moveIn = moveIn;
        snap.moveOut = moveOut;
      }
      await downloadStayQuote({ ...snap, quote, reference: r.reference });
    } catch (err) {
      console.error(err);
      toast.error("Could not build the quotation");
    } finally {
      setDownloading(false);
    }
  }

  function invoiceDoc() {
    return {
      number: invoice.number,
      issued_at: invoice.issued_at,
      reference: r.reference ?? null,
      // the ID the student goes by, once the booking has made them a resident
      ...((billing as any)?.residentCode
        ? { resident_code: String((billing as any).residentCode) }
        : {}),
      full_name: invoice.full_name,
      email: invoice.email,
      phone: invoice.phone,
      university: invoice.university,
      nationality: invoice.nationality,
      residence_name: invoice.residence_name,
      room_name: invoice.room_name,
      occupancy: invoice.occupancy,
      tenancy_start: invoice.tenancy_start,
      tenancy_end: invoice.tenancy_end,
      monthly_rent: Number(invoice.monthly_rent),
      payment_frequency: invoice.payment_frequency,
      total: Number(invoice.total),
      deposits_total: Number(invoice.deposits_total),
      notes: invoice.notes ?? "",
      items: invoiceItems.map((i) => ({
        label: i.label,
        kind: i.kind,
        amount: Number(i.amount),
      })),
      // the same invoice, updated: paid so far and the balance left
      paid: paidTotal,
      // a booking's invoice is the initial payment: each line is one thing at
      // one price, so it carries no Qty or Unit price columns
      kind: "initial" as const,
      /*
       * The terms admin asked for when it was generated, read back off the
       * stored invoice rather than assumed. Without these three the downloaded
       * PDF printed no terms at all while the generator's own preview showed
       * them - the flag simply never travelled this far.
       */
      ...(invoice.show_terms
        ? {
            show_terms: true,
            next_payment_date: invoice.next_payment_date ?? null,
            next_payment_amount:
              invoice.next_payment_amount == null ? null : Number(invoice.next_payment_amount),
          }
        : {}),
    };
  }

  /** A receipt as the PDF shows it, with its payment's method and reference. */
  function receiptDocFor(rc: any) {
    const payment = (((billing as any)?.payments ?? []) as any[]).find(
      (p) => p.id === rc.payment_id,
    );
    return {
      number: rc.number,
      issued_at: rc.issued_at,
      invoiceNumber: invoice?.number ?? "",
      description: payment?.description ?? "",
      paid_to_date: rc.paid_to_date == null ? null : Number(rc.paid_to_date),
      full_name: r.full_name ?? "",
      ...((billing as any)?.residentCode
        ? { resident_code: String((billing as any).residentCode) }
        : {}),
      amount: Number(rc.amount),
      balance_after: Number(rc.balance_after),
      method: payment?.method ?? "",
      reference: payment?.reference ?? "",
      paid_on: payment?.paid_on ?? null,
    };
  }

  /**
   * Once the booking fee is recorded, admin creates the resident: the bed, dates,
   * rent and payment plan come across, and the booking's invoice, payments and
   * receipts show on their profile. The server refuses it before any payment.
   */
  async function createResident(r: any) {
    try {
      const { residentId, residentCode } = await createResidentFromBooking({
        data: { enquiryId: r.id },
      });
      await Promise.all([refreshResidents(), refreshUnits()]);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      // stay on the booking: the welcome message is the next step
      toast.success(residentCode ? `Resident created · ${residentCode}` : "Resident created", {
        ...(residentCode
          ? {}
          : { description: "Their resident ID is given once gender and nationality are saved." }),
        action: {
          label: "View resident",
          onClick: () => void navigate({ to: "/admin/residents/$id", params: { id: residentId } }),
        },
      });
      goTo("welcome");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create resident");
    }
  }

  function viewingEndISO(v: any) {
    return new Date(
      new Date(v.starts_at).getTime() + (v.duration_minutes ?? 30) * 60000,
    ).toISOString();
  }

  function openViewingPanel(v: any | null) {
    setViewingPanel(true);
    setVSlot(v ? (v.starts_at as string) : null);
    setVDate(v ? new Date(v.starts_at) : undefined);
    setVMode(v?.mode === "virtual" ? "virtual" : "in_person");
    setVStaff(v?.assigned_staff ?? "");
  }

  function copyViewingMessage(v: any) {
    const when = new Date(v.starts_at).toLocaleDateString("en-MY", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const text = `Hi ${r.full_name ?? ""}, your viewing is confirmed for ${when} at ${formatSlot(
      v.starts_at,
    )} (${v.mode === "virtual" ? "virtual tour" : "in person"}) at ${
      v.residence_name || r.residence_name || "our residence"
    }. Booking ID: ${r.reference ?? ""}. See you then! — Brachtia Homes`;
    void navigator.clipboard.writeText(text);
    toast.success("Message copied");
  }

  function addToCalendar(v: any) {
    const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Brachtia Homes//Viewing//EN",
      "BEGIN:VEVENT",
      `UID:${v.id}@brachtiahomes.com`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(new Date(v.starts_at).toISOString())}`,
      `DTEND:${stamp(viewingEndISO(v))}`,
      `SUMMARY:Viewing — ${r.full_name ?? ""} (${r.reference ?? ""})`,
      `LOCATION:${v.residence_name || r.residence_name || ""}`,
      `DESCRIPTION:${v.mode === "virtual" ? "Virtual tour" : "In person"}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `viewing-${r.reference ?? v.id}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Each stage's Next action does the real thing. The stage itself moves when
   * that thing happens - a room reserved, a viewing booked, an invoice issued,
   * money recorded - not when the button is pressed.
   */
  function runPrimary(action: ActionKey) {
    if (action !== "view_resident" && needStaff()) return;
    switch (action) {
      case "reserve_room":
        setShowPicker(true);
        goTo("room");
        return;
      case "schedule_viewing":
        openViewingPanel(null);
        goTo("viewing");
        return;
      // the viewing is booked; the staff picker sits on its card
      case "assign_viewing_staff":
        goTo("viewing");
        return;
      // the rest scroll to where the step is done - the button is right there
      case "generate_invoice":
        goTo("invoice");
        return;
      case "upload_booking_fee":
      case "record_payment":
      case "create_resident":
        goTo("payment");
        return;
      case "view_resident":
        if (r.resident_id)
          void navigate({ to: "/admin/residents/$id", params: { id: r.resident_id } });
        return;
      default:
        return;
    }
  }

  async function assignRoom(c: Candidate) {
    if (needStaff()) return;
    const b = c.row;
    const hold = {
      enquiryId: id,
      status: "held" as const,
      holdFor: r.full_name,
      holdUntil: r.move_in ?? undefined,
      gender: r.gender ?? undefined,
      university: universityAbbr(r.university) || undefined,
      nationality: r.nationality || undefined,
    };
    // a single turned twin gets new beds: the hold goes into that same change and
    // save, or it lands on a bed that no longer exists. The save is waited for, so
    // a room that did not save is never reported reserved and the stage stays put
    if (c.convert) {
      try {
        await convertRoomOccupancy(b.room.id, "twin", hold);
      } catch (err) {
        toast.error("Could not reserve the room", {
          description: err instanceof Error ? err.message : "The room was not changed",
        });
        return;
      }
    } else updateBed(b.bed.id, hold);
    const bedId = c.convert ? b.room.id : b.bed.id;
    // the bed is held in the browser, so its audit row is written from here
    void recordBookingEvent({
      data: {
        enquiryId: id,
        kind: "room_reserved",
        ref: bedId,
        summary: `Room ${b.unit.unitNo} ${b.room.letter} reserved`,
      },
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["admin", "activity", id] }))
      .catch(() => undefined);
    // reserving a room moves a New booking on; a room changed later leaves the stage alone
    if (r.status === "open") advance.mutate({ to: "room_reserved" });
    toast.success(
      c.convert
        ? `${b.unit.unitNo} · Room ${b.room.letter} reconfigured to Twin — 1 of 2 reserved`
        : `Room ${b.unit.unitNo} · ${b.room.letter} reserved`,
    );
    setShowPicker(false);
    setOpenUnitId(null);
  }

  /**
   * Release the reserved room. The same rule as Release in Homes: a paid student
   * is moved, not released, and an unpaid booking's invoice is cancelled along
   * with the room. The server then works the stage out again, so Next action,
   * Booking progress and Recent activity follow. Says whether it was released.
   */
  async function releaseRoom(paidMessage: string) {
    if (!assignedBed || needStaff()) return false;
    const released = await releaseBookingFor(queryClient, id, paidMessage);
    if (!released) return false;
    const { room } = assignedBed;
    // emptied completely, the same as Release in Homes - clearing only the hold
    // left the student's university, nationality and gender on an empty bed
    vacateBed(assignedBed.bed.id);
    // revert an auto-converted twin back to single when nobody else is in it
    if (
      room.occupancy === "twin" &&
      room.beds.every((b) => b.id === assignedBed.bed.id || b.status === "vacant")
    ) {
      void convertRoomOccupancy(room.id, "single");
    }
    return true;
  }

  async function clearRoom() {
    if (
      await releaseRoom(
        "This student has paid, so the bed is kept. Move them to another bed in Homes instead.",
      )
    )
      toast.success("Room released");
  }

  const wantedOcc = (r.occupancy || "single") as string;

  // the room types as Website sets them up - which unit type each belongs to
  const siteRooms = ((site as any)?.rooms ?? []) as SiteRoomType[];
  const candidates: Candidate[] = [];
  for (const b of beds) {
    // men and women never share a unit - not even with "Show all rooms" on
    if (!unitAccepts(b.unit, ops.residents, r.gender)) continue;
    // a unit is let whole or by room, never both: a whole unit is only for a
    // Whole unit request, through its Unit bed, and nobody asking for a single
    // or a twin is offered any part of it
    const wholeUnit = b.unit.rooms.some((rm) => isUnitSlot(rm));
    const wrongShape = wantedOcc === "unit" ? !isUnitSlot(b.room) : wholeUnit;
    const roomBeds = b.room.beds;
    const bedFree = bedFreeForPeriod(b.bed, r.move_in, r.move_out);
    const roomEmpty = roomBeds.every((x) => bedFreeForPeriod(x, r.move_in, r.move_out));
    const unitEmpty = b.unit.rooms.every((rm) =>
      rm.beds.every((x) => bedFreeForPeriod(x, r.move_in, r.move_out)),
    );

    if (showAllRooms) {
      if (!bedFree) continue;
      if (roomBeds[0]?.id !== b.bed.id && b.room.occupancy === "single") continue;
      // honour the student's sharing preference even in override mode
      let convert = false;
      let blocked: string | undefined;
      if (wantedOcc === "twin") {
        if (isUnitSlot(b.room)) {
          blocked = "Whole unit";
        } else if (b.room.occupancy === "single") {
          if (roomEmpty) convert = true;
          else blocked = "Single room already occupied";
        }
      } else if (wantedOcc === "single") {
        if (b.room.occupancy === "twin") blocked = "Twin room";
        else if (isUnitSlot(b.room)) blocked = "Whole unit";
      } else if (wantedOcc === "unit" && !unitEmpty) {
        blocked = "Unit not fully empty";
      }
      if (wrongShape) {
        convert = false;
        blocked = wantedOcc === "unit" ? "Not a whole unit" : "Whole unit";
      }
      candidates.push({ row: b, convert, ...(blocked ? { blocked } : {}) });
      continue;
    }

    if (!bedFree) continue;
    // every free bed is its own row - a twin room with both beds free lists Twin 1 and Twin 2

    if (wrongShape) continue;
    if (r.residence_slug && b.unit.residenceSlug !== r.residence_slug) continue;
    // exactly the room type asked for - a Room A request sees Room A. A room with
    // no type set used to slip through as a match; it now waits for Show all rooms
    if (r.room_code && b.room.roomTypeCode !== r.room_code) continue;
    // and only in the unit type that room type is set up for in Website. Rooms
    // imported with another unit type's room type (a 4-bedroom's Room A tagged as
    // the 3-bedroom's) would otherwise be offered for the wrong kind of unit
    const wantedType = siteRooms.find((type) => type.code === r.room_code);
    if (
      wantedType?.unit_type &&
      b.unit.unitType &&
      roomCountFor(String(wantedType.unit_type)) !== roomCountFor(b.unit.unitType)
    )
      continue;

    if (wantedOcc === "unit") {
      if (!unitEmpty) continue;
      candidates.push({ row: b, convert: false });
    } else if (wantedOcc === "twin") {
      if (b.room.occupancy === "twin") candidates.push({ row: b, convert: false });
      // a whole unit is several bedrooms let as one - folding it into a single
      // twin room would lose them, so it is never offered to a twin. To put a
      // student in a whole unit, the sharing preference is changed to Whole unit
      else if (roomEmpty && !isUnitSlot(b.room)) candidates.push({ row: b, convert: true });
    } else {
      if (b.room.occupancy === "single") candidates.push({ row: b, convert: false });
    }
  }

  /*
   * Website prices each room type by term, and a blank rate there means that
   * stay is not sold for the room - a 4-bedroom room with no short-term rate
   * cannot take a six-month booking. Those rows are still listed, so it is plain
   * why the room is not available, but they cannot be reserved.
   */
  const stayTerm = r.term === "short" ? "short" : r.term === "long" ? "long" : null;
  if (stayTerm) {
    for (const c of candidates) {
      if (c.blocked) continue;
      const termName = stayTerm === "short" ? "short-term" : "12-month";
      // a whole unit is one let of the apartment, priced by unit type
      if (wantedOcc === "unit" || isUnitSlot(c.row.room)) {
        const residenceRow = ((site as any)?.residences ?? []).find(
          (res: any) => res.slug === c.row.unit.residenceSlug,
        );
        if (!wholeUnitRate(residenceRow, String(c.row.unit.unitType ?? ""), stayTerm)) {
          c.blocked = `No ${termName} whole-unit rate`;
        }
        continue;
      }
      const type = siteRooms.find((t) => t.code === c.row.room.roomTypeCode);
      const occupancy = c.convert || c.row.room.occupancy === "twin" ? "twin" : "single";
      if (type && !offersTerm(type, stayTerm, occupancy)) {
        c.blocked = `No ${termName} rate`;
      }
    }
  }

  // a twin bed that is ready comes before a single that has to be converted,
  // and anything blocked sits at the bottom; within each, inventory order holds
  const rank = (c: Candidate) => (c.blocked ? 2 : c.convert ? 1 : 0);
  candidates.sort((a, b) => rank(a) - rank(b));

  const matches = candidates.filter((c) => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return true;
    return `${c.row.unit.unitNo} ${c.row.room.letter} ${c.row.unit.residenceName}`
      .toLowerCase()
      .includes(q);
  });

  const SHARING_SHORT: Record<string, string> = {
    single: "Single",
    twin: "Twin",
    unit: "Whole unit",
  };

  const studentFields = [
    ["full_name", "Name", "text"],
    ["gender", "Gender", "gender"],
    ["phone", "Phone", "text"],
    ["email", "Email", "text"],
    ["nationality", "Nationality", "text"],
    ["university", "University", "text"],
    ["intake", "Intake", "text"],
    ["heard_about", "Heard about us", "heard"],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header strip */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/bookings" })}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-deep hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to bookings
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-brand-deep">{row.full_name}</h1>
            {genderChip(row.gender)}
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                STAGE_PILL[row.status] ?? "border-border bg-muted text-muted-foreground"
              }`}
            >
              {stageLabel(row.status)}
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">
            {row.reference}
          </p>
          <p className="text-xs text-muted-foreground">Submitted {fullDateTime(row.created_at)}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{universityAbbr(row.university) || "—"}</span>
            <span>·</span>
            <span>Move in {fullDate(row.move_in)}</span>
            <span>·</span>
            <span>{SHARING_SHORT[row.occupancy] ?? row.occupancy}</span>
            <span>·</span>
            <span className="truncate">{row.room_name || "—"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* a booking is never left without someone on it: staff is changed, not removed */}
          <select
            ref={staffRef}
            value={row.assigned_staff ?? ""}
            onChange={(e) => e.target.value && mutate.mutate({ assignedStaff: e.target.value })}
            className={`h-9 rounded-md border bg-background px-2 text-xs ${
              row.assigned_staff ? "border-input" : "border-amber-400 text-amber-900"
            }`}
          >
            {row.assigned_staff ? null : (
              <option value="" disabled>
                Assign staff
              </option>
            )}
            {STAFF.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {row.email ? (
            <Button asChild size="sm" variant="outline">
              <a
                href={`mailto:${row.email}?subject=${encodeURIComponent(
                  `Your Brachtia Homes enquiry${row.reference ? ` · ${row.reference}` : ""}`,
                )}`}
              >
                <Mail className="size-4" /> Email
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled title="No email on this booking">
              <Mail className="size-4" /> Email
            </Button>
          )}
          {waNumber(row.phone) ? (
            <Button asChild size="sm" variant="outline">
              <a
                href={`https://wa.me/${waNumber(row.phone)}?text=${encodeURIComponent(
                  `Hi ${row.full_name || "there"}, this is ${
                    row.assigned_staff || "the team"
                  } from Brachtia Homes.`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <Phone className="size-4" /> WhatsApp
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled title="No phone number on this booking">
              <Phone className="size-4" /> WhatsApp
            </Button>
          )}
          {/* one button: download the quote, or look at it first */}
          <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-background shadow-xs">
            <Button
              size="sm"
              variant="ghost"
              className="h-full rounded-none"
              disabled={!hasSnapshot(row) || downloading}
              onClick={() => void downloadQuote(row)}
            >
              <Download className="size-4" />
              {downloading ? "Preparing…" : "Quote"}
            </Button>
            <PdfPreviewButton
              size="sm"
              variant="ghost"
              className="h-full rounded-none border-l border-input px-2.5"
              disabled={!hasSnapshot(row)}
              aria-label="Preview quote"
              title={`Quote ${row.reference ?? ""}`.trim()}
              fileName={`Brachtia-Quote-${row.reference ?? "booking"}.pdf`}
              build={async () =>
                (await import("@/lib/quote-pdf")).quotePdfUrl({
                  ...(row.quote_snapshot as any),
                  reference: row.reference,
                })
              }
            >
              <Eye className="size-4" />
            </PdfPreviewButton>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-5">
          {/* Student details */}
          <EditableCard
            title="Student details"
            editing={editingStudent}
            onEdit={() => setEditingStudent(true)}
            onCancel={() => setEditingStudent(false)}
            onSave={() => setEditingStudent(false)}
            fields={studentFields}
            row={row}
            onSaveField={(k, v) => mutate.mutate({ [FIELD_KEY_MAP[k] ?? k]: v })}
            resOptions={resOptions ?? []}
          />

          {/* Stay details */}
          <StayDetailsCard
            row={row}
            residences={((site as any)?.residences ?? []) as any[]}
            rooms={((site as any)?.rooms ?? []) as any[]}
            assignedBed={assignedBed}
            canEdit={Boolean(row.assigned_staff)}
            onBlocked={() => void needStaff()}
            onSave={async (patch) => {
              // a new room type, unit type, residence or occupancy: the reserved room was
              // picked for the old one, so it is released first and a matching one reserved again
              if (assignedBed && roomFitChanged(row, patch)) {
                const released = await releaseRoom(
                  "This student has paid, so the room is kept. Move them to another bed in Homes before changing the room or occupancy.",
                );
                if (!released) throw new Error("Room kept");
                toast.success("Room released", {
                  description: "Reserve a room that matches the new stay.",
                });
              }
              // the booking's log says what moved and who moved it
              const changed = stayChanges(row, patch);
              const saved = await mutate.mutateAsync(patch);
              if (changed.length) {
                void recordBookingEvent({
                  data: {
                    enquiryId: id,
                    kind: "stay_updated",
                    summary: `Stay details · ${changed.join(", ")}`,
                  },
                })
                  .then(() => queryClient.invalidateQueries({ queryKey: ["admin", "activity", id] }))
                  .catch(() => undefined);
              }
              return saved;
            }}
          />

          {row.message ? (
            <Card title="Student message">
              <p className="rounded-lg bg-muted p-3 text-sm">{row.message}</p>
            </Card>
          ) : null}

          {/* Room assignment */}
          <Card title="Room assignment" id="booking-room" flash={flash === "room"}>
            {assignedBed && !showPicker ? (
              <div>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">
                      {assignedBed.unit.residenceName}
                    </p>
                    <p className="font-medium text-foreground">
                      Unit {assignedBed.unit.unitNo} · Room {assignedBed.room.letter}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {assignedBed.room.occupancy === "twin" ? "Twin sharing" : "Single"} ·{" "}
                      {assignedBed.bed.label}
                    </p>
                    <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      RESERVED
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Reserved {row.stage_changed_at ? fullDate(row.stage_changed_at) : "—"} by{" "}
                      {row.assigned_staff || "staff"}
                    </p>
                  </div>
                  {/* releasing a bed from a closed booking would put a room back
                      in play on the strength of an enquiry nobody is working */}
                  <Button size="sm" variant="outline" disabled={isClosed} onClick={clearRoom}>
                    Change room
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {assignedBed ? (
                  <p className="text-sm text-muted-foreground">
                    Currently {assignedBed.unit.unitNo} · {assignedBed.room.letter} — pick a
                    different room below.
                  </p>
                ) : null}
                {/* what the student asked for, so each match can be checked against it */}
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Student wants
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                      r.residence_name,
                      r.room_name,
                      SHARING_SHORT[wantedOcc] ?? wantedOcc,
                      r.move_in
                        ? `${fmtDate(r.move_in)} → ${fmtDate(r.move_out ?? undefined)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .map((v) => (
                        <span
                          key={String(v)}
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-foreground"
                        >
                          {v}
                        </span>
                      ))}
                    <GenderMark gender={r.gender ?? undefined} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      placeholder="Search unit / room ID..."
                      className="pl-9"
                    />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {matches.length} {matches.length === 1 ? "match" : "matches"}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setShowAllRooms((v) => !v)}>
                    {showAllRooms ? "Show matching rooms" : "Show all rooms"}
                  </Button>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[1fr_0.8fr_1.2fr_0.6fr] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Unit</span>
                    <span>Room</span>
                    <span>Config</span>
                    <span>Action</span>
                  </div>
                  {matches.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-muted-foreground">
                      No rooms match this student&apos;s residence, room type, stay dates, gender
                      and sharing preference. Use “Show all rooms” to override.
                    </p>
                  ) : (
                    matches.map((c, i) => {
                      const b = c.row;
                      // a unit is named once; its other free beds sit under it
                      const firstOfUnit = i === 0 || matches[i - 1]!.row.unit.id !== b.unit.id;
                      const lastOfUnit =
                        i === matches.length - 1 || matches[i + 1]!.row.unit.id !== b.unit.id;
                      const open = openUnitId === b.unit.id;
                      // the bed this row reserves: Twin 1 and Twin 2 are separate rows
                      const config = c.convert
                        ? "Single → Twin"
                        : isUnitSlot(b.room)
                          ? "Unit"
                          : b.room.occupancy === "twin"
                            ? b.bed.label
                            : "Single";
                      return (
                        <div
                          key={b.bed.id}
                          className={firstOfUnit && i > 0 ? "border-t border-border" : ""}
                        >
                          <div className="grid grid-cols-[1fr_0.8fr_1.2fr_0.6fr] items-center gap-2 px-3 py-2 text-xs">
                            {firstOfUnit ? (
                              <span className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setOpenUnitId(open ? null : b.unit.id)}
                                  className="text-left font-semibold text-foreground underline-offset-2 hover:underline"
                                >
                                  {b.unit.unitNo}
                                </button>
                                {/*
                                  Men and women never share a unit, and the first
                                  person in settles which it is. So the unit says
                                  who is already there; an empty unit says nothing,
                                  because it will take either.
                                */}
                                <GenderMark
                                  gender={unitGender(b.unit, ops.residents)}
                                  title={`${unitGender(b.unit, ops.residents)} unit`}
                                />
                              </span>
                            ) : (
                              <span aria-hidden />
                            )}
                            <span className="text-foreground">
                              {isUnitSlot(b.room) ? "Whole unit" : `Room ${b.room.letter}`}
                            </span>
                            <span className="text-muted-foreground">
                              {config}
                              {c.blocked ? (
                                <span className="block text-[10px] text-amber-600">
                                  {c.blocked}
                                </span>
                              ) : null}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!!c.blocked}
                              title={c.blocked ?? ""}
                              onClick={() => void assignRoom(c)}
                            >
                              Select
                            </Button>
                          </div>
                          {/* the unit's details open once, under its last row */}
                          {open && lastOfUnit ? (
                            <div className="space-y-2 border-t border-border bg-muted/30 px-3 py-3 text-xs">
                              <p className="text-muted-foreground">
                                {[
                                  b.unit.unitType,
                                  b.unit.block && `Block ${b.unit.block}`,
                                  b.unit.floor && `Floor ${b.unit.floor}`,
                                  b.unit.gender,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {b.unit.notes ? (
                                <p className="text-muted-foreground">{b.unit.notes}</p>
                              ) : null}
                              <div className="space-y-1">
                                {b.unit.rooms.map((rm) => (
                                  <div
                                    key={rm.id}
                                    className="rounded-md border border-border bg-background p-2"
                                  >
                                    <p className="font-medium text-foreground">
                                      Room {rm.letter} ·{" "}
                                      {rm.occupancy === "twin" ? "Twin" : "Single"}
                                    </p>
                                    {rm.beds.map((bd) => (
                                      <p key={bd.id} className="text-muted-foreground">
                                        {bd.label}:{" "}
                                        {bd.residentName || bd.holdFor
                                          ? `${bd.residentName ?? bd.holdFor}${bd.university ? ` · ${bd.university}` : ""}${bd.nationality ? ` · ${bd.nationality}` : ""}${bd.tenancyStart || bd.tenancyEnd ? ` · ${fmtDate(bd.tenancyStart)} – ${fmtDate(bd.tenancyEnd)}` : ""}`
                                          : "Vacant"}
                                      </p>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              <Button
                                size="sm"
                                disabled={!!c.blocked}
                                onClick={() => void assignRoom(c)}
                              >
                                {c.blocked ? c.blocked : `Select room ${b.room.letter} · ${config}`}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                {assignedBed ? (
                  <Button size="sm" variant="ghost" onClick={() => setShowPicker(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            )}
            {/* the student hears back once there is an answer - a room reserved, or no room
                matching what they asked for - until a viewing is booked. Written afresh when the
                stay or the room changes, and not while a reserved room is being changed */}
            {!viewing &&
            (row.status === "open" || row.status === "room_reserved") &&
            !(assignedBed && showPicker) &&
            (assignedBed || (!showAllRooms && matches.length === 0)) ? (
              <RoomMessageCard
                key={[
                  row.residence_slug,
                  row.room_code,
                  row.occupancy,
                  assignedBed?.bed.id ?? "no-room",
                ].join(":")}
                enquiryId={id}
                studentName={row.full_name ?? ""}
                staffName={row.assigned_staff ?? ""}
                residenceName={assignedBed?.unit.residenceName || row.residence_name || ""}
                roomType={row.room_name ?? ""}
                phone={row.phone ?? ""}
                email={row.email ?? ""}
                roomReserved={Boolean(assignedBed)}
              />
            ) : null}
          </Card>

          {/* Viewing */}
          <Card title="Viewing" id="booking-viewing" flash={flash === "viewing"}>
            {viewing && !viewingPanel ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="size-5 text-brand-deep" />
                    <div>
                      <p className="font-medium text-foreground">
                        {new Date(viewing.starts_at).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        · {formatSlot(viewing.starts_at)} – {formatSlot(viewingEndISO(viewing))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {viewing.residence_name || row.residence_name || "—"} ·{" "}
                        {viewing.mode === "virtual" ? "Virtual tour" : "In person"}
                      </p>
                      {viewing.assigned_staff ? (
                        <p className="text-xs text-muted-foreground">
                          Assigned: {viewing.assigned_staff}
                        </p>
                      ) : (
                        // a student booked this through their own link, which names nobody
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <p className="text-xs font-medium text-amber-700">
                            Nobody is taking this viewing
                          </p>
                          <select
                            value=""
                            disabled={assignStaff.isPending}
                            aria-label="Who takes this viewing"
                            onChange={(e) => {
                              if (!e.target.value || needStaff()) return;
                              assignStaff.mutate({
                                appointmentId: viewing.id as string,
                                assignedStaff: e.target.value,
                              });
                            }}
                            className="h-8 rounded-md border border-amber-400 bg-background px-2 text-xs text-amber-900"
                          >
                            <option value="" disabled>
                              Assign staff
                            </option>
                            {STAFF.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-deep">
                    {viewing.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyViewingMessage(viewing)}>
                    Copy message
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addToCalendar(viewing)}>
                    Add to calendar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openViewingPanel(viewing)}>
                    Reschedule
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (!needStaff() && confirm("Cancel this viewing?"))
                        cancelView.mutate(viewing.id);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : viewingPanel ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Date</p>
                    <div className="rounded-lg border border-border p-1">
                      <DayPicker
                        mode="single"
                        selected={vDate}
                        onSelect={setVDate}
                        disabled={{ before: todayDate }}
                        className="pointer-events-auto"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Mode</p>
                      <select
                        value={vMode}
                        onChange={(e) => setVMode(e.target.value as "in_person" | "virtual")}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="in_person">In person</option>
                        <option value="virtual">Virtual tour</option>
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">
                        Available times
                      </p>
                      {!vISO ? (
                        <p className="text-sm text-muted-foreground">Pick a date first.</p>
                      ) : slotsQuery.isLoading ? (
                        <p className="text-sm text-muted-foreground">Loading times…</p>
                      ) : vSlots.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No times available on this date.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {vSlots.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setVSlot(s)}
                              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                                vSlot === s
                                  ? "border-brand bg-brand text-white"
                                  : "border-border hover:border-brand/50"
                              }`}
                            >
                              {formatSlot(s)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">
                        Assigned staff
                      </p>
                      {/* someone is always responsible for a viewing - it cannot be booked without */}
                      <select
                        value={vStaff}
                        onChange={(e) => setVStaff(e.target.value)}
                        className={`h-9 w-full rounded-md border bg-background px-2 text-sm ${
                          vStaff ? "border-input" : "border-amber-400"
                        }`}
                      >
                        <option value="" disabled>
                          Choose who takes the viewing
                        </option>
                        {STAFF.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setViewingPanel(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!vSlot || !vStaff || bookView.isPending}
                    onClick={() =>
                      !needStaff() &&
                      bookView.mutate({
                        startsAt: vSlot as string,
                        mode: vMode,
                        assignedStaff: vStaff,
                        ...(viewing ? { appointmentId: viewing.id as string } : {}),
                      })
                    }
                  >
                    Confirm viewing
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* a student who said no to a viewing and one who simply has not
                    answered looked the same here - which is exactly why staff
                    could not tell whether there was anybody left to chase */}
                {viewingSkippedAt ? (
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 size-5 shrink-0 text-brand" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Student chose to go ahead without a viewing
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fullDateTime(viewingSkippedAt)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Calendar className="size-5" />
                    <p className="text-sm">No viewing scheduled yet</p>
                  </div>
                )}
                {/* a viewing is booked once the room is reserved - not before, not
                    after the invoice. Skipping is not final: a student messages to
                    say they have changed their mind, and staff book one from here. */}
                {row.status === "room_reserved" ||
                row.status === "viewing_scheduled" ||
                viewingSkippedAt ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      // no viewing on a closed booking - reopen it first
                      disabled={isClosed}
                      onClick={() => openViewingPanel(null)}
                    >
                      {viewingSkippedAt ? "Book a time anyway" : "Book a time"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={linkGen.isPending || isClosed}
                      onClick={() => linkGen.mutate()}
                    >
                      <Link2 className="size-4" /> Generate viewing link
                    </Button>
                  </div>
                ) : row.status === "open" ? (
                  <p className="text-xs text-muted-foreground">Reserve a room first</p>
                ) : null}
              </div>
            )}
          </Card>

          {/* Documents & payment */}
          <Card title="Documents & payment">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">Quote</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hasSnapshot(row) ? "Generated" : "Not generated"}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    disabled={!hasSnapshot(row) || downloading}
                    onClick={() => void downloadQuote(row)}
                  >
                    <Download className="size-4" /> Download
                  </Button>
                  <PdfPreviewButton
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={!hasSnapshot(row)}
                    aria-label="Preview quote"
                    title={`Quote ${row.reference ?? ""}`.trim()}
                    fileName={`Brachtia-Quote-${row.reference ?? "booking"}.pdf`}
                    build={async () =>
                      (await import("@/lib/quote-pdf")).quotePdfUrl({
                        ...(row.quote_snapshot as any),
                        reference: row.reference,
                      })
                    }
                  >
                    <Eye className="size-4" />
                  </PdfPreviewButton>
                </div>
              </div>

              <div id="booking-invoice" className={boxClass("invoice")}>
                <p className="text-sm font-medium text-foreground">Invoice</p>
                {invoice ? (
                  <>
                    {/* opened in place, the same way as a receipt below it */}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground">{invoice.number}</p>
                      <PdfPreviewButton
                        size="sm"
                        variant="ghost"
                        aria-label={`View invoice ${invoice.number}`}
                        title={`Invoice ${invoice.number}`}
                        fileName={`Brachtia-${invoice.number}.pdf`}
                        build={async () =>
                          (await import("@/lib/invoice-pdf")).invoicePdfUrl(invoiceDoc())
                        }
                      >
                        <Eye className="size-4" />
                      </PdfPreviewButton>
                    </div>
                    {(billing as any)?.replaces ? (
                      <p className="text-xs text-muted-foreground">
                        Replaces {(billing as any).replaces}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Total: {money(Number(invoice.total))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Paid: {money(paidTotal)} · Balance: {money(balanceDue)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {paidTotal === 0 ? (
                        // an invoice is a record once money is paid on it - until then it can change
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void navigate({
                                to: "/admin/bookings/$id/invoice",
                                params: { id },
                                search: { invoice: invoice.id },
                              })
                            }
                          >
                            Edit
                          </Button>
                          {confirmCancel ? (
                            <>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={cancelling}
                                onClick={() => void cancelTheInvoice()}
                              >
                                Confirm cancel
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmCancel(false)}
                              >
                                Keep
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => setConfirmCancel(true)}
                            >
                              Cancel
                            </Button>
                          )}
                        </>
                      ) : null}
                      {/* the invoice asks for money; money in is recorded on the receipt card */}
                      {balanceDue <= 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <Check className="size-3.5" /> Paid
                        </span>
                      ) : paidTotal > 0 ? (
                        <span className="text-xs font-medium text-amber-700">Partially paid</span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">Not generated</p>
                    <Button
                      size="sm"
                      className="mt-2"
                      // a closed booking is not invoiced - reopen it first
                      disabled={isClosed}
                      title={isClosed ? "This booking is closed" : undefined}
                      onClick={() =>
                        void navigate({ to: "/admin/bookings/$id/invoice", params: { id } })
                      }
                    >
                      Generate invoice
                    </Button>
                  </>
                )}
              </div>

              <div id="booking-payment" className={boxClass("payment")}>
                <p className="text-sm font-medium text-foreground">Payment receipt</p>
                {/*
                  A booking takes one payment: the booking fee, and it is the fee
                  IN FULL that confirms the room. Half of it confirms nothing, so
                  this stays until the whole RM500 is in - a student who pays 250
                  today and 250 on Friday is recorded here twice.

                  Once the fee is complete the student is a resident, and
                  everything still owed on the initial invoice is chased on their
                  Payments tab and in Collections rather than here.
                */}
                {invoice && paidTotal < (BOOKING_FEE || balanceDue) ? (
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Booking fee {money(Math.max((BOOKING_FEE || balanceDue) - paidTotal, 0))}
                      {paidTotal > 0 ? ` still to pay · ${money(paidTotal)} in` : ""} ·{" "}
                      {invoice.number}
                    </span>
                    <Button size="sm" onClick={recordBookingFee}>
                      Record booking fee
                    </Button>
                  </div>
                ) : invoice && balanceDue > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Booking fee paid · balance {money(balanceDue)} on their Payments tab
                  </p>
                ) : invoice ? (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <Check className="size-3.5" /> Fully paid
                  </p>
                ) : null}
                {row.resident_id || paidTotal >= BOOKING_FEE ? (
                  <div className="mt-2 flex">
                    {row.resident_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void navigate({
                            to: "/admin/residents/$id",
                            params: { id: row.resident_id as string },
                          })
                        }
                      >
                        View resident
                      </Button>
                    ) : (
                      // the fee is in, so the resident is made with the payment - this is
                      // here for the booking where that did not go through
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => !needStaff() && void createResident(r)}
                      >
                        Create resident
                      </Button>
                    )}
                  </div>
                ) : null}
                {receipts.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No receipts yet</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {receipts.map((rc) => (
                      <li key={rc.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {rc.number} · {money(Number(rc.amount))}
                        </span>
                        <PdfPreviewButton
                          size="sm"
                          variant="ghost"
                          aria-label={`View receipt ${rc.number}`}
                          title={`Receipt ${rc.number}`}
                          fileName={`Brachtia-${rc.number}.pdf`}
                          build={async () =>
                            (await import("@/lib/invoice-pdf")).receiptPdfUrl(receiptDocFor(rc))
                          }
                        >
                          <Eye className="size-4" />
                        </PdfPreviewButton>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <RecordPaymentDialog
            key={paying?.id ?? "none"}
            invoice={paying}
            onClose={() => setPaying(null)}
            onRecorded={() => goTo("payment")}
          />

          {/* the booking fee is in and admin has made them a resident: send their profile link */}
          {row.resident_id && (row.fee_received_at || paidTotal > 0) ? (
            <WelcomeMessageCard
              id="booking-welcome"
              highlight={flash === "welcome"}
              enquiryId={id}
              sent={Boolean((row as any).welcome_sent_at)}
              onSent={() => void queryClient.invalidateQueries({ queryKey: ["admin"] })}
              residentId={row.resident_id}
              phone={row.phone ?? ""}
              hasProof={hasProofFor(receipts[receipts.length - 1])}
              // one file, scrolled through: the updated invoice, the receipt for
              // the booking fee, and the slip it was paid with
              attachments={
                invoice && receipts.length
                  ? [
                      {
                        label: hasProofFor(receipts[receipts.length - 1])
                          ? "Invoice, receipt & proof"
                          : "Invoice & receipt",
                        fileName: `Brachtia-${invoice.number}-welcome.pdf`,
                        build: async () => {
                          const rc = receipts[receipts.length - 1];
                          const { welcomePackPdfUrl } = await import("@/lib/invoice-pdf");
                          return welcomePackPdfUrl({
                            invoice: invoiceDoc(),
                            receipt: receiptDocFor(rc),
                            proof: await loadProof(rc),
                          });
                        },
                      },
                    ]
                  : []
              }
            />
          ) : null}

          {/* What this booking was closed against. Said here and nowhere else:
              the list shows a closed booking's stage only. */}
          {duplicateParent ? (
            <Card title="Duplicate of">
              <button
                type="button"
                onClick={() =>
                  void navigate({ to: "/admin/bookings/$id", params: { id: parentId } })
                }
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-amber-900">
                    {(duplicateParent as any).reference || "—"}
                  </span>
                  <span className="block truncate text-xs text-amber-800">
                    {[(duplicateParent as any).full_name, (duplicateParent as any).email]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-amber-900 underline-offset-2 hover:underline">
                  Open →
                </span>
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                This enquiry was closed against that booking. Reopen it below if that was wrong.
              </p>
            </Card>
          ) : null}

          {/* The other enquiries this student sent, closed against this one.
              Nothing is deleted - each keeps its reference and its history - so
              this is the way back to them. */}
          {duplicates.length ? (
            <Card title={`Duplicates (${duplicates.length})`}>
              <p className="text-xs text-muted-foreground">
                Closed against this booking. They are out of the bookings list, but still here.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {duplicates.map((d: any) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void navigate({ to: "/admin/bookings/$id", params: { id: String(d.id) } })
                      }
                      className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-brand-deep">
                          {d.reference || "—"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[d.full_name, d.email].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-brand underline-offset-2 hover:underline">
                        Open →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* Internal notes */}
          <Card title="Internal notes">
            <Textarea
              defaultValue={row.admin_notes ?? ""}
              rows={4}
              placeholder="Add a note..."
              onBlur={(e) =>
                e.target.value !== (row.admin_notes ?? "") &&
                mutate.mutate({ adminNotes: e.target.value })
              }
            />
            {/* Closed by mistake. Everything a close did is undone here - the
                reason, the link to whatever it was said to duplicate - so it
                stops being anybody's repeat and goes back into the list as an
                ordinary booking. It returns as New: nothing recorded the stage
                it was at before, and a guessed stage is worse than the start. */}
            {row.status === "closed" ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  Closed{closedReason ? ` · ${closedReason}` : ""}. Reopening brings it back as a
                  new enquiry and clears any duplicate link.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={advance.isPending}
                  onClick={() => {
                    if (needStaff()) return;
                    advance.mutate({ to: "open", closeReason: "", duplicateOf: "" });
                  }}
                >
                  Reopen booking
                </Button>
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* the system's own dropdown - a bare select draws the operating
                  system's menu, which is the one part of this page that does not
                  look like the rest of it */}
              <Select
                value={closeReason}
                onValueChange={(v) => {
                  setCloseReason(v);
                  // a link only means something for a duplicate
                  if (v !== CLOSE_DUPLICATE) setDuplicateOf("");
                  // and a written reason only means something for Other
                  if (v !== CLOSE_OTHER) setOtherReason("");
                }}
              >
                <SelectTrigger className={`h-9 w-48 text-xs ${feePaid ? "opacity-60" : ""}`}>
                  <SelectValue placeholder="Close reason…" />
                </SelectTrigger>
                <SelectContent>
                  {/* Still listed once the fee is in, greyed rather than gone. A
                      reason that has quietly disappeared reads as a bug and
                      sends staff looking for it; one greyed out says there is a
                      rule and what it applies to. */}
                  {CLOSE_REASONS.map((c) => (
                    <SelectItem key={c} value={c} disabled={feePaid} className="text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* "Other" on its own tells the next person nothing. Whoever reads
                  this booking in three months needs the sentence, not the label. */}
              {closeReason === CLOSE_OTHER ? (
                <span className="flex items-center gap-1.5">
                  <Input
                    value={otherReason}
                    maxLength={120}
                    placeholder="Why is it being closed?"
                    aria-label="Why this booking is being closed"
                    className="h-9 w-72 text-xs"
                    onChange={(e) => setOtherReason(e.target.value)}
                  />
                  {/* required, and marked the way every required field is */}
                  {otherReason.trim() ? null : (
                    <span
                      aria-hidden
                      title="Still empty"
                      className="size-1.5 shrink-0 rounded-full bg-brand"
                    />
                  )}
                </span>
              ) : null}

              {/* Closing as a duplicate asks which booking is the real one. The
                  ones that look like the same person come first; the rest are
                  there because detection misses a student who enquired twice
                  from two addresses with their name spelt differently. */}
              {closeReason === CLOSE_DUPLICATE ? (
                <span className="flex items-center gap-1.5">
                  {/* required, and marked the way every required field is */}
                  <Select value={duplicateOf} onValueChange={setDuplicateOf}>
                    <SelectTrigger className="h-9 w-72 text-xs">
                      <SelectValue placeholder="Link to active booking…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(dupCandidates?.matches ?? []).length ? (
                        <SelectGroup>
                          <SelectLabel className="text-[11px]">
                            Looks like the same person
                          </SelectLabel>
                          {(dupCandidates?.matches ?? []).map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                              {c.reference} · {c.full_name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                      {(dupCandidates?.others ?? []).length ? (
                        <SelectGroup>
                          <SelectLabel className="text-[11px]">Other open bookings</SelectLabel>
                          {(dupCandidates?.others ?? []).map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                              {c.reference} · {c.full_name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                    </SelectContent>
                  </Select>
                  {duplicateOf ? null : (
                    <span
                      aria-hidden
                      title="Still empty"
                      className="size-1.5 shrink-0 rounded-full bg-brand"
                    />
                  )}
                </span>
              ) : null}

              <Button
                size="sm"
                variant="ghost"
                /* a duplicate pointing at nothing loses the booking, so the
                   button does not offer itself until both answers are in. The
                   checks below stay: a disabled button can be re-enabled, a
                   closed booking cannot be un-closed. */
                disabled={
                  feePaid ||
                  !closeReason ||
                  (closeReason === CLOSE_DUPLICATE && !duplicateOf) ||
                  (closeReason === CLOSE_OTHER && !otherReason.trim())
                }
                onClick={() => {
                  if (needStaff()) return;
                  if (!closeReason) {
                    toast.error("Pick a reason to close this enquiry");
                    return;
                  }
                  // their money is in and they are a resident - not a lead to close
                  if (feePaid) {
                    toast.error("This booking has been paid for, so it can no longer be closed");
                    return;
                  }
                  // closing it as a duplicate of nothing loses the booking
                  if (closeReason === CLOSE_DUPLICATE && !duplicateOf) {
                    toast.error("Choose the booking this one duplicates");
                    return;
                  }
                  // "Other" with nothing after it is the same as no reason at all
                  if (closeReason === CLOSE_OTHER && !otherReason.trim()) {
                    toast.error("Say why this booking is being closed");
                    return;
                  }
                  /*
                   * The written reason travels as the reason itself, so the list,
                   * the booking and the activity trail all read the same sentence.
                   * Only the exact word "Duplicate" drives behaviour, so a reason
                   * beginning "Other" can never be mistaken for one.
                   */
                  const reasonText =
                    closeReason === CLOSE_OTHER
                      ? `${CLOSE_OTHER} · ${otherReason.trim()}`
                      : closeReason;
                  advance.mutate({
                    to: "closed",
                    note: `${row.admin_notes ? `${row.admin_notes}\n` : ""}Closed: ${reasonText}`,
                    closeReason: reasonText,
                    ...(closeReason === CLOSE_DUPLICATE ? { duplicateOf } : {}),
                  });
                  setCloseReason("");
                  setDuplicateOf("");
                  setOtherReason("");
                }}
              >
                Close enquiry
              </Button>

              {/* Why the row is greyed, said once and quietly. The reasons are
                  all still there to read - it is that none of them applies any
                  more, not that the list is broken. */}
              {feePaid ? (
                <p className="basis-full text-[11px] text-muted-foreground">
                  This booking has been paid for and has a resident, so it can no longer be closed
                  here.
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Next action */}
          <div
            className={`rounded-xl border p-4 transition-colors ${
              next?.due && next.due < Date.now()
                ? "border-rose-200 bg-rose-50/40"
                : "border-brand-deep/30 bg-brand-deep/5"
            }`}
          >
            {/* the label, and beside it how long is left - the action itself is the button */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">
                Next action
              </p>
              {next && next.action !== "none" && next.due ? <SlaCountdown due={next.due} /> : null}
            </div>
            {next && next.action !== "none" ? (
              <div className="mt-3 space-y-2">
                {/* one action per stage - the booking link lives on the Viewing card */}
                <Button
                  size="sm"
                  className="w-full"
                  // nothing moves a closed booking forward
                  disabled={isClosed}
                  onClick={() => runPrimary(next.action)}
                >
                  {next.label} <ArrowRight className="size-4" />
                </Button>
                {next.due ? (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Due {fullDateTime(new Date(next.due).toISOString())}
                  </p>
                ) : null}
                {row.status === "room_reserved" && !viewing ? (
                  // the viewing comes first, but it is optional - the invoice can go ahead
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => runPrimary("generate_invoice")}
                  >
                    or generate invoice
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No outstanding action.</p>
            )}
          </div>

          {/* Booking progress */}
          <Card title="Booking progress">
            <ProgressTimeline
              row={row}
              bed={assignedBed ? `${assignedBed.unit.unitNo} ${assignedBed.room.letter}` : ""}
              viewing={viewing}
              invoiced={Boolean(invoice)}
              feePaid={Boolean(row.fee_received_at || paidTotal > 0)}
              trail={activity?.trail ?? []}
            />
          </Card>

          {/* Recent activity */}
          <Card title="Recent activity">
            <ActivityFeed events={activity?.events ?? []} loading={activityLoading} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- sub-components ---------------- */

function Card({
  title,
  children,
  id,
  flash,
}: {
  title: string;
  children: React.ReactNode;
  /** where Next action scrolls to */
  id?: string;
  /** outlined for a moment after Next action brought you here */
  flash?: boolean;
}) {
  return (
    <div
      id={id}
      className={`scroll-mt-6 rounded-xl border bg-card p-4 transition-shadow duration-500 ${
        flash ? "border-brand-deep/40 ring-2 ring-brand-deep/20" : "border-border"
      }`}
    >
      <p className="mb-3 text-sm font-semibold text-brand-deep">{title}</p>
      {children}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function EditableCard({
  title,
  editing,
  onEdit,
  onCancel,
  onSave,
  fields,
  row,
  onSaveField,
  onSaveFields,
  resOptions,
  roomOptions,
  extra,
}: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  fields: readonly (readonly [string, string, string])[];
  row: any;
  onSaveField: (key: string, value: unknown) => void;
  onSaveFields?: (changes: Record<string, string>) => void;
  resOptions: { id: string; slug: string; name: string }[];
  roomOptions?: {
    code: string;
    room_code: string;
    name: string;
    unit_type: string;
    occupancies: string[];
  }[];
  extra?: [string, React.ReactNode][];
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  function startEdit() {
    const d: Record<string, string> = {};
    for (const [k, , kind] of fields) {
      d[k] = String(row[k] ?? "");
      if (kind === "heard") d[`${k}_other`] = String(row[`${k}_other`] ?? "");
    }
    setDraft(d);
    onEdit();
  }

  function save() {
    const changes: Record<string, string> = {};
    for (const [k] of fields) {
      if (draft[k] !== String(row[k] ?? "")) changes[k] = draft[k] ?? "";
    }
    // save the paired "Other" free-text for heard fields
    for (const [k, , kind] of fields) {
      if (kind === "heard") {
        const otherKey = `${k}_other`;
        if ((draft[otherKey] ?? "") !== String(row[otherKey] ?? ""))
          changes[otherKey] = draft[otherKey] ?? "";
      }
    }
    if (onSaveFields) onSaveFields(changes);
    else for (const [key, value] of Object.entries(changes)) onSaveField(key, value);
    onSave();
  }

  const SHARING_SHORT: Record<string, string> = {
    single: "Single",
    twin: "Twin",
    unit: "Whole unit",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-deep">{title}</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save}>
              <Check className="size-4" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="size-4" /> Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={startEdit}>
            <Pencil className="size-4" /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map(([k, label, kind]) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground">{label}</label>
              {kind === "gender" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {/*
                    Only while nothing is on record, and it cannot be chosen
                    back: rooms are allocated by gender, so a booking with no
                    answer must not quietly read - and save - as the first one
                    on the list.
                  */}
                  {draft[k] ? null : (
                    <option value="" disabled>
                      Select gender
                    </option>
                  )}
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              ) : kind === "sharing" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {SHARING_PREFERENCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : kind === "term" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="long">Long term</option>
                  <option value="short">Short term</option>
                </select>
              ) : kind === "residence" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {resOptions.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : kind === "payment" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="bimonthly">Bi-monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="full">Full upfront</option>
                </select>
              ) : kind === "unittype" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {Array.from(
                    new Set((roomOptions ?? []).map((r) => r.unit_type).filter(Boolean)),
                  ).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              ) : kind === "room" ? (
                <select
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  {(roomOptions ?? [])
                    .filter((r) => !draft["unit_type"] || r.unit_type === draft["unit_type"])
                    .map((r) => (
                      <option key={r.code} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                </select>
              ) : kind === "heard" ? (
                <div className="mt-1 space-y-1">
                  <select
                    value={draft[k] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">—</option>
                    {HEARD_ABOUT.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {draft[k] === "Other" ? (
                    <Input
                      value={draft[`${k}_other`] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [`${k}_other`]: e.target.value }))}
                      placeholder="Please specify"
                      className="h-9"
                    />
                  ) : null}
                </div>
              ) : (
                <Input
                  type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="mt-1"
                />
              )}
            </div>
          ))}
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map(([k, label, kind]) => (
            <FieldRow
              key={k}
              label={label}
              value={
                kind === "sharing"
                  ? (SHARING_SHORT[row[k] as string] ?? row[k])
                  : kind === "term"
                    ? row[k] === "short"
                      ? "Short term"
                      : "Long term"
                    : kind === "number"
                      ? money(Number(row[k] ?? 0))
                      : kind === "payment"
                        ? ((
                            {
                              bimonthly: "Bi-monthly",
                              quarterly: "Quarterly",
                              full: "Full upfront",
                            } as Record<string, string>
                          )[row[k] as string] ??
                          row[k] ??
                          "—")
                        : kind === "unittype"
                          ? row[k] || "—"
                          : kind === "room"
                            ? row[k] || "—"
                            : kind === "heard"
                              ? row[k] === "Other" && row[`${k}_other`]
                                ? `Other — ${row[`${k}_other`]}`
                                : row[k] || "—"
                              : row[k] || "—"
              }
            />
          ))}
          {extra?.map(([label, value]) => (
            <FieldRow key={label} label={label} value={value} />
          ))}
        </dl>
      )}
    </div>
  );
}

type StepState = "done" | "skipped" | "todo";

/**
 * Each step is ticked by the thing that actually happened - a bed held, a
 * viewing had, an invoice issued, money in - not by the stage number. A viewing
 * is optional, so when the booking moved on without one it shows as skipped.
 * The ring sits on the first step still waiting, which is where the action is.
 */
function ProgressTimeline({
  row,
  bed,
  viewing,
  invoiced,
  feePaid,
  trail,
}: {
  row: any;
  bed: string;
  viewing?: { starts_at: string } | undefined;
  invoiced: boolean;
  feePaid: boolean;
  trail: TrailStep[];
}) {
  // "Reserved 14 Sept 2026 by Syazwani" - from the audit trail; steps from before
  // it began have no name, so they keep their date alone
  const first = (kind: string) => trail.find((t) => t.kind === kind);
  const last = (...kinds: string[]) => [...trail].reverse().find((t) => kinds.includes(t.kind));
  const by = (verb: string, t: TrailStep | undefined) =>
    t ? `${verb} ${fullDate(t.at)} by ${t.staff}` : "";
  const order = STAGE_ORDER[row.status] ?? 0;
  const past = (key: string) => order > (STAGE_ORDER[key] ?? 99);
  const booked = row.status === "booked";
  // a step can be done with no date saved for it - older bookings
  const doneOn = (d?: string | null) => (d ? fullDate(d) : "Done");

  const viewedAt =
    row.viewing_completed_at ??
    (viewing && new Date(viewing.starts_at).getTime() <= Date.now() ? viewing.starts_at : null);
  const viewingStep: { state: StepState; note: string; by?: string } = viewedAt
    ? { state: "done", note: by("Viewed", last("viewing_completed")) || fullDate(viewedAt) }
    : viewing
      ? {
          // a booked viewing ticks the step; it reads "Viewed" once it has happened
          state: "done",
          note: `Booked for ${fullDateTime(viewing.starts_at)}`,
          by: by("Booked", last("viewing_booked", "viewing_moved")),
        }
      : past("viewing_scheduled") && row.status !== "closed"
        ? { state: "skipped", note: "No viewing" }
        : { state: "todo", note: "Not yet" };

  const steps: { label: string; state: StepState; note: string; by?: string }[] = [
    { label: "New", state: "done", note: doneOn(row.created_at) },
    bed
      ? {
          label: "Room reserved",
          state: "done",
          note: bed,
          by: by("Reserved", last("room_reserved")),
        }
      : { label: "Room reserved", state: "todo", note: "Not yet" },
    { label: "Viewing (optional)", ...viewingStep },
    invoiced || row.invoice_issued_at
      ? {
          label: "Invoice issued",
          state: "done",
          note: by("Issued", last("invoice_issued")) || doneOn(row.invoice_issued_at),
        }
      : { label: "Invoice issued", state: "todo", note: "Not yet" },
    feePaid
      ? {
          label: "Booking fee",
          state: "done",
          note: by("Recorded", first("payment_recorded")) || doneOn(row.fee_received_at),
        }
      : { label: "Booking fee", state: "todo", note: "Not yet" },
    booked
      ? {
          label: "Booked",
          state: "done",
          // booked once the booking fee is in - the balance is still owed after it
          note: by("Booked", first("payment_recorded")) || doneOn(row.stage_changed_at),
        }
      : { label: "Booked", state: "todo", note: "Not yet" },
  ];
  // a closed booking is not waiting on anything
  const currentIndex = row.status === "closed" ? -1 : steps.findIndex((s) => s.state === "todo");

  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const isCurrent = i === currentIndex;
        const done = s.state === "done";
        return (
          <div key={s.label} className="flex items-start gap-2.5">
            <div className="mt-0.5 flex flex-col items-center">
              {done ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="size-3" />
                </span>
              ) : s.state === "skipped" ? (
                <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/40">
                  <span className="h-px w-2 bg-muted-foreground/60" />
                </span>
              ) : isCurrent ? (
                <span className="size-5 rounded-full border-2 border-brand-deep bg-brand-deep/10" />
              ) : (
                <span className="size-5 rounded-full border border-border" />
              )}
            </div>
            <div>
              <p
                className={`text-sm ${
                  done
                    ? "font-medium text-foreground"
                    : isCurrent
                      ? "font-semibold text-brand-deep"
                      : "text-muted-foreground"
                }`}
              >
                {s.label}
              </p>
              <p className="text-xs text-muted-foreground">{s.note}</p>
              {s.by ? <p className="text-xs text-muted-foreground">{s.by}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Newest first, each with the staff member who did it. */
function ActivityFeed({ events, loading }: { events: ActivityEvent[]; loading: boolean }) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (events.length === 0) return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  return (
    <div className="space-y-3">
      {events.map((e, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-deep/40" />
          <div>
            <p className="text-sm text-foreground">{e.text}</p>
            <p className="text-xs text-muted-foreground">
              {fullDateTime(e.at)}
              {e.staff ? (
                <>
                  {" · by "}
                  <span className="font-medium text-brand-deep/80">{e.staff}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
