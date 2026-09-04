import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DocumentRow, EmptyState, Panel, Select, Text } from "@/components/admin/ops-ui";
import {
  DOC_TYPES,
  GENDERS,
  LEVELS,
  PAY_METHODS,
  SCHEDULES,
  addTask,
  allBeds,
  completeness,
  createTenancy,
  deleteResident,
  findBed,
  saveResidentRecord,
  updateBed,
  useOps,
  type Resident,
  type ResidentPatch,
} from "@/lib/ops-store";

export const Route = createFileRoute("/admin/residents/$id")({
  component: ResidentProfilePage,
});

function ResidentProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { residents, units, tenancies } = useOps();
  const stored = residents.find((r) => r.id === id);
  const [form, setForm] = useState<Resident | null>(stored ?? null);

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
  const placed = findBed(units, form.bedId);
  const vacantBeds = allBeds(units).filter(
    ({ bed }) => bed.status === "vacant" || bed.id === form.bedId || bed.status === "held",
  );

  function save() {
    if (!form) return;
    saveResidentRecord(form);
    if (form.bedId) {
      const row = findBed(units, form.bedId);
      if (row) {
        updateBed(form.bedId, {
          status: row.bed.status === "vacant" || row.bed.status === "held" ? "booked" : row.bed.status,
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
      link: "/admin/residents/tenancies",
    });
    toast.success("Tenancy created");
    void navigate({ to: "/admin/residents/tenancies" });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/residents">
            <ArrowLeft className="mr-1 size-4" /> Residents
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-brand-deep">{form.fullName || "New resident"}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {placed
              ? `${placed.unit.residenceName} · ${placed.unit.unitNo} · Room ${placed.room.letter} · ${placed.bed.label}`
              : "No placement yet"}
          </p>
        </div>
        <Button size="sm" onClick={save}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            deleteResident(form.id);
            toast.success("Resident removed");
            void navigate({ to: "/admin/residents" });
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-48 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-brand-deep">Profile completeness</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-deep transition-all" style={{ width: `${pct}%` }} />
            </div>
            {missing.length ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Missing: {missing.join(", ")}</p>
            ) : null}
          </div>
          {tenancy ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/residents/tenancies">View tenancy</Link>
            </Button>
          ) : (
            <Button size="sm" disabled={pct < 100} onClick={startTenancy}>
              Create tenancy
            </Button>
          )}
        </div>
      </Panel>

      <Tabs defaultValue="personal">
        <TabsList className="flex-wrap">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="housing">Housing & health</TabsTrigger>
          <TabsTrigger value="emergency">Emergency contact</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="portal">Portal access</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Text label="Full name (as per passport / NRIC)" value={form.fullName} onChange={(v) => set({ fullName: v })} />
              <Text label="Email" type="email" value={form.email} onChange={(v) => set({ email: v })} />
              <Text label="Mobile number" value={form.mobile} onChange={(v) => set({ mobile: v })} />
              <Text label="Date of birth" type="date" value={form.dob} onChange={(v) => set({ dob: v })} />
              <Text label="Nationality" value={form.nationality} onChange={(v) => set({ nationality: v })} />
              <Text label="Passport / NRIC number" value={form.idNumber} onChange={(v) => set({ idNumber: v })} />
              <Select label="Gender" value={form.gender} onChange={(v) => set({ gender: v })} options={GENDERS.filter((g) => g !== "Any")} />
              <Select
                label="Marital status"
                value={form.maritalStatus}
                onChange={(v) => set({ maritalStatus: v })}
                options={["Single", "Married", "Other"]}
              />
              <Text label="Race" value={form.race} onChange={(v) => set({ race: v })} />
              <Text label="Religion" value={form.religion} onChange={(v) => set({ religion: v })} />
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="academic" className="mt-4">
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Text label="University / college" value={form.university} onChange={(v) => set({ university: v })} />
              <Select label="Level of study" value={form.levelOfStudy} onChange={(v) => set({ levelOfStudy: v })} options={LEVELS} />
              <Text label="Course / programme" value={form.course} onChange={(v) => set({ course: v })} />
              <Text label="Student ID" value={form.studentId} onChange={(v) => set({ studentId: v })} />
              <Text label="Expected graduation year" value={form.graduationYear} onChange={(v) => set({ graduationYear: v })} />
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="housing" className="mt-4">
          <Panel>
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
              <Text label="Occupancy" value={form.occupancy} onChange={(v) => set({ occupancy: v })} placeholder="single / twin" />
              <Text label="Move-in date" type="date" value={form.moveIn} onChange={(v) => set({ moveIn: v })} />
              <Text label="Lease length (months)" value={form.leaseMonths} onChange={(v) => set({ leaseMonths: v })} />
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
        </TabsContent>

        <TabsContent value="emergency" className="mt-4">
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Text label="Full name" value={form.ecName} onChange={(v) => set({ ecName: v })} />
              <Text label="Relationship" value={form.ecRelationship} onChange={(v) => set({ ecRelationship: v })} />
              <Text label="Mobile number" value={form.ecMobile} onChange={(v) => set({ ecMobile: v })} />
              <Text label="Email" type="email" value={form.ecEmail} onChange={(v) => set({ ecEmail: v })} />
              <Text label="Address" value={form.ecAddress} onChange={(v) => set({ ecAddress: v })} />
              <Text label="Postcode" value={form.ecPostcode} onChange={(v) => set({ ecPostcode: v })} />
              <Text label="State" value={form.ecState} onChange={(v) => set({ ecState: v })} />
              <Text label="Country" value={form.ecCountry} onChange={(v) => set({ ecCountry: v })} />
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="payment" className="mt-4">
          <Panel>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select label="Preferred payment method" value={form.payMethod} onChange={(v) => set({ payMethod: v })} options={PAY_METHODS} />
              <Select
                label="Payment schedule"
                value={form.paySchedule}
                onChange={(v) => set({ paySchedule: v })}
                options={SCHEDULES.map((s) => ({ value: s.value, label: s.label }))}
              />
              <Text label="Payer name" value={form.payerName} onChange={(v) => set({ payerName: v })} />
              <Text label="Payer relationship" value={form.payerRelationship} onChange={(v) => set({ payerRelationship: v })} />
              <Text label="Payer mobile" value={form.payerMobile} onChange={(v) => set({ payerMobile: v })} />
              <Text label="Payer email" type="email" value={form.payerEmail} onChange={(v) => set({ payerEmail: v })} />
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Panel title="Documents" description="Uploads are recorded locally for now — file storage comes with the backend pass.">
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
                        { key: d.key, label: d.label, fileName: name, uploadedAt: new Date().toISOString() },
                      ],
                    })
                  }
                  onClear={() => set({ docs: form.docs.filter((x) => x.key !== d.key) })}
                />
              );
            })}
          </Panel>
        </TabsContent>

        <TabsContent value="portal" className="mt-4">
          <Panel title="Resident portal" description="Coming soon — invitations will be sent once the portal is live.">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
