/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInvoice, getEnquiry } from "@/lib/admin.functions";
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
  { value: "advance", label: "Rent / advance" },
  { value: "refundable", label: "Refundable deposit" },
  { value: "onetime", label: "One-time fee" },
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
  const [ready, setReady] = useState(false);

  const snapshot = (row as any)?.quote_snapshot;

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
    setFrequency(String((row as any).payment_term || "bimonthly"));
    setRent(Number((row as any).monthly_rent || snapshot?.quote?.monthlyAfter || 0));
    setReady(true);
  }, [row, ready, snapshot]);

  const total = useMemo(() => lines.reduce((n, l) => n + Number(l.amount || 0), 0), [lines]);
  const deposits = useMemo(
    () => lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + Number(l.amount || 0), 0),
    [lines],
  );

  const create = useMutation({
    mutationFn: () =>
      createInvoice({
        data: {
          enquiryId: id,
          items: lines,
          values: {
            full_name: (row as any).full_name ?? "",
            email: (row as any).email ?? "",
            phone: (row as any).phone ?? "",
            university: (row as any).university ?? "",
            nationality: (row as any).nationality ?? "",
            residence_name: (row as any).residence_name ?? "",
            room_name: (row as any).room_name ?? "",
            occupancy: (row as any).occupancy ?? "",
            tenancy_start: (row as any).move_in ?? null,
            tenancy_end: (row as any).move_out ?? null,
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
  const r = row as any;

  function draft(): InvoiceDoc {
    return {
      number: "INV-DRAFT",
      issued_at: new Date().toISOString(),
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

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Billing details</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Student"><p className="text-sm">{r.full_name || "—"}</p></Field>
          <Field label="Email"><p className="text-sm">{r.email || "—"}</p></Field>
          <Field label="Mobile"><p className="text-sm">{r.phone || "—"}</p></Field>
          <Field label="Residence"><p className="text-sm">{r.residence_name || "—"}</p></Field>
          <Field label="Room"><p className="text-sm">{r.room_name || "—"}</p></Field>
          <Field label="Occupancy">
            <p className="text-sm capitalize">{r.occupancy || "—"}</p>
          </Field>
          <Field label="Tenancy start"><p className="text-sm">{r.move_in ?? "—"}</p></Field>
          <Field label="Tenancy end"><p className="text-sm">{r.move_out ?? "—"}</p></Field>
          <Field label="Monthly rent">
            <Input
              type="number"
              value={rent}
              onChange={(e) => setRent(Number(e.target.value))}
              className="h-9"
            />
          </Field>
          <Field label="Payment frequency">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

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
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Amount (RM)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Input
                      value={l.label}
                      className="h-9"
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={l.kind}
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)),
                        )
                      }
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={l.amount}
                      className="h-9 text-right"
                      onChange={(e) =>
                        setLines((rows) =>
                          rows.map((x, j) =>
                            j === i ? { ...x, amount: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
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
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note shown on the invoice" />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => void previewInvoice(draft())}>
          Preview Invoice
        </Button>
        <Button disabled={lines.length === 0 || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Generating…" : "Generate Invoice"}
        </Button>
      </div>
    </div>
  );
}
