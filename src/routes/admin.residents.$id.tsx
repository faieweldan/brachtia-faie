import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Link2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DocumentRow,
  EmptyState,
  Panel,
  ReadOnlyField,
  Select,
  StatusPill,
  Text,
} from "@/components/admin/ops-ui";
import { TenancyCard } from "@/components/admin/TenancyCard";
import { ResidentPayments } from "@/components/admin/ResidentPayments";
import {
  DOC_TYPES,
  GENDERS,
  LEVELS,
  PAY_METHODS,
  SCHEDULES,
  addTask,
  allBeds,
  blankResident,
  completeness,
  fmtDate,
  money,
  createTenancy,
  deleteResident,
  findBed,
  findBedForResident,
  saveResidentRecord,
  updateBed,
  useOps,
  type BedStatus,
  type Resident,
  type ResidentPatch,
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

const PROFILE_SECTIONS = [
  { key: "personal", label: "Personal" },
  { key: "academic", label: "Academic" },
  { key: "emergency", label: "Emergency contact" },
  { key: "payment", label: "Payor details" },
  { key: "documents", label: "Documents" },
  { key: "portal", label: "Portal access" },
];

export const Route = createFileRoute("/admin/residents/$id")({
  component: ResidentProfilePage,
});

function ResidentProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { residents, units, tenancies, payments } = useOps();
  // "new" is a resident that does not exist yet: the form is filled in first and
  // the row is only created on save, so an abandoned form leaves nothing behind
  const isNew = id === "new";
  const stored = residents.find((r) => r.id === id);
  const [form, setForm] = useState<Resident | null>(isNew ? blankResident() : (stored ?? null));
  const [tab, setTab] = useState("profile");
  const [active, setActive] = useState("personal");
  // sections are read-only until the pencil is clicked
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [linking, setLinking] = useState(false);
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
    start: tenancy?.start || placed?.bed.tenancyStart || form.moveIn || "",
    end: tenancy?.end || placed?.bed.tenancyEnd || "",
    rent: tenancy?.rent || placed?.bed.rent || placed?.room.rent || 0,
    status: (placed?.bed.status ?? "vacant") as BedStatus,
    get duration() {
      return monthsBetween(this.start, this.end);
    },
  };

  /**
   * A blank row is an accident, not a record: no name, no Brachtia id, no bed,
   * no tenancy, no payments. Nothing points at it, so removing it loses nothing.
   * Anyone with real data is deactivated instead.
   */
  const isEmptyDraft =
    !form.fullName.trim() &&
    !form.quickbooksId.trim() &&
    !form.email.trim() &&
    !placed &&
    !tenancy &&
    !payments.some((p) => p.residentId === form.id);

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
   * Residents are never deleted - they are history, and a deleted one would
   * leave payments and agreements pointing at nothing. Deactivating marks them
   * inactive and frees the bed they held.
   */
  async function deactivate() {
    const bed = placed?.bed;
    try {
      await saveResidentRecord({ ...form, status: "Inactive" } as Resident);
      if (bed) {
        updateBed(bed.id, {
          status: "vacant",
          residentId: undefined,
          residentName: undefined,
          tenancyStart: undefined,
          tenancyEnd: undefined,
          rent: undefined,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deactivate resident");
      return;
    }
    toast.success("Resident deactivated");
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
                  form.quickbooksId && `ID ${form.quickbooksId}`,
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

          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" onClick={save}>
              Save
            </Button>
            {isEmptyDraft ? (
              <Button size="sm" variant="outline" onClick={discard}>
                <Trash2 className="mr-1 size-3.5" /> Discard
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={deactivate}>
                Deactivate
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "Residence", value: placed?.unit.residenceName },
            { label: "Unit", value: placed?.unit.unitNo },
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
                {PROFILE_SECTIONS.map((s) => (
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
                {linking ? "Preparing…" : "Copy profile link"}
              </Button>
            </nav>

            <div className="min-w-0 flex-1 space-y-4">
              <section id="sec-personal" ref={sectionRef("personal")} className="scroll-mt-24">
                <Panel title="Personal" action={editAction("personal")}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Full name (per passport / NRIC)"
                      value={form.fullName}
                      onChange={(v) => set({ fullName: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(v) => set({ email: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Mobile number"
                      value={form.mobile}
                      onChange={(v) => set({ mobile: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Date of birth"
                      type="date"
                      value={form.dob}
                      onChange={(v) => set({ dob: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Nationality"
                      value={form.nationality}
                      onChange={(v) => set({ nationality: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Passport / NRIC number"
                      value={form.idNumber}
                      onChange={(v) => set({ idNumber: v })}
                    />
                    <Select
                      readOnly={!isEditing("personal")}
                      label="Gender"
                      value={form.gender}
                      onChange={(v) => set({ gender: v })}
                      options={GENDERS.filter((g) => g !== "Any")}
                    />
                    <Select
                      readOnly={!isEditing("personal")}
                      label="Marital status"
                      value={form.maritalStatus}
                      onChange={(v) => set({ maritalStatus: v })}
                      options={["Single", "Married", "Other"]}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Race"
                      value={form.race}
                      onChange={(v) => set({ race: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Religion"
                      value={form.religion}
                      onChange={(v) => set({ religion: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Address"
                      value={form.address}
                      onChange={(v) => set({ address: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Postcode"
                      value={form.postcode}
                      onChange={(v) => set({ postcode: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="State"
                      value={form.state}
                      onChange={(v) => set({ state: v })}
                    />
                    <Text
                      readOnly={!isEditing("personal")}
                      label="Country"
                      value={form.country}
                      onChange={(v) => set({ country: v })}
                    />
                    <Select
                      readOnly={!isEditing("personal")}
                      label="Medical condition / allergy"
                      value={form.medicalCondition}
                      onChange={(v) => set({ medicalCondition: v })}
                      options={[
                        { value: "no", label: "No" },
                        { value: "yes", label: "Yes" },
                      ]}
                    />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <p className="mb-1.5 text-xs text-muted-foreground">Medical details</p>
                      {isEditing("personal") ? (
                        <Textarea
                          value={form.medicalDetail}
                          onChange={(e) => set({ medicalDetail: e.target.value })}
                          placeholder="Conditions, allergies, medication…"
                        />
                      ) : (
                        <p className="text-sm text-foreground">{form.medicalDetail || "—"}</p>
                      )}
                    </div>
                  </div>
                </Panel>
              </section>

              <section id="sec-academic" ref={sectionRef("academic")} className="scroll-mt-24">
                <Panel title="Academic" action={editAction("academic")}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Text
                      readOnly={!isEditing("academic")}
                      label="University / college"
                      value={form.university}
                      onChange={(v) => set({ university: v })}
                    />
                    <Select
                      readOnly={!isEditing("academic")}
                      label="Level of study"
                      value={form.levelOfStudy}
                      onChange={(v) => set({ levelOfStudy: v })}
                      options={LEVELS}
                    />
                    <Text
                      readOnly={!isEditing("academic")}
                      label="Course / programme"
                      value={form.course}
                      onChange={(v) => set({ course: v })}
                    />
                    <Text
                      readOnly={!isEditing("academic")}
                      label="Student ID"
                      value={form.studentId}
                      onChange={(v) => set({ studentId: v })}
                    />
                    <Text
                      readOnly={!isEditing("academic")}
                      label="Expected graduation year"
                      value={form.graduationYear}
                      onChange={(v) => set({ graduationYear: v })}
                    />
                  </div>
                </Panel>
              </section>

              <section id="sec-emergency" ref={sectionRef("emergency")} className="scroll-mt-24">
                <Panel title="Emergency contact" action={editAction("emergency")}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="Full name"
                      value={form.ecName}
                      onChange={(v) => set({ ecName: v })}
                    />
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="Relationship"
                      value={form.ecRelationship}
                      onChange={(v) => set({ ecRelationship: v })}
                    />
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="Mobile number"
                      value={form.ecMobile}
                      onChange={(v) => set({ ecMobile: v })}
                    />
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="Email"
                      type="email"
                      value={form.ecEmail}
                      onChange={(v) => set({ ecEmail: v })}
                    />
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="Address"
                      value={form.ecAddress}
                      onChange={(v) => set({ ecAddress: v })}
                    />
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="Postcode"
                      value={form.ecPostcode}
                      onChange={(v) => set({ ecPostcode: v })}
                    />
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="State"
                      value={form.ecState}
                      onChange={(v) => set({ ecState: v })}
                    />
                    <Text
                      readOnly={!isEditing("emergency")}
                      label="Country"
                      value={form.ecCountry}
                      onChange={(v) => set({ ecCountry: v })}
                    />
                  </div>
                </Panel>
              </section>

              <section id="sec-payment" ref={sectionRef("payment")} className="scroll-mt-24">
                <Panel title="Payor details" action={editAction("payment")}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Select
                      readOnly={!isEditing("payment")}
                      label="Payment method"
                      value={form.payMethod}
                      onChange={(v) => set({ payMethod: v })}
                      options={PAY_METHODS}
                    />
                    <Select
                      readOnly={!isEditing("payment")}
                      label="Payment schedule"
                      value={form.paySchedule}
                      onChange={(v) => set({ paySchedule: v })}
                      options={SCHEDULES.map((s) => ({ value: s.value, label: s.label }))}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Payor name"
                      value={form.payerName}
                      onChange={(v) => set({ payerName: v })}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Relationship to resident"
                      value={form.payerRelationship}
                      onChange={(v) => set({ payerRelationship: v })}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Payor mobile"
                      value={form.payerMobile}
                      onChange={(v) => set({ payerMobile: v })}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Payor email"
                      type="email"
                      value={form.payerEmail}
                      onChange={(v) => set({ payerEmail: v })}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Payor address"
                      value={form.payerAddress}
                      onChange={(v) => set({ payerAddress: v })}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Payor postcode"
                      value={form.payerPostcode}
                      onChange={(v) => set({ payerPostcode: v })}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Payor state"
                      value={form.payerState}
                      onChange={(v) => set({ payerState: v })}
                    />
                    <Text
                      readOnly={!isEditing("payment")}
                      label="Payor country"
                      value={form.payerCountry}
                      onChange={(v) => set({ payerCountry: v })}
                    />
                  </div>
                </Panel>
              </section>

              <section id="sec-documents" ref={sectionRef("documents")} className="scroll-mt-24">
                <Panel
                  title="Documents"
                  description="Uploads are recorded locally for now — file storage comes with the backend pass."
                >
                  {DOC_TYPES.map((d) => {
                    const doc = form.docs.find((x) => x.key === d.key);
                    return (
                      <DocumentRow
                        key={d.key}
                        label={d.label}
                        fileName={doc?.fileName}
                        uploadedAt={doc?.uploadedAt}
                        onUpload={(name) =>
                          set({
                            docs: [
                              ...form.docs.filter((x) => x.key !== d.key),
                              {
                                key: d.key,
                                label: d.label,
                                fileName: name,
                                uploadedAt: new Date().toISOString(),
                              },
                            ],
                          })
                        }
                        onClear={() => set({ docs: form.docs.filter((x) => x.key !== d.key) })}
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
              <ReadOnlyField label="QuickBooks ID" value={form.quickbooksId} />
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

          <Panel
            title="Tenancy"
            description="Agreement lifecycle, dates and pre-check-in checklist."
          >
            {tenancy ? (
              <TenancyCard
                tenancy={tenancy}
                residentName={form.fullName}
                link={`/admin/residents/${form.id}`}
              />
            ) : (
              <EmptyState
                title="No tenancy yet"
                hint="Complete the required profile fields, then create the tenancy to start the agreement."
                action={
                  <Button size="sm" disabled={pct < 100} onClick={startTenancy}>
                    Create tenancy
                  </Button>
                }
              />
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <ResidentPayments
            residentId={form.id}
            quickbooksId={form.quickbooksId}
            tenancyEnd={stay.end}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
