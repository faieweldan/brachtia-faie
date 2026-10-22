import { roomName } from "@/lib/room-name";
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Dropdown } from "@/components/admin/Dropdown";
import { MIGRATION_STATUS, ResidentLine } from "@/components/admin/MigrationPanel";
import { Panel } from "@/components/admin/ops-ui";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { GENDERS } from "@/data/form-options";
import { klToday } from "@/lib/kl-date";
import {
  defaultAgreementNo,
  emptyExistingResident,
  existingResidentGrid,
  invoiceNoFrom,
  readIssues,
  type ExistingResidentInput,
} from "@/lib/migration/existing-resident";
import { previewSheet3Grid } from "@/lib/migration/sheet3";
import { money, refreshResidents, refreshUnits, useOps } from "@/lib/ops-store";
import {
  COUNTRIES,
  COUNTRY_OPTIONS,
  MARITAL_OPTIONS,
  PAYOR_RELATIONSHIP_OPTIONS,
  RACE_OPTIONS,
  REFERRAL_OPTIONS,
  RELIGION_OPTIONS,
  SCHEDULES,
  STATUS_OPTIONS,
  UNIVERSITY_OPTIONS,
  YES_NO_OPTIONS,
} from "@/lib/reference-data";
import { placementBedOptions } from "@/lib/room-offer";

export const Route = createFileRoute("/admin/residents/add-existing")({
  component: AddExistingResident,
});

/**
 * Add existing resident (Dani, 14 Oct 2026): one pre-system resident by hand,
 * instead of a row in the Sheet3 bulk upload. The answers become that row
 * (existingResidentGrid) and go through the bulk upload's own check and
 * import - the preview below is the bulk list's own card - so nothing here
 * decides what is allowed.
 */
function AddExistingResident() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { units, residents } = useOps();
  const [f, setF] = useState<ExistingResidentInput>(emptyExistingResident);
  // "Other" for university: what they typed is kept, as in the bulk file
  const [uniOther, setUniOther] = useState(false);
  // the agreement number follows start, unit and ID until admin edits it
  const [agreementEdited, setAgreementEdited] = useState(false);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const today = klToday();

  const set = (patch: Partial<ExistingResidentInput>) =>
    setF((cur) => {
      const next = { ...cur, ...patch };
      if (!agreementEdited) next.agreementNo = defaultAgreementNo(next.tenancyStart, next.unitNo, next.quickbooksId);
      return next;
    });

  // the bulk upload's own check, on this one resident
  const preview = useMemo(
    () => previewSheet3Grid(existingResidentGrid(f), { units, residents, today }),
    [f, units, residents, today],
  );
  const row = preview.rows[0];
  // the check's issues, read for someone filling it in: to fill, problems, later
  const read = useMemo(() => readIssues(row?.issues ?? [], f), [row, f]);

  // the room: residence -> unit -> room -> bed, from Homes
  const residences = useMemo(() => [...new Set(units.map((u) => u.residenceName))].sort(), [units]);
  const unitList = units.filter((u) => u.residenceName === f.residence).sort((a, b) => a.unitNo.localeCompare(b.unitNo));
  const unit = unitList.find((u) => u.unitNo === f.unitNo);
  const room = unit?.rooms.find((r) => r.letter === f.room);
  // each bed, and an empty twin room let whole as one single - room-offer.ts's rule
  const bedOptions = room ? placementBedOptions(room) : [];

  const dials = useMemo(
    () => [...new Map(COUNTRIES.map((c) => [c.dial, c])).values()].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const mys = f.nationality === "MYS";
  const num = (v: string) => Number(v.replace(/,/g, "")) || 0;
  const linesSum =
    num(f.proratedRent) + num(f.advanceRent) + num(f.securityDeposit) + num(f.utilitiesDeposit) +
    num(f.accessCardDeposit) + num(f.residentCardCharges) + num(f.adminAgreementCharges) + num(f.starterPack);
  const totalOff = f.totalPaid !== "" && Math.abs(num(f.totalPaid) - linesSum) > 0.005;

  async function add() {
    if (!row || row.status === "blocked" || busy) return;
    setBusy(true);
    try {
      // the bulk upload's own import, for this one row
      const { importMigration } = await import("@/lib/migration/import.functions");
      const { outcomes } = await importMigration({ data: { rows: [row], today } });
      const out = outcomes[0];
      if (out?.result !== "imported") {
        toast.error(out && "reason" in out ? out.reason : "The resident could not be added");
        return;
      }
      // the new resident and their bed show on every screen, as after a bulk import
      await Promise.all([refreshUnits(), refreshResidents()]);
      void queryClient.invalidateQueries();
      toast.success(`${row.residentName} added`);
      void navigate({ to: "/admin/residents/$id", params: { id: out.residentId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The resident could not be added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/admin/residents" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Residents
          </Link>
          <h2 className="text-lg font-semibold text-brand-deep">Add existing resident</h2>
          <p className="text-xs text-muted-foreground">
            Someone already living here from before the system. Checked and saved exactly like one row of the bulk upload.
          </p>
        </div>
      </div>

      <Panel title="Identity">
        <Grid>
          <F label="QuickBooks ID">
            <Input value={f.quickbooksId} inputMode="numeric" placeholder="00724" onChange={(e) => set({ quickbooksId: e.target.value.trim() })} />
          </F>
          <F label="Full name">
            <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </F>
          <F label="Gender">
            <Pick value={f.gender} onChange={(v) => set({ gender: v })} options={GENDERS.map((g) => ({ value: g, label: g }))} />
          </F>
          <F label="Nationality">
            <Pick value={f.nationality} onChange={(v) => set({ nationality: v })} options={COUNTRY_OPTIONS} />
          </F>
          <F label={mys ? "NRIC number" : "Passport number"}>
            <Input
              value={mys ? f.nric : f.passport}
              placeholder={mys ? "010203-14-5678" : "As printed on the passport"}
              onChange={(e) => set(mys ? { nric: e.target.value } : { passport: e.target.value })}
            />
          </F>
          <F label="Mobile">
            <div className="flex gap-2">
              <Dropdown value={f.dial} onChange={(e) => set({ dial: e.target.value })} className="h-9 w-32 shrink-0 rounded-md border border-input bg-background px-2 text-sm">
                {dials.map((c) => (
                  <option key={c.dial} value={c.dial}>
                    {c.dial} {c.name}
                  </option>
                ))}
              </Dropdown>
              <Input value={f.mobile} inputMode="tel" onChange={(e) => set({ mobile: e.target.value })} />
            </div>
          </F>
          <F label="Email">
            <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </F>
        </Grid>
      </Panel>

      <Panel title="Study">
        <Grid>
          <F label="Resident type">
            <Pick value={f.residentType} onChange={(v) => set({ residentType: v })} options={STATUS_OPTIONS} />
          </F>
          <F label="University">
            <Pick
              value={uniOther ? "OTHER" : f.university}
              onChange={(v) => {
                setUniOther(v === "OTHER");
                set({ university: v === "OTHER" ? "" : v });
              }}
              options={UNIVERSITY_OPTIONS}
            />
            {uniOther ? (
              <Input className="mt-2" placeholder="University name" value={f.university} onChange={(e) => set({ university: e.target.value })} />
            ) : null}
          </F>
        </Grid>
      </Panel>

      <Panel title="Application details" description="From their housing application form. Leave blank what was never asked.">
        <Grid>
          <F label="How did you hear about us?">
            <Pick value={f.referralSource} onChange={(v) => set({ referralSource: v })} options={REFERRAL_OPTIONS} />
          </F>
          <F label="Marital status">
            <Pick value={f.maritalStatus} onChange={(v) => set({ maritalStatus: v })} options={MARITAL_OPTIONS} />
          </F>
          <F label="Race">
            <Pick value={f.race} onChange={(v) => set({ race: v })} options={RACE_OPTIONS} />
          </F>
          <F label="Religion">
            <Pick value={f.religion} onChange={(v) => set({ religion: v })} options={RELIGION_OPTIONS} />
          </F>
          <F label="Address" wide>
            <Input value={f.address} onChange={(e) => set({ address: e.target.value })} />
          </F>
          <F label="Postal code">
            <Input value={f.postcode} onChange={(e) => set({ postcode: e.target.value })} />
          </F>
          <F label="State / region">
            <Input value={f.state} onChange={(e) => set({ state: e.target.value })} />
          </F>
          <F label="Country">
            <Pick value={f.country} onChange={(v) => set({ country: v })} options={COUNTRY_OPTIONS} />
          </F>
          <F label="Medical condition">
            <Pick value={f.medicalCondition} onChange={(v) => set({ medicalCondition: v })} options={YES_NO_OPTIONS} />
          </F>
          {f.medicalCondition === "yes" ? (
            <F label="Medical condition - details" wide>
              <Input value={f.medicalDetail} onChange={(e) => set({ medicalDetail: e.target.value })} />
            </F>
          ) : null}
        </Grid>
      </Panel>

      <Panel title="Room">
        <Grid>
          <F label="Residence">
            <Pick value={f.residence} onChange={(v) => set({ residence: v, unitNo: "", unitType: "", room: "", bed: "" })} options={residences.map((r) => ({ value: r, label: r }))} />
          </F>
          <F label="Unit">
            <Pick
              value={f.unitNo}
              disabled={!f.residence}
              onChange={(v) => set({ unitNo: v, unitType: units.find((u) => u.residenceName === f.residence && u.unitNo === v)?.unitType ?? "", room: "", bed: "" })}
              options={unitList.map((u) => ({ value: u.unitNo, label: u.unitNo }))}
            />
          </F>
          <F label="Room">
            <Pick value={f.room} disabled={!unit} onChange={(v) => set({ room: v, bed: "" })} options={(unit?.rooms ?? []).map((r) => ({ value: r.letter, label: roomName(r.letter) }))} />
          </F>
          <F label="Bed">
            <Pick value={f.bed} disabled={!room} onChange={(v) => set({ bed: v })} options={bedOptions} />
          </F>
        </Grid>
      </Panel>

      <Panel title="Tenancy">
        <Grid>
          <F label="Start">
            <DateInput value={f.tenancyStart} onChange={(e) => set({ tenancyStart: e.target.value })} />
          </F>
          <F label="End">
            <DateInput value={f.tenancyEnd} min={f.tenancyStart || undefined} onChange={(e) => set({ tenancyEnd: e.target.value })} />
          </F>
          <F label="Monthly rent (RM)">
            <Input value={f.monthlyRent} inputMode="decimal" onChange={(e) => set({ monthlyRent: e.target.value })} />
          </F>
          <F label="Payment frequency">
            <Pick value={f.schedule} onChange={(v) => set({ schedule: v })} options={SCHEDULES} />
          </F>
          <F label="Paid by">
            <Pick
              value={f.paidBy}
              onChange={(v) => set({ paidBy: v })}
              options={[{ value: "Self", label: "Self" }, ...PAYOR_RELATIONSHIP_OPTIONS]}
            />
          </F>
          {f.paidBy !== "Self" ? (
            <F label="Payor name">
              <Input value={f.payorName} onChange={(e) => set({ payorName: e.target.value })} />
            </F>
          ) : null}
          <F label="Agreement No." hint="Their existing TA number - TA<start year>_<unit>_<QuickBooks ID>">
            <Input
              value={f.agreementNo}
              onChange={(e) => {
                setAgreementEdited(true);
                setF((cur) => ({ ...cur, agreementNo: e.target.value }));
              }}
            />
          </F>
        </Grid>
      </Panel>

      <Panel title="Initial payment" description="What they paid at move-in, from their original invoice. Blank is RM0.">
        <Grid>
          {(
            [
              ["proratedRent", "First month rent (pro-rated)"],
              ["advanceRent", "Advance rental"],
              ["securityDeposit", "Security deposit"],
              ["utilitiesDeposit", "Utilities deposit"],
              ["accessCardDeposit", "Access card deposit"],
              ["residentCardCharges", "Resident card charges"],
              ["adminAgreementCharges", "Admin + agreement charges"],
              ["starterPack", "Starter pack"],
            ] as const
          ).map(([k, label]) => (
            <F key={k} label={`${label} (RM)`}>
              <Input value={f[k]} inputMode="decimal" onChange={(e) => set({ [k]: e.target.value } as Partial<ExistingResidentInput>)} />
            </F>
          ))}
          <F label="Total paid (RM)" hint={`The lines above add up to ${money(linesSum)}`}>
            <Input value={f.totalPaid} inputMode="decimal" onChange={(e) => set({ totalPaid: e.target.value })} />
            {totalOff ? (
              <p className="mt-1 text-xs text-amber-700">Not the same as the lines ({money(linesSum)}) - check the original invoice.</p>
            ) : null}
          </F>
        </Grid>
      </Panel>

      <Panel title="Links" description="Paste the Drive links (https://…). Missing application documents can be uploaded on their profile after.">
        <Grid>
          <F label="Tenancy agreement copy">
            <Input value={f.taUrl} placeholder="https://" onChange={(e) => set({ taUrl: e.target.value.trim() })} />
          </F>
          <F label="Initial invoice copy">
            <Input
              value={f.invoiceUrl}
              placeholder="https://"
              onChange={(e) => {
                const url = e.target.value.trim();
                // its QuickBooks number, when the link carries the file name
                set({ invoiceUrl: url, ...(invoiceNoFrom(url) ? { invoiceNo: invoiceNoFrom(url) } : {}) });
              }}
            />
          </F>
          <F label="Invoice No." hint="As written on the original, e.g. INV:IP_00894">
            <Input value={f.invoiceNo} onChange={(e) => set({ invoiceNo: e.target.value.trim() })} />
          </F>
          <F label="Passport size photo">
            <Input value={f.photoUrl} placeholder="https://" onChange={(e) => set({ photoUrl: e.target.value.trim() })} />
          </F>
          <F label={mys ? "NRIC copy" : "Passport copy"}>
            <Input value={f.idCopyUrl} placeholder="https://" onChange={(e) => set({ idCopyUrl: e.target.value.trim() })} />
          </F>
          <F label="University offer letter">
            <Input value={f.offerLetterUrl} placeholder="https://" onChange={(e) => set({ offerLetterUrl: e.target.value.trim() })} />
          </F>
        </Grid>
      </Panel>

      {row ? (
        <Panel
          title="Check"
          description="Checked as you type, by the same rules as the bulk upload."
          action={
            read.toFill.length ? (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {read.toFill.length} still to fill
              </span>
            ) : (
              <span className={`rounded-full border px-2 py-0.5 text-xs ${MIGRATION_STATUS[row.status].tone}`}>
                {MIGRATION_STATUS[row.status].label}
              </span>
            )
          }
        >
          {/* not filled in yet is a to-do, in grey - red only for what is filled in and wrong (Dani, 14 Oct 2026) */}
          {read.toFill.length ? (
            <div className="mb-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Still to fill</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {read.toFill.map((label) => (
                  <span key={label} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {read.problems.length ? (
            <ul className="mb-3 space-y-1">
              {read.problems.map((p, n) => (
                <li key={n} className={`rounded-md px-2.5 py-1.5 text-xs ${p.level === "blocked" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
                  <span className="font-semibold">{p.field}:</span> {p.message}
                </li>
              ))}
            </ul>
          ) : null}
          {read.later.length ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Can be uploaded on their profile later: {read.later.join(", ")}.
            </p>
          ) : null}
          {/* what will be saved - once the needed boxes are in, like the bulk upload's line */}
          {!read.toFill.length ? (
            <div className="rounded-xl border border-border">
              <ResidentLine row={row} today={today} open={open} onToggle={() => setOpen(!open)} />
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {read.toFill.length
                ? "Fill in the boxes above - the button turns on when they are done."
                : row.status === "blocked"
                  ? "Fix what is marked in red first."
                  : "Gets a profile, tenancy, the old TA, a paid initial invoice, the rent from the next period, and the bed."}
            </p>
            <Button onClick={() => void add()} disabled={row.status === "blocked" || busy}>
              {busy ? "Adding…" : "Add resident"}
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function F({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`block space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Pick({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Dropdown
      value={value}
      disabled={!!disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">Choose…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Dropdown>
  );
}
