import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DocumentRow,
  EmptyState,
  Panel,
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

/** "12 months", or "1 y 2 m" once it passes a year. Empty when dates are missing. */
function monthsBetween(start: string, end: string) {
  if (!start || !end) return "";
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const months = Math.max(
    0,
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()),
  );
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const rem = months % 12;
  return rem
    ? `${Math.floor(months / 12)}y ${rem}m`
    : `${Math.floor(months / 12)} year${months === 12 ? "" : "s"}`;
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
  const { residents, units, tenancies } = useOps();
  const stored = residents.find((r) => r.id === id);
  const [form, setForm] = useState<Resident | null>(stored ?? null);
  const [tab, setTab] = useState("profile");
  const [active, setActive] = useState("personal");
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

  if (!stored || !form) {
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
    try {
      await saveResidentRecord(form);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save resident");
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

  return (
    <div className="space-y-5">
      <Button asChild size="sm" variant="ghost" className="-ml-2 self-start">
        <Link to="/admin/residents">
          <ArrowLeft className="mr-1 size-4" /> Residents
        </Link>
      </Button>

      <Panel>
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {/* photo comes later; initials keep the shape stable until then */}
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-base font-semibold tracking-wide text-brand-deep">
              {initials(form.fullName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-brand-deep">
                {form.fullName || "New resident"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[form.legacyId && `ID ${form.legacyId}`, form.university, form.nationality]
                  .filter(Boolean)
                  .join(" · ") || "No details yet"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {placed
                  ? `${placed.unit.unitNo} · Room ${placed.room.letter} · ${placed.bed.label}`
                  : "No placement yet"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill status={stay.status} />
                {form.gender ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {form.gender}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 lg:order-last">
            <Button size="sm" onClick={save}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await deleteResident(form.id);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not remove resident");
                  return;
                }
                toast.success("Resident removed");
                void navigate({ to: "/admin/residents" });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="grid w-full grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-4 lg:w-auto lg:flex-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
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
              <p className="mt-1.5 text-xs text-muted-foreground">Missing: {missing.join(", ")}</p>
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
            </nav>

            <div className="min-w-0 flex-1 space-y-4">
              <section id="sec-personal" ref={sectionRef("personal")} className="scroll-mt-24">
                <Panel title="Personal">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Text
                      label="Full name (per passport / NRIC)"
                      value={form.fullName}
                      onChange={(v) => set({ fullName: v })}
                    />
                    <Text
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(v) => set({ email: v })}
                    />
                    <Text
                      label="Mobile number"
                      value={form.mobile}
                      onChange={(v) => set({ mobile: v })}
                    />
                    <Text
                      label="Date of birth"
                      type="date"
                      value={form.dob}
                      onChange={(v) => set({ dob: v })}
                    />
                    <Text
                      label="Nationality"
                      value={form.nationality}
                      onChange={(v) => set({ nationality: v })}
                    />
                    <Text
                      label="Passport / NRIC number"
                      value={form.idNumber}
                      onChange={(v) => set({ idNumber: v })}
                    />
                    <Select
                      label="Gender"
                      value={form.gender}
                      onChange={(v) => set({ gender: v })}
                      options={GENDERS.filter((g) => g !== "Any")}
                    />
                    <Select
                      label="Marital status"
                      value={form.maritalStatus}
                      onChange={(v) => set({ maritalStatus: v })}
                      options={["Single", "Married", "Other"]}
                    />
                    <Text label="Race" value={form.race} onChange={(v) => set({ race: v })} />
                    <Text
                      label="Religion"
                      value={form.religion}
                      onChange={(v) => set({ religion: v })}
                    />
                    <Select
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
                      <Textarea
                        value={form.medicalDetail}
                        onChange={(e) => set({ medicalDetail: e.target.value })}
                        placeholder="Conditions, allergies, medication…"
                      />
                    </div>
                  </div>
                </Panel>
              </section>

              <section id="sec-academic" ref={sectionRef("academic")} className="scroll-mt-24">
                <Panel title="Academic">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Text
                      label="University / college"
                      value={form.university}
                      onChange={(v) => set({ university: v })}
                    />
                    <Select
                      label="Level of study"
                      value={form.levelOfStudy}
                      onChange={(v) => set({ levelOfStudy: v })}
                      options={LEVELS}
                    />
                    <Text
                      label="Course / programme"
                      value={form.course}
                      onChange={(v) => set({ course: v })}
                    />
                    <Text
                      label="Student ID"
                      value={form.studentId}
                      onChange={(v) => set({ studentId: v })}
                    />
                    <Text
                      label="Expected graduation year"
                      value={form.graduationYear}
                      onChange={(v) => set({ graduationYear: v })}
                    />
                  </div>
                </Panel>
              </section>

              <section id="sec-emergency" ref={sectionRef("emergency")} className="scroll-mt-24">
                <Panel title="Emergency contact">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Text
                      label="Full name"
                      value={form.ecName}
                      onChange={(v) => set({ ecName: v })}
                    />
                    <Text
                      label="Relationship"
                      value={form.ecRelationship}
                      onChange={(v) => set({ ecRelationship: v })}
                    />
                    <Text
                      label="Mobile number"
                      value={form.ecMobile}
                      onChange={(v) => set({ ecMobile: v })}
                    />
                    <Text
                      label="Email"
                      type="email"
                      value={form.ecEmail}
                      onChange={(v) => set({ ecEmail: v })}
                    />
                    <Text
                      label="Address"
                      value={form.ecAddress}
                      onChange={(v) => set({ ecAddress: v })}
                    />
                    <Text
                      label="Postcode"
                      value={form.ecPostcode}
                      onChange={(v) => set({ ecPostcode: v })}
                    />
                    <Text
                      label="State"
                      value={form.ecState}
                      onChange={(v) => set({ ecState: v })}
                    />
                    <Text
                      label="Country"
                      value={form.ecCountry}
                      onChange={(v) => set({ ecCountry: v })}
                    />
                  </div>
                </Panel>
              </section>

              <section id="sec-payment" ref={sectionRef("payment")} className="scroll-mt-24">
                <Panel title="Payor details">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Select
                      label="Payment method"
                      value={form.payMethod}
                      onChange={(v) => set({ payMethod: v })}
                      options={PAY_METHODS}
                    />
                    <Select
                      label="Payment schedule"
                      value={form.paySchedule}
                      onChange={(v) => set({ paySchedule: v })}
                      options={SCHEDULES.map((s) => ({ value: s.value, label: s.label }))}
                    />
                    <Text
                      label="Payor name"
                      value={form.payerName}
                      onChange={(v) => set({ payerName: v })}
                    />
                    <Text
                      label="Relationship to resident"
                      value={form.payerRelationship}
                      onChange={(v) => set({ payerRelationship: v })}
                    />
                    <Text
                      label="Payor mobile"
                      value={form.payerMobile}
                      onChange={(v) => set({ payerMobile: v })}
                    />
                    <Text
                      label="Payor email"
                      type="email"
                      value={form.payerEmail}
                      onChange={(v) => set({ payerEmail: v })}
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
          <Panel title="Placement" description="Which bed this resident occupies, and the term.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="Assigned bed"
                value={form.bedId ?? ""}
                onChange={(v) => {
                  const row = findBed(units, v);
                  set({
                    bedId: v,
                    roomId: row?.room.id,
                    unitId: row?.unit.id,
                    occupancy: row?.room.occupancy ?? form.occupancy,
                  });
                }}
                options={vacantBeds.map(({ unit, room, bed }) => ({
                  value: bed.id,
                  label: `${unit.unitNo} · Room ${room.letter} · ${bed.label}`,
                }))}
                placeholder={vacantBeds.length ? "Select bed" : "No beds set up yet"}
              />
              <Text
                label="Occupancy"
                value={form.occupancy}
                onChange={(v) => set({ occupancy: v })}
                placeholder="single / twin"
              />
              <Text
                label="Move-in date"
                type="date"
                value={form.moveIn}
                onChange={(v) => set({ moveIn: v })}
              />
              <Text
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
          <ResidentPayments residentId={form.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
