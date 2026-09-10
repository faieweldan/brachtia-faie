/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInvoice, getEnquiry } from "@/lib/admin.functions";
import { allBeds, useOps } from "@/lib/ops-store";
import { previewInvoice, type InvoiceDoc } from "@/lib/invoice-pdf";

export const Route = createFileRoute("/admin/bookings/$id_/invoice")({
  component: InvoiceGenerator,
});

const FREQUENCIES = [
  { value: "bimonthly", label: "Bi-monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "full", label: "Full term" },
  { value: "monthly", label: "Monthly" },
];

const KINDS = [
  { value: "advance", label: "Advance Rent" },
  { value: "refundable", label: "Refundable" },
  { value: "onetime", label: "One-time" },
];

const money = (n: number) =>
  `RM${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Line = { label: string; kind: string; amount: number };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function InvoiceGenerator() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: row, isLoading } = useQuery({
    queryKey: ["admin", "enquiry", id],
    queryFn: () => getEnquiry({ data: { id } }),
  });

  const [lines, setLines] = useState<Line[]>([]);
  const [frequency, setFrequency] = useState("bimonthly");
  const [rent, setRent] = useState(0);
  const [notes, setNotes] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("NET15");
  const [ready, setReady] = useState(false);

  const snapshot = (row as any)?.quote_snapshot;
  const r = row as any;

  /* The real assigned room comes from the room assignment made on Booking Details. */
  const ops = useOps();
  const assignedBed = useMemo(
    () => allBeds(ops.units).find((b) => b.bed.enquiryId === id),
    [ops.units, id],
  );
  const assignedRoomLabel = assignedBed
    ? `Unit ${assignedBed.unit.unitNo} · Room ${assignedBed.room.letter}`
    : "";
  const assignedRoomDetail = assignedBed
    ? `${assignedBed.room.occupancy === "twin" ? "Twin sharing" : "Single"} · ${assignedBed.bed.label}`
    : "";
  const invoiceRoomName = assignedRoomLabel || r?.room_name || "";

  useEffect(() => {
    if (!row || ready) return;
    const first = snapshot?.quote?.firstPayment as any[] | undefined;
    setLines(
      (first ?? []).map((l) => ({
        label: String(l.label ?? ""),
        kind: String(l.kind ?? "onetime"),
        amount: Number(l.amount ?? 0),
      })),
    );
    setFrequency(String(r.payment_term || "bimonthly"));
    setRent(Number(r.monthly_rent || snapshot?.quote?.monthlyAfter || 0));
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setReady(true);
  }, [row, ready, snapshot, r.payment_term, r.monthly_rent]);

  const total = useMemo(() => lines.reduce((n, l) => n + Number(l.amount || 0), 0), [lines]);
  const deposits = useMemo(
    () => lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + Number(l.amount || 0), 0),
    [lines],
  );

  const roomAssigned = Boolean(assignedBed);
  const termDays = paymentTerms === "NET30" ? 30 : 15;
  const dueDate = invoiceDate
    ? new Date(new Date(invoiceDate).getTime() + termDays * 86400000)
        .toISOString()
        .slice(0, 10)
    : "";

  const create = useMutation({
    mutationFn: () =>
      createInvoice({
        data: {
          enquiryId: id,
          items: lines,
          invoiceDate,
          paymentTerms,
          values: {
            full_name: r.full_name ?? "",
            email: r.email ?? "",
            phone: r.phone ?? "",
            university: r.university ?? "",
            nationality: r.nationality ?? "",
            residence_name: r.residence_name ?? "",
            room_name: invoiceRoomName,
            occupancy: r.occupancy ?? "",
            tenancy_start: r.move_in ?? null,
            tenancy_end: r.move_out ?? null,
            monthly_rent: rent,
            payment_frequency: frequency,
            notes,
          },
        },
      }),
    onSuccess: (res: any) => {
      toast.success(`Invoice ${res.number} generated`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void navigate({ to: "/admin/bookings/$id", params: { id } });
    },
    onError: () => toast.error("Could not generate the invoice"),
  });

  if (isLoading || !row) {
    return <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading booking…</div>;
  }

  function draft(): InvoiceDoc {
    return {
      number: "INV-Draft",
      issued_at: new Date().toISOString(),
      invoice_date: invoiceDate || null,
      payment_terms: paymentTerms,
      due_date: dueDate || null,
      reference: r.reference ?? null,
      full_name: r.full_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      university: r.university ?? "",
      nationality: r.nationality ?? "",
      residence_name: r.residence_name ?? "",
      room_name: r.room_name ?? "",
      occupancy: r.occupancy ?? "",
      tenancy_start: r.move_in ?? null,
      tenancy_end: r.move_out ?? null,
      monthly_rent: rent,
      payment_frequency: frequency,
      total,
      deposits_total: deposits,
      notes,
      items: lines,
    };
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <button
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => void navigate({ to: "/admin/bookings/$id", params: { id } })}
      >
        <ArrowLeft className="size-4" /> Back to Booking
      </button>

      <div>
        <h1 className="text-xl font-semibold text-foreground">Invoice Generator</h1>
        <p className="text-sm text-muted-foreground">
          Booking {r.reference ?? r.id} · {r.full_name}
        </p>
      </div>

      {/* Billing Details — read-only summary */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Billing details</h2>
          <Link
            to="/admin/bookings/$id"
            params={{ id }}
            className="text-xs text-brand hover:underline"
          >
            Edit in Booking Details →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Student"><p className="text-sm font-medium">{r.full_name || "—"}</p></Field>
          <Field label="Email"><p className="text-sm">{r.email || "—"}</p></Field>
          <Field label="Mobile"><p className="text-sm">{r.phone || "—"}</p></Field>
          <Field label="Residence"><p className="text-sm">{r.residence_name || "—"}</p></Field>
          <Field label="Unit type"><p className="text-sm">{r.unit_type || "—"}</p></Field>
          <Field label="Room preference">
            <p className="text-sm">{r.room_name || "—"}</p>
          </Field>
          <Field label="Assigned room">
            {assignedBed ? (
              <>
                <p className="text-sm font-semibold text-foreground">{assignedRoomLabel}</p>
                <p className="text-xs text-muted-foreground">{assignedRoomDetail}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Not assigned</p>
            )}
          </Field>
          <Field label="Occupancy">
            <p className="text-sm capitalize">{r.occupancy || "—"}</p>
          </Field>
          <Field label="Tenancy start"><p className="text-sm">{r.move_in ?? "—"}</p></Field>
          <Field label="Tenancy end"><p className="text-sm">{r.move_out ?? "—"}</p></Field>
          <Field label="Monthly rent"><p className="text-sm">{money(rent)}</p></Field>
          <Field label="Payment frequency">
            <p className="text-sm">
              {FREQUENCIES.find((f) => f.value === frequency)?.label ?? frequency}
            </p>
          </Field>
        </div>
        {!roomAssigned ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            A room must be assigned in Booking Details before an invoice can be generated.
          </div>
        ) : null}
      </section>

      {/* Invoice settings */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Invoice settings</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Invoice date">
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="h-9"
            />
          </Field>
          <Field label="Payment terms">
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="NET15">NET 15</option>
              <option value="NET30">NET 30</option>
            </select>
          </Field>
          <Field label="Due date">
            <p className="text-sm pt-2">{dueDate || "—"}</p>
          </Field>
        </div>
      </section>

      {/* Line items — accounting-style table */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Initial payment</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLines((l) => [...l, { label: "", kind: "onetime", amount: 0 }])}
          >
            <Plus className="size-4" /> Add line
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 font-medium" style={{ width: "140px" }}>Type</th>
                <th className="py-2 pl-3 text-right font-medium" style={{ width: "130px" }}>Amount (RM)</th>
                <th className="py-2" style={{ width: "36px" }} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => (
                <tr key={i} className="group">
                  <td className="py-2 pr-3">
                    <Input
                      value={l.label}
                      placeholder="Description"
                      className="h-8 border-transparent bg-transparent focus-visible:border-input"
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={l.kind}
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)),
                        )
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pl-3">
                    <Input
                      type="number"
                      value={l.amount}
                      className="h-8 text-right"
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((x, j) =>
                            j === i ? { ...x, amount: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="invisible text-muted-foreground hover:text-destructive group-hover:visible"
                      onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No lines yet — add the first one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between font-semibold">
            <span>Total Initial Payment</span>
            <span>{money(total)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Refundable Deposits Included</span>
            <span>{money(deposits)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Notes on invoice</h2>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note shown on the invoice"
        />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          disabled={!roomAssigned || lines.length === 0}
          onClick={() => void previewInvoice(draft())}
        >
          Preview Invoice
        </Button>
        <Button
          disabled={!roomAssigned || lines.length === 0 || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Generating…" : "Generate Invoice"}
        </Button>
      </div>
    </div>
  );
}
