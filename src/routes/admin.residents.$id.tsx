import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Link2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { refreshMoney } from "@/lib/billing-client";

import { idLabelFor } from "@/lib/reference-data";
import { getDeclarationForResident } from "@/lib/declaration.functions";
import {
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
import {
  Dialog as ActionDialog,
  DialogContent as ActionDialogContent,
  DialogDescription as ActionDialogDescription,
  DialogHeader as ActionDialogHeader,
  DialogTitle as ActionDialogTitle,
} from "@/components/ui/dialog";
import { renewAgreement, reviseSchedule } from "@/lib/tenancy-docs.functions";
import { ResidentPayments } from "@/components/admin/ResidentPayments";
import { RESIDENT_DOCS, residentDocsFor, residentDocLabel } from "@/lib/resident-documents";
import { compressImage } from "@/lib/compress";
import { removeResidentDoc, residentDocUrl, uploadResidentDoc } from "@/lib/residents.functions";
import {
  PAY_METHODS,
  SCHEDULES,
  addTask,
  allBeds,
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
  const [active, setActive] = useState("personal");
  // sections are read-only until the pencil is clicked
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [linking, setLinking] = useState(false);
  const queryClient = useQueryClient();
  // deleting a former resident for good asks for their name to be typed back
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  // header actions that change the tenancy and issue revised documents
  const [roomChange, setRoomChange] = useState(false);
  const [newBedId, setNewBedId] = useState("");
  const [updateTenancyOpen, setUpdateTenancyOpen] = useState(false);
  const [tenancyEdit, setTenancyEdit] = useState({ start: "", end: "", rent: "" });
  const [asRenewal, setAsRenewal] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
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
  const tenancy = tenancies.find((t) => t.residentId === form.id);
  const placed = findBedForResident(units, form);
  const vacantBeds = allBeds(units).filter(
    ({ bed }) => bed.status === "vacant" || bed.id === form.bedId || bed.status === "held",
  );

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
      end: form.moveIn,
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
  const stay = {
    ...stayDates(tenancy, placed, form),
    rent: tenancy?.rent || placed?.bed.rent || placed?.room.rent || 0,
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
        description: "Send it to the student. It works for 30 days.",
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

  /**
   * Former residents with no QuickBooks id are test data - real residents from
   * the master list all carry one - so only they can be deleted for good, with
   * their invoices and payments. The server checks the same rules again.
   */
  const isFormer = (form.status || "").toLowerCase() === "inactive";
  const canDelete = isFormer && !form.quickbooksId.trim();
  const nameTyped = confirmName.trim().toLowerCase() === form.fullName.trim().toLowerCase();

  /** the agreement the resident's documents currently live under, if any */
  async function latestAgreementId(): Promise<string | null> {
    const { getTenancyDocs } = await import("@/lib/tenancy-docs.functions");
    const { agreements } = await getTenancyDocs({ data: { residentId: form!.id } });
    return agreements[0]?.id ?? null;
  }

  /**
   * Room Change: move the resident to the new bed, then issue revised
   * Schedule A and Schedule C under the same Agreement No. Previous versions
   * are kept by the server.
   */
  async function doRoomChange() {
    if (!form || !newBedId) return;
    setActionBusy(true);
    try {
      const row = findBed(units, newBedId);
      const oldBed = placed?.bed;
      const updated = {
        ...form,
        bedId: newBedId,
        roomId: row?.room.id,
        unitId: row?.unit.id,
        occupancy: row?.room.occupancy ?? form.occupancy,
      } as Resident;
      await saveResidentRecord(updated);
      setForm(updated);
      if (oldBed) vacateBed(oldBed.id);
      if (row) {
        updateBed(newBedId, {
          status: "booked",
          residentId: form.id,
          residentName: form.fullName,
          university: form.university,
          nationality: form.nationality,
          gender: form.gender,
          studentId: form.studentId,
        });
      }
      const agreementId = await latestAgreementId();
      if (agreementId) {
        const newPlaced = row
          ? { unit: row.unit, room: row.room, bed: row.bed }
          : undefined;
        const vals = currentMergeValues(updated, tenancy, newPlaced);
        await reviseSchedule({ data: { agreementId, docType: "sched_a", mergeValues: vals } });
        await reviseSchedule({ data: { agreementId, docType: "sched_c", mergeValues: vals } });
        toast.success("Room changed — revised Schedule A and C issued");
      } else {
        toast.success("Room changed");
      }
      setRoomChange(false);
      setNewBedId("");
      await queryClient.invalidateQueries({ queryKey: ["tenancy-docs", form.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the room");
    } finally {
      setActionBusy(false);
    }
  }

  /**
   * Update Tenancy: date and/or rent changes issue a revised Schedule A under
   * the same Agreement No.; a renewal starts a brand-new agreement instead.
   */
  async function doUpdateTenancy() {
    if (!form || !tenancy) return;
    setActionBusy(true);
    try {
      const start = tenancyEdit.start || tenancy.start;
      const end = tenancyEdit.end || tenancy.end;
      const rent = tenancyEdit.rent ? Number(tenancyEdit.rent) : tenancy.rent;
      saveTenancy({ ...tenancy, start, end, rent });
      const vals = currentMergeValues(form, { ...tenancy, start, end, rent }, placed);
      if (asRenewal) {
        const res = await renewAgreement({
          data: {
            residentId: form.id,
            tenancyId: tenancy.id,
            mergeValues: vals,
            periodStart: start,
            periodEnd: end,
          },
        });
        toast.success(`Renewal created — ${res.agreementNo}`);
      } else {
        const agreementId = await latestAgreementId();
        if (agreementId) {
          await reviseSchedule({
            data: { agreementId, docType: "sched_a", mergeValues: vals, periodStart: start, periodEnd: end },
          });
          toast.success("Tenancy updated — revised Schedule A issued");
        } else {
          toast.success("Tenancy updated");
        }
      }
      setUpdateTenancyOpen(false);
      setAsRenewal(false);
      await queryClient.invalidateQueries({ queryKey: ["tenancy-docs", form.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the tenancy");
    } finally {
      setActionBusy(false);
    }
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNewBedId("");
                    setRoomChange(true);
                  }}
                >
                  Room Change
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTenancyEdit({ start: tenancy.start, end: tenancy.end, rent: String(tenancy.rent || "") });
                    setAsRenewal(false);
                    setUpdateTenancyOpen(true);
                  }}
                >
                  Update Tenancy
                </Button>
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

          <ActionDialog open={roomChange} onOpenChange={setRoomChange}>
            <ActionDialogContent className="admin-ui">
              <ActionDialogHeader>
                <ActionDialogTitle className="text-base font-bold text-brand-deep">
                  Room Change
                </ActionDialogTitle>
                <ActionDialogDescription>
                  The resident moves to the new bed, and revised Schedule A and Schedule C are
                  issued under the same Agreement No. Previous versions are kept.
                </ActionDialogDescription>
              </ActionDialogHeader>
              <Select
                label="New bed"
                value={newBedId}
                onChange={setNewBedId}
                options={vacantBeds
                  .filter(({ bed }) => bed.id !== placed?.bed.id)
                  .map(({ unit, room, bed }) => ({
                    value: bed.id,
                    label: `${unit.unitNo} · Room ${room.letter} · ${bed.label}`,
                  }))}
                placeholder="Select bed"
              />
              <Button disabled={!newBedId || actionBusy} onClick={() => void doRoomChange()}>
                {actionBusy ? "Changing…" : "Confirm room change"}
              </Button>
            </ActionDialogContent>
          </ActionDialog>

          <ActionDialog open={updateTenancyOpen} onOpenChange={setUpdateTenancyOpen}>
            <ActionDialogContent className="admin-ui">
              <ActionDialogHeader>
                <ActionDialogTitle className="text-base font-bold text-brand-deep">
                  Update Tenancy
                </ActionDialogTitle>
                <ActionDialogDescription>
                  Date or rent changes issue a revised Schedule A under the same Agreement No.
                  Tick renewal to start a brand-new agreement instead.
                </ActionDialogDescription>
              </ActionDialogHeader>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Tenancy start</p>
                  <Input
                    type="date"
                    value={tenancyEdit.start}
                    onChange={(e) => setTenancyEdit({ ...tenancyEdit, start: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Tenancy end</p>
                  <Input
                    type="date"
                    value={tenancyEdit.end}
                    onChange={(e) => setTenancyEdit({ ...tenancyEdit, end: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Monthly rent (RM)</p>
                  <Input
                    type="number"
                    value={tenancyEdit.rent}
                    onChange={(e) => setTenancyEdit({ ...tenancyEdit, rent: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={asRenewal} onCheckedChange={(v) => setAsRenewal(!!v)} />
                This is a renewal — create a new Agreement No.
              </label>
              <Button disabled={actionBusy} onClick={() => void doUpdateTenancy()}>
                {actionBusy ? "Saving…" : asRenewal ? "Create renewal" : "Save & revise Schedule A"}
              </Button>
            </ActionDialogContent>
          </ActionDialog>
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
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {s.fields
                        .filter((f) => residentFieldShown(f, form))
                        .map((f) => (
                          <AdminField
                            key={f.key}
                            field={f}
                            readOnly={!isEditing(s.key)}
                            form={form}
                            set={set}
                          />
                        ))}
                    </div>
                  </Panel>
                </section>
              ))}

              <section id="sec-documents" ref={sectionRef("documents")} className="scroll-mt-24">
                <Panel
                  title="Documents"
                  description="Files the student sent, and any added here. Preview opens a private link."
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
                          // opened before the link is fetched, so the browser
                          // treats it as the click it came from and not a pop-up
                          const tab = window.open("", "_blank");
                          const res = await residentDocUrl({
                            data: { residentId: form.id, key: d.key },
                          });
                          if (!res.ok) {
                            tab?.close();
                            toast.error(res.error);
                            return;
                          }
                          if (tab) tab.location.href = res.url;
                          else window.location.href = res.url;
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
          <Panel
            title="Placement"
            description="Which bed this resident occupies, and the term."
            action={editAction("placement")}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnlyField
                label="Resident ID"
                value={residentIdOf(form) || "Given once gender and nationality are saved"}
              />
              <Select
                readOnly={!isEditing("placement")}
                label="Assigned bed"
                // the placement is recorded on the bed, so the resident's own
                // bedId is empty for anyone imported from the master list
                value={form.bedId || placed?.bed.id || ""}
                onChange={(v) => {
                  const row = findBed(units, v);
                  set({
                    bedId: v,
                    roomId: row?.room.id,
                    unitId: row?.unit.id,
                    occupancy: row?.room.occupancy ?? form.occupancy,
                  });
                }}
                // the bed they are already in is not vacant, so it has to be
                // added or the field shows nothing
                options={[
                  ...(placed
                    ? [
                        {
                          value: placed.bed.id,
                          label: `${placed.unit.unitNo} · Room ${placed.room.letter} · ${placed.bed.label}`,
                        },
                      ]
                    : []),
                  ...vacantBeds
                    .filter(({ bed }) => bed.id !== placed?.bed.id)
                    .map(({ unit, room, bed }) => ({
                      value: bed.id,
                      label: `${unit.unitNo} · Room ${room.letter} · ${bed.label}`,
                    })),
                ]}
                placeholder={vacantBeds.length ? "Select bed" : "No beds set up yet"}
              />
              <Text
                readOnly={!isEditing("placement")}
                label="Occupancy"
                value={form.occupancy || placed?.room.occupancy || ""}
                onChange={(v) => set({ occupancy: v })}
                placeholder="single / twin"
              />
              <Text
                readOnly={!isEditing("placement")}
                label="Move-in date"
                type="date"
                value={form.moveIn}
                onChange={(v) => set({ moveIn: v })}
              />
              <Text
                readOnly={!isEditing("placement")}
                label="Lease length (months)"
                value={form.leaseMonths}
                onChange={(v) => set({ leaseMonths: v })}
              />
            </div>
          </Panel>

          <Panel title="Declaration" description="What this resident agreed to, and when.">
            <DeclarationStatus residentId={form.id} />
          </Panel>

          {tenancy ? (
            <TenancyDocs
              resident={form}
              tenancy={tenancy}
              checklist={
                <Panel title="Pre-check-in checklist" description="Prepare for move-in day.">
                  <div className="space-y-2">
                    {tenancy.checklist.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={c.done}
                          onCheckedChange={(v) =>
                            saveTenancy({
                              ...tenancy,
                              checklist: tenancy.checklist.map((x) =>
                                x.key === c.key
                                  ? { ...x, done: !!v, date: v ? new Date().toISOString() : undefined }
                                  : x,
                              ),
                            })
                          }
                        />
                        <span className={c.done ? "text-muted-foreground line-through" : ""}>
                          {c.label}
                        </span>
                        {c.done && c.date ? (
                          <span className="text-xs text-muted-foreground">{fmtDate(c.date)}</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </Panel>
              }
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
        : f.key === "pay_schedule"
          ? SCHEDULES.map((s) => ({ value: s.value, label: s.label }))
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
