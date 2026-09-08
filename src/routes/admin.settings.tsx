import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { DocumentRow, Panel } from "@/components/admin/ops-ui";
import { setTaTemplate, useOps } from "@/lib/ops-store";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

const MERGE_FIELDS = [
  "{{resident_name}}",
  "{{id_number}}",
  "{{residence}}",
  "{{unit_no}}",
  "{{room}}",
  "{{bed}}",
  "{{tenancy_start}}",
  "{{tenancy_end}}",
  "{{monthly_rent}}",
  "{{payment_schedule}}",
  "{{deposit}}",
];

function SettingsPage() {
  const { taTemplate } = useOps();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Portal-wide configuration. Most of this is coming soon.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Panel
          title="Tenancy Agreement template"
          description="One template is used for every tenancy. Upload the final PDF when it's ready."
        >
          <DocumentRow
            label="Tenancy Agreement (PDF)"
            fileName={taTemplate?.fileName}
            uploadedAt={taTemplate?.uploadedAt}
            onUpload={(name) => {
              setTaTemplate(name);
              toast.success("Template recorded — generation comes with the backend pass");
            }}
          />

          <div className="mt-4">
            <p className="text-xs font-semibold text-brand-deep">Merge fields</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((f) => (
                <code key={f} className="rounded-md border border-border bg-muted px-2 py-1 text-[11px]">
                  {f}
                </code>
              ))}
            </div>
          </div>

          <p className="mt-4 rounded-xl border border-dashed border-border bg-muted p-3 text-xs text-muted-foreground">
            Coming soon: automatic generation of the agreement from this template when a tenancy is created.
          </p>
        </Panel>

        <Panel title="Preview" description="Placeholder — one page only.">
          <div className="aspect-[1/1.414] w-full overflow-hidden rounded-xl border border-border bg-white p-5 text-[9px] leading-relaxed text-neutral-700 shadow-sm">
            <p className="text-center text-[11px] font-bold uppercase tracking-wide text-neutral-900">
              Tenancy Agreement
            </p>
            <p className="mt-3">
              THIS AGREEMENT is made on {"{{agreement_date}}"} between <b>Brachtia Homes</b> (“the Landlord”) and{" "}
              <b>{"{{resident_name}}"}</b> (NRIC / Passport {"{{id_number}}"}) (“the Tenant”).
            </p>
            <p className="mt-2 font-semibold">1. Premises</p>
            <p>
              The Landlord agrees to let and the Tenant agrees to take {"{{room}}"}, {"{{bed}}"} of {"{{unit_no}}"},{" "}
              {"{{residence}}"}.
            </p>
            <p className="mt-2 font-semibold">2. Term</p>
            <p>
              From {"{{tenancy_start}}"} to {"{{tenancy_end}}"}.
            </p>
            <p className="mt-2 font-semibold">3. Rent</p>
            <p>
              {"{{monthly_rent}}"} per month, payable {"{{payment_schedule}}"} in advance. Security deposit{" "}
              {"{{deposit}}"}.
            </p>
            <p className="mt-2 font-semibold">4. Tenant covenants</p>
            <p>
              The Tenant shall keep the premises in good and tenantable repair, observe house rules, and not sublet any
              part of the premises.
            </p>
            <p className="mt-6">Signed by the Landlord ____________________</p>
            <p className="mt-3">Signed by the Tenant ______________________</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
