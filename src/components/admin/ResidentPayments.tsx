import { useMemo, useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Panel, Select, Stat, StatusPill, Text } from "@/components/admin/ops-ui";
import { PAY_METHODS, addPayment, fmtDate, money, savePayment, useOps, type Payment } from "@/lib/ops-store";

const KINDS = [
  { value: "booking_fee", label: "Booking fee" },
  { value: "deposit", label: "Deposit" },
  { value: "rent", label: "Rent instalment" },
  { value: "other", label: "Other" },
];

export function ResidentPayments({ residentId }: { residentId: string }) {
  const { payments } = useOps();
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState<Payment | null>(null);
  const [draft, setDraft] = useState({
    kind: "rent",
    label: "",
    periodFrom: "",
    periodTo: "",
    amount: "",
    dueDate: "",
  });
  const [pay, setPay] = useState({ paidDate: "", method: "", reference: "", proofFile: "" });

  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(
    () =>
      payments
        .filter((p) => p.residentId === residentId)
        .map((p) => ({
          ...p,
          status: p.paidDate ? "paid" : p.dueDate && p.dueDate < today ? "overdue" : p.status,
        })),
    [payments, residentId, today],
  );

  const totals = useMemo(() => {
    const billed = rows.reduce((n, p) => n + p.amount, 0);
    const collected = rows.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount, 0);
    return { billed, collected, outstanding: billed - collected };
  }, [rows]);

  function createInvoice() {
    if (!draft.amount || !draft.dueDate) {
      toast.error("Amount and due date are required");
      return;
    }
    addPayment({
      residentId,
      kind: draft.kind as Payment["kind"],
      label: draft.label || KINDS.find((k) => k.value === draft.kind)?.label || "Invoice",
      periodFrom: draft.periodFrom,
      periodTo: draft.periodTo,
      amount: Number(draft.amount) || 0,
      dueDate: draft.dueDate,
      status: "due",
    });
    toast.success("Invoice raised");
    setOpen(false);
    setDraft({ kind: "rent", label: "", periodFrom: "", periodTo: "", amount: "", dueDate: "" });
  }

  function record() {
    if (!recording) return;
    savePayment({
      ...recording,
      paidDate: pay.paidDate || today,
      method: pay.method,
      reference: pay.reference,
      proofFile: pay.proofFile,
      status: "paid",
    });
    toast.success("Payment recorded — receipt ready");
    setRecording(null);
    setPay({ paidDate: "", method: "", reference: "", proofFile: "" });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Billed" value={money(totals.billed)} />
        <Stat label="Collected" value={money(totals.collected)} tone="text-emerald-700" />
        <Stat label="Outstanding" value={money(totals.outstanding)} />
      </div>

      <Panel
        title="Invoices & payments"
        description="Everything billed to this resident."
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-4" /> Raise invoice
          </Button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="Nothing billed yet" hint="Raise the booking fee or a rent instalment." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium">{p.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.periodFrom ? `${fmtDate(p.periodFrom)} → ${fmtDate(p.periodTo)}` : "—"}
                    </td>
                    <td className="px-3 py-2">{money(p.amount)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.dueDate)}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status !== "paid" ? (
                        <Button size="sm" variant="outline" onClick={() => setRecording(p as Payment)}>
                          Record payment
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {p.method || "Paid"} · {fmtDate(p.paidDate)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Raise invoice</DialogTitle>
            <DialogDescription>Booking fee, deposit or a rent instalment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Type" value={draft.kind} onChange={(v) => setDraft((d) => ({ ...d, kind: v }))} options={KINDS} />
            <Text label="Description" value={draft.label} onChange={(v) => setDraft((d) => ({ ...d, label: v }))} />
            <Text
              label="Amount (RM)"
              type="number"
              value={draft.amount}
              onChange={(v) => setDraft((d) => ({ ...d, amount: v }))}
            />
            <Text label="Due date" type="date" value={draft.dueDate} onChange={(v) => setDraft((d) => ({ ...d, dueDate: v }))} />
            <Text
              label="Period from"
              type="date"
              value={draft.periodFrom}
              onChange={(v) => setDraft((d) => ({ ...d, periodFrom: v }))}
            />
            <Text label="Period to" type="date" value={draft.periodTo} onChange={(v) => setDraft((d) => ({ ...d, periodTo: v }))} />
          </div>
          <Button onClick={createInvoice}>Raise invoice</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recording} onOpenChange={(o) => !o && setRecording(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>{recording ? `${recording.label} · ${money(recording.amount)}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="Payment date" type="date" value={pay.paidDate} onChange={(v) => setPay((p) => ({ ...p, paidDate: v }))} />
            <Select label="Method" value={pay.method} onChange={(v) => setPay((p) => ({ ...p, method: v }))} options={PAY_METHODS} />
            <Text label="Reference" value={pay.reference} onChange={(v) => setPay((p) => ({ ...p, reference: v }))} />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Payment proof</p>
              <Input
                type="file"
                onChange={(e) => setPay((p) => ({ ...p, proofFile: e.target.files?.[0]?.name ?? "" }))}
              />
            </div>
          </div>
          <Button onClick={record}>Save & generate receipt</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
