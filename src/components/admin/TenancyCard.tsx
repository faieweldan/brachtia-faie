import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DocumentRow, StageStepper } from "@/components/admin/ops-ui";
import {
  addTask,
  fmtDate,
  saveTenancy,
  refreshUnits,
  type Tenancy,
  type TenancyStage,
} from "@/lib/ops-store";
import { DateInput } from "@/components/ui/date-input";

export const TENANCY_STAGES: { key: TenancyStage; label: string }[] = [
  { key: "draft", label: "Draft generated" },
  { key: "admin_signed", label: "Admin review & sign" },
  { key: "sent", label: "Sent to resident" },
  { key: "student_signed", label: "Student signed" },
  { key: "checkin_scheduled", label: "Check-in scheduled" },
  { key: "checked_in", label: "Checked in" },
  { key: "stamped", label: "Stamped" },
];

function nextStage(stage: TenancyStage): TenancyStage | null {
  const i = TENANCY_STAGES.findIndex((s) => s.key === stage);
  return i >= 0 && i < TENANCY_STAGES.length - 1 ? TENANCY_STAGES[i + 1]!.key : null;
}

export function TenancyCard({
  tenancy: t,
  residentName,
  link,
}: {
  tenancy: Tenancy;
  residentName: string;
  link: string;
}) {
  const next = nextStage(t.stage);
  const patch = (p: Partial<Tenancy>) => saveTenancy({ ...t, ...p });

  return (
    <div className="space-y-4">
      <StageStepper stages={TENANCY_STAGES} current={t.stage} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Tenancy start</p>
          <DateInput value={t.start} onChange={(e) => patch({ start: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Tenancy end</p>
          <DateInput value={t.end} onChange={(e) => patch({ end: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Check-in date</p>
          <DateInput value={t.checkinDate} onChange={(e) => patch({ checkinDate: e.target.value })} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
                onClick={async () => {
                  /*
                   * Checked in: the bed goes Booked -> Active on the server, which refuses
                   * while somebody else is still the bed's resident (8 Oct 2026). Never by
                   * date alone, and the stage only moves once it has said yes.
                   */
                  if (next === "checked_in") {
                    const { activateResidentBed } = await import("@/lib/homes.functions");
                    const res = await activateResidentBed({ data: { residentId: t.residentId } });
                    await refreshUnits();
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                  }
                  patch({ stage: next });
                  if (next === "checked_in") {
                    addTask({
                      type: "stamping",
                      title: "Stamp tenancy agreement",
                      refLabel: residentName || "Resident",
                      refId: t.id,
                      dueDate: t.checkinDate || t.start,
                      link,
                    });
                  }
                  if (next === "checkin_scheduled") {
                    addTask({
                      type: "checkin",
                      title: "Pre-check-in preparation",
                      refLabel: residentName || "Resident",
                      refId: t.id,
                      dueDate: t.checkinDate || t.start,
                      link,
                    });
                  }
                  toast.success(`Moved to ${TENANCY_STAGES.find((s) => s.key === next)?.label}`);
                }}
              >
                Mark {TENANCY_STAGES.find((s) => s.key === next)?.label}
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
                {c.done && c.date ? <span className="text-xs text-muted-foreground">{fmtDate(c.date)}</span> : null}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
