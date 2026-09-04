import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSignature } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DocumentRow, EmptyState, Panel, StageStepper } from "@/components/admin/ops-ui";
import {
  addTask,
  findBed,
  fmtDate,
  money,
  saveTenancy,
  updateBed,
  useOps,
  type Tenancy,
  type TenancyStage,
} from "@/lib/ops-store";

export const Route = createFileRoute("/admin/residents/tenancies")({
  component: TenanciesPage,
});

const STAGES: { key: TenancyStage; label: string }[] = [
  { key: "draft", label: "Draft generated" },
  { key: "admin_signed", label: "Admin review & sign" },
  { key: "sent", label: "Sent to student" },
  { key: "student_signed", label: "Student signed" },
  { key: "checkin_scheduled", label: "Check-in scheduled" },
  { key: "checked_in", label: "Checked in" },
  { key: "stamped", label: "Stamped" },
];

function nextStage(stage: TenancyStage): TenancyStage | null {
  const i = STAGES.findIndex((s) => s.key === stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1]!.key : null;
}

function TenanciesPage() {
  const { tenancies, residents, units } = useOps();

  if (tenancies.length === 0) {
    return (
      <EmptyState
        icon={FileSignature}
        title="No tenancies yet"
        hint="Complete a resident profile and create a tenancy — the agreement lifecycle then appears here."
        action={
          <Button asChild size="sm">
            <Link to="/admin/residents">Go to residents</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {tenancies.map((t) => {
        const resident = residents.find((r) => r.id === t.residentId);
        const placed = findBed(units, t.bedId);
        const next = nextStage(t.stage);

        const patch = (p: Partial<Tenancy>) => saveTenancy({ ...t, ...p });

        return (
          <Panel key={t.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-deep">
                  {resident?.fullName || "Resident"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {placed
                    ? `${placed.unit.residenceName} · ${placed.unit.unitNo} · Room ${placed.room.letter} · ${placed.bed.label}`
                    : "No placement"}{" "}
                  · {money(t.rent)}/mo
                </p>
              </div>
              {resident ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/residents/$id" params={{ id: resident.id }}>
                    Open profile
                  </Link>
                </Button>
              ) : null}
            </div>

            <div className="mt-4">
              <StageStepper stages={STAGES} current={t.stage} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Tenancy start</p>
                <Input type="date" value={t.start} onChange={(e) => patch({ start: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Tenancy end</p>
                <Input type="date" value={t.end} onChange={(e) => patch({ end: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Check-in date</p>
                <Input type="date" value={t.checkinDate} onChange={(e) => patch({ checkinDate: e.target.value })} />
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-brand-deep">Agreement</p>
                <DocumentRow
                  label="Tenancy agreement"
                  fileName={t.agreementFile}
                  onUpload={(name) => patch({ agreementFile: name })}
                  onClear={() => saveTenancy({ ...t, agreementFile: undefined } as Tenancy)}
                />
                <DocumentRow
                  label="Stamped agreement"
                  fileName={t.stampedFile}
                  onUpload={(name) => {
                    patch({ stampedFile: name, stage: "stamped" });
                    toast.success("Stamped copy recorded");
                  }}
                  onClear={() => saveTenancy({ ...t, stampedFile: undefined } as Tenancy)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toast.info("Agreement template is coming soon — set it in Settings")}
                  >
                    Generate from template
                  </Button>
                  {next ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        patch({ stage: next });
                        if (next === "checked_in") {
                          updateBed(t.bedId ?? "", { status: "active" });
                          addTask({
                            type: "stamping",
                            title: "Stamp tenancy agreement",
                            refLabel: resident?.fullName || "Resident",
                            refId: t.id,
                            dueDate: t.checkinDate || t.start,
                            link: "/admin/residents/tenancies",
                          });
                        }
                        if (next === "checkin_scheduled") {
                          addTask({
                            type: "checkin",
                            title: "Pre-check-in preparation",
                            refLabel: resident?.fullName || "Resident",
                            refId: t.id,
                            dueDate: t.checkinDate || t.start,
                            link: "/admin/residents/tenancies",
                          });
                        }
                        toast.success(`Moved to ${STAGES.find((s) => s.key === next)?.label}`);
                      }}
                    >
                      Mark {STAGES.find((s) => s.key === next)?.label}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <p className="text-xs font-semibold text-brand-deep">Pre-check-in checklist</p>
                <div className="mt-2 space-y-2">
                  {t.checklist.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={c.done}
                        onCheckedChange={(v) =>
                          patch({
                            checklist: t.checklist.map((x) =>
                              x.key === c.key
                                ? { ...x, done: !!v, date: v ? new Date().toISOString() : undefined }
                                : x,
                            ),
                          })
                        }
                      />
                      <span className={c.done ? "text-muted-foreground line-through" : ""}>{c.label}</span>
                      {c.done && c.date ? (
                        <span className="text-xs text-muted-foreground">{fmtDate(c.date)}</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
