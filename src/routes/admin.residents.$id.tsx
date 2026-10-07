import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, DoorOpen, Link2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getResidentCheckIn } from "@/lib/admin.functions";
import { refreshMoney } from "@/lib/billing-client";

import { RELATIONSHIP_OPTIONS, idLabelFor } from "@/lib/reference-data";
import { getDeclarationForResident } from "@/lib/declaration.functions";
import {
  RESIDENT_GROUPS,
  RESIDENT_SECTIONS,
  completeness,
  residentFieldShown,
  type ResidentField,
} from "@/lib/resident-fields";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ResidentDocumentRow,
  EmptyState,
  Panel,
  Combo,
  ReadOnlyField,
  Select,
  StatusPill,
  Text,
} from "@/components/admin/ops-ui";
import { TenancyDocs, currentMergeValues } from "@/components/admin/TenancyDocs";
import { Checkbox } from "@/components/ui/checkbox";
import { UpdateTenancyDialog, type TenancyChangeResult } from "@/components/admin/UpdateTenancyDialog";
import { getTenancyEvents } from "@/lib/tenancy-change.functions";
import { EventStatusPill, TenancyEvents } from "@/components/admin/TenancyEvents";
import { getResidentRent, tenancyDatesByResident } from "@/lib/rental-schedule.functions";
import { ResidentPayments } from "@/components/admin/ResidentPayments";
import { RESIDENT_DOCS, residentDocsFor, residentDocLabel } from "@/lib/resident-documents";
import { compressImage } from "@/lib/compress";
import { removeResidentDoc, residentDocUrl, uploadResidentDoc } from "@/lib/residents.functions";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import {
  PAY_METHODS,
  SCHEDULES,
  addTask,
  blankResident,
  fmtDate,
  fmtDateTime,
  money,
  createTenancy,
  deleteResident,
  findBed,
  findBedForResident,
  refreshResidents,
  refreshUnits,
  saveResidentRecord,
  saveTenancy,
  stayDates,
  updateBed,
  useOps,
  vacateBed,
  allBeds,
  type BedStatus,
  type Resident,
  type ResidentPatch,
  residentIdOf,
} from "@/lib/ops-store";

function initials(name: string) {
  // names carry suffixes like "(B1)" and particles like bin / binti - neither
  // belongs in a monogram
  const skip = new Set(["bin", "binti", "bt", "a/l", "a/p", "al", "el"]);
  const parts = name
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter((p) => p && !skip.has(p.toLowerCase()));
  if (!parts.length) return "—";
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/**
 * How long the stay actually is, counted the way a calendar counts it.
 *
 * Comparing only the month numbers turned 07 Sept -> 10 May into a flat
 * "8 months" and quietly dropped the three days. Whole months are taken first,
 * then the leftover days are borrowed from the month before the end date.
 */
function monthsBetween(start: string, end: string) {
  if (!start || !end) return "";
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  if (b < a) return "";

  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  let days = b.getDate() - a.getDate();
  if (days < 0) {
    months -= 1;
    // days in the month that ends on the end date
    days += new Date(b.getFullYear(), b.getMonth(), 0).getDate();
  }
  if (months < 0) return "";

  const parts: string[] = [];
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rem) parts.push(`${rem} month${rem === 1 ? "" : "s"}`);
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" ") : "0 days";
}

/*
 * The sections this resident is actually asked, by the same test the cards
 * below are drawn by. Listed flat, the sidebar offered Employment to a student
 * and Academic to somebody employed - every question inside was put away, so
 * the link led to a heading that was not on the page.
 */
const profileSectionsFor = (r: Resident) => [
  ...RESIDENT_SECTIONS.filter((s) => s.fields.some((f) => residentFieldShown(f, r))).map((s) => ({
    key: s.key,
    label: s.title,
  })),
  { key: "documents", label: "Documents" },
  { key: "portal", label: "Portal access" },
];

export const Route = createFileRoute("/admin/residents/$id")({
  component: ResidentProfilePage,
  // the tab to open on - a booking's Record Payment lands straight on Payments
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search["tab"] === "tenancy" || search["tab"] === "payments"
      ? { tab: search["tab"] as "tenancy" | "payments" }
      : {}),
  }),
});

/**
 * Whether the declaration has been signed - read from the signature record, not
 * from a flag on the resident. A flag would be overwritten by the next bulk
 * upload; a signature is an event of its own and cannot be.
 */
function DeclarationStatus({ residentId }: { residentId: string }) {
  const [state, setState] = useState<
    { version: string; signedName: string; signedAt: string; readToEnd: boolean } | null | "loading"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    if (!residentId || residentId === "new") {
      setState(null);
      return;
    }
    void (async () => {
      try {
        const res = await getDeclarationForResident({ data: { residentId } });
        if (!cancelled) setState(res.signed);
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [residentId]);

  if (state === "loading") return <p className="text-sm text-muted-foreground">Checking…</p>;
  if (!state) {
    return (
      <p className="text-sm text-muted-foreground">
        Not signed yet. It is the last section of their profile link.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <ReadOnlyField label="Signed by" value={state.signedName} />
      {/* the time is the evidence, not the day - see fmtDateTime */}
      <ReadOnlyField label="Signed on" value={fmtDateTime(state.signedAt)} />
      <ReadOnlyField
        label="Version"
        value={`${state.version}${state.readToEnd ? " · read to the end" : ""}`}
      />
    </div>
  );
}

function ResidentProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { residents, units, tenancies } = useOps();
  // "new" is a resident that does not exist yet: the form is filled in first and
  // the row is only created on save, so an abandoned form leaves nothing behind
  const isNew = id === "new";
  const stored = residents.find((r) => r.id === id);
  const [form, setForm] = useState<Resident | null>(isNew ? blankResident() : (stored ?? null));
  const { tab: startTab } = Route.useSearch();
  const [tab, setTab] = useState<string>(startTab ?? "profile");
  // the Checkout button pressed: Payments opens on the checkout settlement
  const [goCheckout, setGoCheckout] = useState(0);
  // a lost or damaged access card: Payments opens its invoice, filled in (Dani, 2 Oct 2026)
  const [cardCharge, setCardCharge] = useState<{ label: string; amount: number; n: number } | null>(null);
  const clearCardCharge = useCallback(() => setCardCharge(null), []);
  // an invoice to show on Payments, from a link elsewhere on the card
  const [focusInvoice, setFocusInvoice] = useState<{ number: string; n: number } | null>(null);
  const [active, setActive] = useState("personal");
  // sections are read-only until the pencil is clicked
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [linking, setLinking] = useState(false);
  const queryClient = useQueryClient();
  const savedDates = useQuery({ queryKey: ["tenancy-dates"], queryFn: () => tenancyDatesByResident() });
  // deleting a former resident for good asks for their name to be typed back
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  // Update Tenancy: a room, occupancy or date change, and its documents (Dani, 3 Oct 2026)
  const [updateTenancyOpen, setUpdateTenancyOpen] = useState(false);
  // a resident's uploaded file, open in the preview window
  const [docPreview, setDocPreview] = useState<{ title: string; fileName: string; url: string } | null>(null);
  const isEditing = (key: string) => !!editing[key];
  const editAction = (key: string) => (
    <Button
      size="sm"
      variant={isEditing(key) ? "default" : "ghost"}
      onClick={() => setEditing((e) => ({ ...e, [key]: !e[key] }))}
    >
      {isEditing(key) ? (
        "Done"
      ) : (
        <>
          <Pencil className="mr-1 size-3.5" /> Edit
        </>
      )}
    </Button>
  );
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const sectionRef = (key: string) => (el: HTMLElement | null) => {
    sections.current[key] = el;
  };

  function goToSection(key: string) {
    setActive(key);
    sections.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // keep the left nav in step with whatever the reader has scrolled to
  useEffect(() => {
    if (tab !== "profile") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const key = visible?.target.id.replace("sec-", "");
        if (key) setActive(key);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const el of Object.values(sections.current)) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [tab]);

  useEffect(() => {
    if (stored && !form) setForm(stored);
  }, [stored, form]);

  /*
   * The tenancy is in the database, but this browser has no copy of it - a new
   * computer, or the site at a new address (Dani, 5 Oct 2026: the Vercel site
   * said "No tenancy yet"). The copy is made from the database, once.
   */
  const dbTenancy = form ? savedDates.data?.[form.id] : undefined;
  const hasLocal = !!form && tenancies.some((t) => t.residentId === form.id);
  useEffect(() => {
    if (!form || hasLocal || !dbTenancy?.id) return;
    const row = findBedForResident(units, form);
    createTenancy({
      id: dbTenancy.id,
      residentId: form.id,
      unitId: row?.unit.id,
      roomId: row?.room.id,
      bedId: row?.bed.id ?? form.bedId,
      start: dbTenancy.start,
      end: dbTenancy.end,
      rent: row?.bed.rent ?? row?.room.rent ?? 0,
      schedule: form.paySchedule,
    });
  }, [form, hasLocal, dbTenancy, units]);

  /*
   * Update Tenancy's events (7 Oct 2026): each moves on by itself on the server -
   * settled when its IP is, effective on its day (the daily job moves the bed).
   * Read here for the Tenancy tab; once one has taken effect, the page's own
   * copy of the beds and the rent is brought up to date.
   */
  const hasTenancy = !!form?.id && tenancies.some((t) => t.residentId === form.id);
  const tenancyEvents = useQuery({
    queryKey: ["tenancy-events", form?.id],
    queryFn: () => getTenancyEvents({ data: { residentId: form!.id } }),
    enabled: hasTenancy,
  });
  const lastEffective = (tenancyEvents.data?.events ?? []).find((e) => e.state === "effective");
  useEffect(() => {
    if (!lastEffective || !form) return;
    void refreshUnits();
    void queryClient.invalidateQueries({ queryKey: ["tenancy-dates"] });
    const local = tenancies.find((t) => t.residentId === form.id);
    if (local && lastEffective.rent && Math.abs(local.rent - lastEffective.rent) > 0.005) saveTenancy({ ...local, rent: lastEffective.rent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEffective?.eventId]);

  if ((!stored && !isNew) || !form) {
    return (
      <EmptyState
        title="Resident not found"
        hint="This profile may have been removed."
        action={
          <Button asChild size="sm">
            <Link to="/admin/residents">Back to residents</Link>
          </Button>
        }
      />
    );
  }

  const set = (p: ResidentPatch) => setForm((f) => (f ? ({ ...f, ...p } as Resident) : f));
  const { pct, missing } = completeness(form);
  /*
   * The document rows: what this resident is asked for, then anything already
   * uploaded that is not on that list any more.
   *
   * Without the second half, changing somebody from Student to Employed would
   * take the row their offer letter is on off the page - the file is still in
   * the bucket and still on the record, with nothing left that shows it.
   */
  const asked = residentDocsFor(form.currentStatus);
  const docRows = [
    ...asked,
    ...form.docs
      .filter((d) => !asked.some((r) => r.key === d.key))
      .map((d) => ({
        key: d.key,
        label: RESIDENT_DOCS.find((r) => r.key === d.key)?.label ?? d.label ?? d.key,
        required: false,
        appliesTo: "any" as const,
      })),
  ];
  // the browser's copy of the tenancy, with the dates the tenancies table has (Dani, 4 Oct 2026)
  const localTenancy = tenancies.find((t) => t.residentId === form.id);
  const saved = savedDates.data?.[form.id];
  const tenancy = localTenancy && saved ? { ...localTenancy, start: saved.start || localTenancy.start, end: saved.end || localTenancy.end } : localTenancy;
  const placed = findBedForResident(units, form);

  async function save() {
    if (!form) return;
    let saved;
    try {
      saved = await saveResidentRecord(form);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save resident");
      return;
    }
    if (isNew) {
      // the server assigned the real id, so move onto that address
      toast.success("Resident created");
      void navigate({ to: "/admin/residents/$id", params: { id: saved.id }, replace: true });
      return;
    }
    if (form.bedId) {
      const row = findBed(units, form.bedId);
      if (row) {
        updateBed(form.bedId, {
          status:
            row.bed.status === "vacant" || row.bed.status === "held" ? "booked" : row.bed.status,
          residentId: form.id,
          residentName: form.fullName,
          university: form.university,
          nationality: form.nationality,
          gender: form.gender,
          studentId: form.studentId,
        });
      }
    }
    toast.success("Resident saved");
  }

  function startTenancy() {
    if (!form) return;
    if (pct < 100) {
      toast.error("Complete the required fields first");
      return;
    }
    const row = findBed(units, form.bedId);
    const t = createTenancy({
      residentId: form.id,
      unitId: row?.unit.id,
      roomId: row?.room.id,
      bedId: form.bedId,
      start: form.moveIn,
      // not the move-in date again: that read as a stay of 0 days (Dani, 4 Oct 2026)
      end: row?.bed.tenancyEnd ?? "",
      rent: row?.room.rent ?? 0,
      schedule: form.paySchedule,
    });
    addTask({
      type: "agreement",
      title: "Review & sign tenancy agreement",
      refLabel: form.fullName || "Resident",
      refId: t.id,
      dueDate: form.moveIn,
      link: `/admin/residents/${form.id}`,
    });
    toast.success("Tenancy created");
    setTab("tenancy");
  }

  // the stay summary: the tenancy record if there is one, otherwise whatever the
  // bed placement and the profile already know
  /*
   * The tenancy as it stands, and what an event not yet effective will make of
   * it (Dani, 7 Oct 2026): the original end date stays on the tenancy until the
   * event's day; the new one is shown beside it, marked Scheduled or Settled.
   */
  const pendingEvents = (tenancyEvents.data?.events ?? []).filter((e) => e.state === "scheduled" || e.state === "settled").sort((a, b) => a.date.localeCompare(b.date));

  const stay = {
    ...stayDates(tenancy, placed, form, saved),
    // the rent terms' rent in force today wins - the page's own copy can be stale (7 Oct 2026)
    rent: tenancyEvents.data?.rentToday || tenancy?.rent || placed?.bed.rent || placed?.room.rent || 0,
    status: (placed?.bed.status ?? "vacant") as BedStatus,
    get duration(): string {
      return monthsBetween(this.start, this.end);
    },
  };

  /**
   * A blank row is an accident, not a record: no name, no Brachtia id, no email,
   * no bed, no tenancy. Nothing points at it, so removing it loses nothing.
   * Anyone with real data is deactivated instead. (Billing needs no check of its
   * own: an invoice only reaches a resident from a booking, and a booking always
   * carries the student's name.)
   */
  const isEmptyDraft =
    !form.fullName.trim() && !form.quickbooksId.trim() && !form.email.trim() && !placed && !tenancy;

  /**
   * A link the student opens to check and complete their own profile. It writes
   * straight back to this resident, so anything they change shows up here and
   * everywhere else at once.
   */
  async function copyProfileLink() {
    if (!form || isNew) return;
    setLinking(true);
    try {
      const { getOrCreateProfileLink } = await import("@/lib/profile-link.functions");
      const { token } = await getOrCreateProfileLink({ data: { residentId: form.id } });
      const url = `${window.location.origin}/my-profile/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied", {
        description: "Send it to the resident. It works for 30 days.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the link");
    } finally {
      setLinking(false);
    }
  }

  async function discard() {
    if (!form) return;
    if (isNew) {
      void navigate({ to: "/admin/residents" });
      return;
    }
    try {
      await deleteResident(form.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove resident");
      return;
    }
    toast.success("Blank resident removed");
    void navigate({ to: "/admin/residents" });
  }

  /**
   * A current resident is never deleted - they are history, and a deleted one
   * would leave payments and agreements pointing at nothing. Deactivating marks
   * them inactive and frees the bed they held.
   */
  async function deactivate() {
    const bed = placed?.bed;
    try {
      await saveResidentRecord({ ...form, status: "Inactive" } as Resident);
      if (bed) vacateBed(bed.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate resident");
      return;
    }
    toast.success("Resident deactivated");
    void navigate({ to: "/admin/residents" });
  }

  /** checked out and settled: Inactive, and the bed is free for the next resident (Dani, 2 Oct 2026) */
  async function checkedOut() {
    if (!form) return;
    const bed = placed?.bed;
    await saveResidentRecord({ ...form, status: "Inactive" } as Resident);
    if (bed) vacateBed(bed.id);
    setForm({ ...form, status: "Inactive" } as Resident);
  }

  /**
   * Former residents with no QuickBooks id are test data - real residents from
   * the master list all carry one - so only they can be deleted for good, with
   * their invoices and payments. The server checks the same rules again.
   */
  const isFormer = (form.status || "").toLowerCase() === "inactive";
  const canDelete = isFormer && !form.quickbooksId.trim();
  const nameTyped = confirmName.trim().toLowerCase() === form.fullName.trim().toLowerCase();

  /**
   * Update Tenancy saved on the server: the bed moves here, as Room Change
   * did, and the resident card shows the new end date and rent.
   */
  // confirmed: the events are scheduled on the server - nothing on the page changes until they take effect
  async function tenancyChanged() {
    if (!form) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tenancy-docs", form.id] }),
      queryClient.invalidateQueries({ queryKey: ["tenancy-change", form.id] }),
      queryClient.invalidateQueries({ queryKey: ["tenancy-events", form.id] }),
      queryClient.invalidateQueries({ queryKey: ["tenancy-dates"] }),
      refreshMoney(queryClient),
    ]);
    setTab("tenancy");
  }

  async function deleteForever() {
    if (!form) return;
    try {
      const { deleteFormerResident } = await import("@/lib/residents.functions");
      await deleteFormerResident({ data: { id: form.id, confirmName } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete resident");
      return;
    }
    setDeleting(false);
    await Promise.all([refreshResidents(), refreshUnits(), refreshMoney(queryClient)]);
    toast.success("Resident deleted");
    void navigate({ to: "/admin/residents" });
  }

  return (
    <div className="space-y-5">
      <Button asChild size="sm" variant="ghost" className="-ml-2 self-start">
        <Link to="/admin/residents">
          <ArrowLeft className="mr-1 size-4" /> Residents
        </Link>
      </Button>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {/* photo comes later; initials keep the shape stable until then */}
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-base font-semibold tracking-wide text-brand-deep">
              {initials(form.fullName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-brand-deep">
                {form.fullName || "New resident"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusPill status={stay.status} />
                {[
                  residentIdOf(form) && `ID ${residentIdOf(form)}`,
                  form.university,
                  form.nationality,
                  form.gender,
                ]
                  .filter(Boolean)
                  .map((chip) => (
                    <span
                      key={String(chip)}
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
              </div>
            </div>
          </div>

          {/*
            A real resident's record is not ended from this header: each section
            saves its own edits, and a record with a Brachtia ID behind it is not
            something to deactivate on the way past. Only a record made here with
            no Brachtia ID - a test - can still be deactivated and deleted.
          */}
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {tenancy && !isNew ? (
              <>
                {/* one button for both: what changes is picked inside (Dani, 2 Oct 2026) */}
                <Button size="sm" variant="outline" onClick={() => setUpdateTenancyOpen(true)}>
                  Update Tenancy
                </Button>
                {/* any time: a resident can cancel, end early or leave at the end (Dani, 2 Oct 2026) */}
                {!isFormer ? (
                  <Button
                    size="sm"
                    className="bg-amber-600 text-white hover:bg-amber-700"
                    title="Opens the Payments tab, at the checkout statement"
                    onClick={() => {
                      setTab("payments");
                      setGoCheckout(Date.now());
                      // once - a later visit to Payments does not jump to checkout again
                      window.setTimeout(() => setGoCheckout(0), 5000);
                    }}
                  >
                    <DoorOpen className="mr-1 size-3.5" /> Checkout
                  </Button>
                ) : null}
              </>
            ) : null}
            {isEmptyDraft ? (
              <Button size="sm" variant="outline" onClick={discard}>
                <Trash2 className="mr-1 size-3.5" /> Discard
              </Button>
            ) : !isFormer && !form.quickbooksId.trim() ? (
              <Button size="sm" variant="outline" onClick={deactivate}>
                Deactivate
              </Button>
            ) : canDelete ? (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setConfirmName("");
                  setDeleting(true);
                }}
              >
                <Trash2 className="mr-1 size-3.5" /> Delete
              </Button>
            ) : null}
          </div>

          <Dialog open={deleting} onOpenChange={setDeleting}>
            <DialogContent className="admin-ui">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-brand-deep">
                  Delete {form.fullName || "this resident"}?
                </DialogTitle>
                <DialogDescription>
                  Their profile, invoices, payments, receipts and uploaded files are removed for
                  good. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Type their name to confirm</p>
                <Input
                  autoFocus
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={form.fullName}
                  aria-label="Resident name"
                />
              </div>
              <Button
                variant="destructive"
                disabled={!nameTyped}
                onClick={() => void deleteForever()}
              >
                Delete for good
              </Button>
            </DialogContent>
          </Dialog>

          {tenancy ? (
            <UpdateTenancyDialog
              open={updateTenancyOpen}
              onOpenChange={setUpdateTenancyOpen}
              residentId={form.id}
              units={units}
              placed={placed}
              tenancy={{ start: tenancy.start, end: tenancy.end, rent: tenancy.rent }}
              residents={residents}
              gender={form.gender}
              mergeValuesFor={(r) =>
                currentMergeValues(form, { ...tenancy, ...(r.newStart ? { start: r.newStart } : {}), end: r.newEnd, rent: r.newRent || tenancy.rent }, r.newBed ?? placed)
              }
              onApplied={tenancyChanged}
              invoiceFor={{ fullName: form.fullName, email: form.email, phone: form.mobile, residentCode: form.residentCode, university: form.university, nationality: form.nationality }}
            />
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "Residence", value: placed?.unit.residenceName },
            { label: "Unit number", value: placed?.unit.unitNo },
            {
              label: "Room / bed",
              value: placed ? `Room ${placed.room.letter} · ${placed.bed.label}` : undefined,
            },
            { label: "Monthly rent", value: stay.rent ? money(stay.rent) : undefined },
            { label: "Tenancy start", value: stay.start ? fmtDate(stay.start) : undefined },
            { label: "Tenancy end", value: stay.end ? fmtDate(stay.end) : undefined },
            { label: "Duration", value: stay.duration },
          ].map((f) => (
            <div key={f.label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="truncate text-sm font-medium text-foreground">{f.value || "—"}</p>
            </div>
          ))}
        </div>
        {/* an Update Tenancy event not yet effective, said once under the details - gone on its day (Dani, 7 Oct 2026) */}
        {pendingEvents.length ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Upcoming tenancy change</p>
            <ul className="space-y-1.5">
              {pendingEvents.map((e) => {
                const bed = e.moveToBed ? allBeds(units).find((b) => b.bed.id === e.moveToBed) : null;
                return (
                  <li key={e.eventId} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-semibold text-foreground">{e.name}</span>
                    <EventStatusPill state={e.state} />
                    <span className="text-xs text-muted-foreground">
                      Effective date <span className="font-medium text-foreground">{fmtDate(e.date)}</span>
                    </span>
                    {e.dateChange !== "none" ? (
                      <span className="text-xs text-muted-foreground">
                        New end date <span className="font-medium text-foreground">{fmtDate(e.periodEnd)}</span>
                      </span>
                    ) : null}
                    {bed ? (
                      <span className="text-xs text-muted-foreground">
                        New room <span className="font-medium text-foreground">{bed.unit.unitNo} · Room {bed.room.letter}</span>
                      </span>
                    ) : null}
                    {Math.abs(e.rent - e.rentBefore) > 0.005 ? (
                      <span className="text-xs text-muted-foreground">
                        New monthly rent <span className="font-medium text-foreground">{money(e.rent)}</span>
                      </span>
                    ) : null}
                    <button type="button" className="ml-auto text-xs text-brand-deep underline-offset-2 hover:underline" onClick={() => setTab("tenancy")}>
                      Details
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {/* on the card every tab shares: a resident without a tenancy yet
            still has an arrival to arrange (Dani, 30 Sep 2026) */}
        {!isNew && form.id ? <CheckInLine residentId={form.id} /> : null}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-48 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-brand-deep">Profile completeness</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-deep transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            {missing.length ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {missing.length} field{missing.length === 1 ? "" : "s"} still to fill in
              </p>
            ) : null}
          </div>
          {tenancy ? (
            <Button size="sm" variant="outline" onClick={() => setTab("tenancy")}>
              View tenancy
            </Button>
          ) : (
            <Button size="sm" disabled={pct < 100} onClick={startTenancy}>
              Create tenancy
            </Button>
          )}
        </div>
      </Panel>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="tenancy">Tenancy</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <div className="flex gap-6">
            <nav className="sticky top-4 hidden w-48 shrink-0 self-start lg:block">
              <ul className="space-y-0.5">
                {(form ? profileSectionsFor(form) : []).map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => goToSection(s.key)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        active === s.key
                          ? "bg-brand-tint font-medium text-brand-deep"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>

              {/* sending the student their own form is a nav action, not a
                  section of the profile */}
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full justify-start"
                disabled={isNew || linking}
                onClick={copyProfileLink}
              >
                <Link2 className="mr-1.5 size-3.5" />
                {linking ? "Preparing…" : "Application Form Link"}
              </Button>
            </nav>

            <div className="min-w-0 flex-1 space-y-4">
              {/* one list drives both this page and the student's profile link,
                  so a field renamed or removed here disappears there too */}
              {RESIDENT_SECTIONS.filter((s) =>
                s.fields.some((f) => residentFieldShown(f, form)),
              ).map((s) => (
                <section
                  key={s.key}
                  id={`sec-${s.key}`}
                  ref={sectionRef(s.key)}
                  className="scroll-mt-24"
                >
                  <Panel title={s.title} action={editAction(s.key)}>
                    <GroupedFields
                      sectionKey={s.key}
                      fields={s.fields.filter((f) => residentFieldShown(f, form))}
                      readOnly={!isEditing(s.key)}
                      form={form}
                      set={set}
                    />
                  </Panel>
                </section>
              ))}

              <section id="sec-documents" ref={sectionRef("documents")} className="scroll-mt-24">
                <PdfPreviewDialog
                  title={docPreview?.title ?? ""}
                  fileName={docPreview?.fileName ?? ""}
                  url={docPreview?.url ?? null}
                  onClose={() => setDocPreview(null)}
                />
                <Panel
                  title="Documents"
                  description="Files the resident sent, and any added here."
                >
                  {/*
                    The documents the form asks this resident for - one list, so
                    the admin page cannot ask for more than the student is shown,
                    and it follows Student or Employed the same way their form
                    does: an offer letter for one, an employment letter for the
                    other.

                    Anything already uploaded is kept on the end even when it is
                    not asked for any more. A resident who answered Student,
                    sent their offer letter and later moved to Employed still
                    has that file, and a row disappearing is how a file stops
                    being findable without anybody deleting it.
                  */}
                  {docRows.map((d) => {
                    const doc = form.docs.find((x) => x.key === d.key);
                    // named the way the student form names it: IC copy or passport copy
                    const label = residentDocLabel(d.key, form.nationality);
                    return (
                      <ResidentDocumentRow
                        key={d.key}
                        label={label}
                        fileName={doc?.fileName}
                        uploadedAt={doc?.uploadedAt}
                        onPreview={async () => {
                          /*
                           * Shown in the same preview window as invoices and
                           * receipts, with a Download button - a new tab on a
                           * private link could not be saved (Dani, 1 Oct 2026).
                           * The file is fetched into the page so Download
                           * works across sites, for a photo as for a PDF.
                           */
                          const res = await residentDocUrl({
                            data: { residentId: form.id, key: d.key },
                          });
                          if (!res.ok) {
                            toast.error(res.error);
                            return;
                          }
                          try {
                            const blob = await (await fetch(res.url)).blob();
                            setDocPreview({
                              title: `${label} · ${form.fullName}`,
                              // a photo is shown as a photo: its name says so, even when the upload had none
                              fileName:
                                blob.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(doc?.fileName || "")
                                  ? `${doc?.fileName || label}.${blob.type.split("/")[1] === "png" ? "png" : "jpg"}`
                                  : doc?.fileName || label,
                              url: URL.createObjectURL(blob),
                            });
                          } catch {
                            toast.error("Could not open the file. Try again.");
                          }
                        }}
                        onUpload={async (file) => {
                          const small = await compressImage(file);
                          const fd = new FormData();
                          fd.set("residentId", form.id);
                          fd.set("key", d.key);
                          fd.set("file", small);
                          const res = await uploadResidentDoc({ data: fd });
                          if (!res.ok) {
                            toast.error(res.error);
                            return;
                          }
                          set({ docs: res.docs });
                          toast.success(`${label} uploaded`);
                        }}
                        onRemove={async () => {
                          const res = await removeResidentDoc({
                            data: { residentId: form.id, key: d.key },
                          });
                          if (!res.ok) {
                            toast.error(res.error);
                            return;
                          }
                          set({ docs: res.docs });
                          toast.success(`${label} removed`);
                        }}
                      />
                    );
                  })}
                </Panel>
              </section>

              {/* the signed declaration sits with the documents it belongs to,
                  above the portal, as it did before */}
              <Panel title="Declaration" description="What this resident agreed to, and when.">
                <DeclarationStatus residentId={form.id} />
              </Panel>

              <section id="sec-portal" ref={sectionRef("portal")} className="scroll-mt-24">
                <Panel
                  title="Resident portal"
                  description="Coming soon — invitations will be sent once the portal is live."
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      Status: {form.portalInvited ? "Invite sent" : "Not invited"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        set({ portalInvited: true });
                        toast.info("Portal invites are not live yet");
                      }}
                    >
                      Send portal invite
                    </Button>
                  </div>
                </Panel>
              </section>

            </div>
          </div>
        </TabsContent>

        <TabsContent value="tenancy" className="mt-4 space-y-4">
          {tenancyEvents.data?.events?.length ? (
            <TenancyEvents events={tenancyEvents.data.events} residentId={form.id} onChanged={() => void tenancyChanged()} />
          ) : null}
          {tenancy ? (
            <TenancyDocs
              resident={form}
              tenancy={tenancy}
              onOpenInvoice={(number) => {
                setFocusInvoice({ number, n: Date.now() });
                setTab("payments");
                // shown once - a later visit to Payments does not jump again
                setTimeout(() => setFocusInvoice(null), 3000);
              }}
              onCardCharge={(line) => {
                setCardCharge({ ...line, n: Date.now() });
                setTab("payments");
              }}
            />
          ) : (
            <Panel title="Tenancy" description="Agreement lifecycle and documents.">
              <EmptyState
                title="No tenancy yet"
                hint="Complete the required profile fields, then create the tenancy to start the agreement."
                action={
                  <Button size="sm" disabled={pct < 100} onClick={startTenancy}>
                    Create tenancy
                  </Button>
                }
              />
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <ResidentPayments
            openCheckout={goCheckout}
            cardCharge={cardCharge}
            onCardChargeOpened={clearCardCharge}
            focusInvoice={focusInvoice}
            onInactive={checkedOut}
            residentId={form.id}
            quickbooksId={form.quickbooksId}
            tenancyEnd={stay.end}
            details={{
              // their resident ID, or the Brachtia ID they kept when the
              // database has not given them one yet
              residentCode: residentIdOf(form),
              fullName: form.fullName,
              email: form.email,
              phone: form.mobile,
              university: form.university,
              company: form.company,
              occupation: form.occupation,
              nationality: form.nationality,
              residenceName: placed?.unit.residenceName ?? "",
              roomName: placed ? `Unit ${placed.unit.unitNo} · Room ${placed.room.letter}` : "",
              occupancy: placed?.room.occupancy ?? "",
              tenancyStart: stay.start || "",
              tenancyEnd: stay.end || "",
              monthlyRent: Number(stay.rent) || 0,
              // the Payment schedule field in Payor details
              paymentFrequency: form.paySchedule,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * One profile field on the admin page, drawn from the shared list.
 *
 * A list that staff may type past (a university not yet listed) gets the
 * type-or-choose box; a closed list gets a plain dropdown.
 */
/**
 * A section's fields in its groups (RESIDENT_GROUPS), each under a small
 * heading. A section with no groups is the plain grid it always was.
 */
function GroupedFields({
  sectionKey,
  fields,
  readOnly,
  form,
  set,
}: {
  sectionKey: string;
  fields: ResidentField[];
  readOnly: boolean;
  form: Resident;
  set: (p: ResidentPatch) => void;
}) {
  const grid = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";
  const field = (f: ResidentField) => (
    <AdminField key={f.key} field={f} readOnly={readOnly} form={form} set={set} />
  );
  const groups = RESIDENT_GROUPS[sectionKey];
  if (!groups) return <div className={grid}>{fields.map(field)}</div>;

  const byKey = new Map(fields.map((f) => [String(f.key), f]));
  const placed = new Set<string>();
  const parts = groups
    .map((g) => {
      const mine = g.keys.map((k) => byKey.get(k)).filter(Boolean) as ResidentField[];
      mine.forEach((f) => placed.add(String(f.key)));
      return { g, mine };
    })
    .filter((p) => p.mine.length);
  // anything no group names still shows, rather than vanishing
  const rest = fields.filter((f) => !placed.has(String(f.key)));

  return (
    <div className="divide-y divide-border">
      {parts.map(({ g, mine }) => (
        <div key={g.title} className="py-4 first:pt-0 last:pb-0">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.title}
          </p>
          {g.address && readOnly ? (
            // read as it is written on an envelope: one line, not four boxes
            <p className="text-sm text-foreground">{addressLine(mine, form) || "—"}</p>
          ) : (
            <div className={grid}>{mine.map(field)}</div>
          )}
        </div>
      ))}
      {rest.length ? (
        <div className="py-4 last:pb-0">
          <div className={grid}>{rest.map(field)}</div>
        </div>
      ) : null}
    </div>
  );
}

/** "qwerty, 1234 perlis, Malaysia" - street, then postcode and state, then country. */
function addressLine(fields: ResidentField[], form: Resident) {
  const value = (f?: ResidentField) => (f ? String(form[f.camel] ?? "").trim() : "");
  const shown = (f?: ResidentField) => {
    const v = value(f);
    // a country is stored as its code; show its name
    return f?.kind === "choice" ? (f.options?.find((o) => o.value === v)?.label ?? v) : v;
  };
  // found by what they are, not where they sit, so a missing one shifts nothing
  const part = (end: string) => fields.find((f) => String(f.key).endsWith(end));
  const [street, postcode, state, country] = [
    part("address"),
    part("postcode"),
    part("state"),
    part("country"),
  ];
  return [shown(street), [shown(postcode), shown(state)].filter(Boolean).join(" "), shown(country)]
    .filter(Boolean)
    .join(", ");
}

/**
 * The payment frequency the rent invoices are made with. It was a field of its
 * own on the profile, copied from the booking once - changing it changed no
 * invoice (Dani and Rina, 7 Oct 2026). The booking keeps the quote's; the rent
 * schedule on Payments is the one place to change it.
 */
function PayScheduleField({ residentId, saved }: { residentId: string; saved: string }) {
  const { data: rent } = useQuery({
    queryKey: ["resident-rent", residentId],
    queryFn: () => getResidentRent({ data: { residentId } }),
    enabled: !!residentId,
  });
  const value = rent?.schedule?.frequency || saved;
  const label = SCHEDULES.find((s) => s.value === value)?.label ?? value;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Payment frequency</p>
      <p className="flex h-9 items-center truncate text-sm text-foreground">{label || "—"}</p>
      <Link
        to="/admin/residents/$id"
        params={{ id: residentId }}
        search={{ tab: "payments" } as never}
        className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {rent?.schedule ? "Change it in Payments → Rent schedule" : "Set up the rent schedule in Payments"}
      </Link>
    </div>
  );
}

function AdminField({
  field: f,
  readOnly,
  form,
  set,
}: {
  field: ResidentField;
  readOnly: boolean;
  form: Resident;
  set: (p: ResidentPatch) => void;
}) {
  const value = String(form[f.camel] ?? "");
  const onChange = (v: string) => set({ [f.camel]: v } as ResidentPatch);
  const label = f.kind === "id" ? idLabelFor(form.nationality) : f.label;
  const wide = f.wide ? "sm:col-span-2 lg:col-span-3" : "";

  // how they pay is what the rent invoices use - read from the rent schedule, changed only there (Dani, 7 Oct 2026)
  if (f.key === "pay_schedule") return <PayScheduleField residentId={form.id} saved={value} />;

  if (f.kind === "long") {
    return (
      <div className={wide}>
        <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
        {readOnly ? (
          <p className="text-sm text-foreground">{value || "—"}</p>
        ) : (
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.hint} />
        )}
      </div>
    );
  }

  if (f.kind === "choice") {
    const options =
      f.key === "pay_method"
        ? PAY_METHODS.map((m) => ({ value: m, label: m }))
        : // "Self" is what the student's "Myself" saves, so admin can choose it too
          f.key === "payer_relationship"
          ? RELATIONSHIP_OPTIONS
          : (f.options ?? []);
    return (
      <div className={wide}>
        {f.normalise ? (
          <Combo
            readOnly={readOnly}
            label={label}
            value={value}
            onChange={onChange}
            options={options}
            normalise={f.normalise}
          />
        ) : (
          <Select
            readOnly={readOnly}
            label={label}
            value={value}
            onChange={onChange}
            options={options}
          />
        )}
      </div>
    );
  }

  return (
    <div className={wide}>
      <Text
        readOnly={readOnly}
        label={label}
        type={f.kind === "email" ? "email" : f.kind === "date" ? "date" : "text"}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * The arrival the student chose on their link, above the checklist. "Asked
 * for a reminder" means the admin sends it - the website does not yet
 * (30 Sep 2026).
 */
function CheckInLine({ residentId }: { residentId: string }) {
  const { data } = useQuery({
    queryKey: ["admin", "resident-checkin", residentId],
    queryFn: () => getResidentCheckIn({ data: { id: residentId } }),
  });
  if (!data) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
      <span className="text-muted-foreground">Check-in:</span>
      {/* StatusPill's look, without its capitalising every word */}
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
          data.status === "booked"
            ? "border-emerald-200 bg-emerald-100 text-emerald-900"
            : data.status === "remind"
              ? "border-amber-200 bg-amber-100 text-amber-900"
              : "border-border bg-muted text-muted-foreground"
        }`}
      >
        {data.status === "booked"
          ? `Booked · ${new Date(`${data.on}T00:00:00`).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}, ${data.slot}`
          : data.status === "remind"
            ? "Asked for a reminder"
            : "Not chosen"}
      </span>
    </div>
  );
}
