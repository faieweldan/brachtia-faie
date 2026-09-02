import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listAppointments,
  saveAppointment,
  deleteAppointment,
  listEnquiries,
} from "@/lib/admin.functions";
import { formatSlot } from "@/lib/slots";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/appointments")({
  component: AppointmentsPage,
});

const STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AppointmentsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });

  const { data: enquiries = [] } = useQuery({
    queryKey: ["admin", "enquiries"],
    queryFn: () => listEnquiries(),
  });
  const enquiryById = new Map((enquiries as any[]).map((e) => [e.id, e]));

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      saveAppointment({ data: { id: input.id, values: { status: input.status } } }),
    onSuccess: () => {
      toast.success("Appointment updated");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not update appointment"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAppointment({ data: { id } }),
    onSuccess: () => {
      toast.success("Appointment removed");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not remove appointment"),
  });

  const appointments = ((data as any)?.appointments ?? []) as any[];
  const rules = ((data as any)?.rules ?? []) as any[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Appointment Manager</h1>
        <p className="text-sm text-muted-foreground">Viewings booked from the website.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : appointments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No appointments booked yet.</p>
        ) : (
          appointments.map((a) => (
            <div
              key={a.id}
              className="grid gap-2 border-b border-border px-4 py-3 text-sm last:border-0 md:grid-cols-[1.2fr_1.3fr_1fr_auto] md:items-center md:gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{a.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.email} · {a.phone}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="text-foreground">
                  {new Date(a.starts_at).toLocaleDateString("en-MY", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {formatSlot(a.starts_at)}
                </p>
                <p>
                  {a.residence_name} · {a.mode === "virtual" ? "Virtual tour" : "In person"}
                </p>
                {a.enquiry_id && enquiryById.get(a.enquiry_id) ? (
                  <p className="mt-1 inline-flex rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
                    Enquiry {enquiryById.get(a.enquiry_id).reference} ·{" "}
                    {enquiryById.get(a.enquiry_id).full_name}
                  </p>
                ) : null}
              </div>
              <select
                value={a.status}
                onChange={(e) => setStatus.mutate({ id: a.id, status: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs capitalize"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>
                Delete
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Weekly availability</h2>
        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {rules.length === 0 ? (
            <p>No availability rules configured.</p>
          ) : (
            rules.map((r) => (
              <p key={r.id}>
                <span className="font-medium text-foreground">{WEEKDAYS[r.weekday]}</span>{" "}
                {String(r.start_time).slice(0, 5)}–{String(r.end_time).slice(0, 5)} ·{" "}
                {r.slot_minutes} min slots · capacity {r.capacity}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
