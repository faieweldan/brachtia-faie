import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Link2, Mail, Phone, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  listEnquiries,
  updateEnquiry,
  listAppointments,
  linkAppointmentToEnquiry,
} from "@/lib/admin.functions";
import { formatSlot } from "@/lib/slots";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsPage,
});

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "room_reserved", label: "Room reserved" },
  { value: "viewing_scheduled", label: "Viewing scheduled" },
  { value: "awaiting_fee", label: "Awaiting booking fee" },
  { value: "booked", label: "Booked" },
  { value: "closed", label: "Closed" },
] as const;

const STATUS_LABEL = (v: string) => STATUSES.find((s) => s.value === v)?.label ?? v;

const CLOSE_REASONS = ["Lost to competitor", "No response", "Budget", "Other"];

const money = (n: number) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

function hasSnapshot(row: any) {
  const q = row?.quote_snapshot;
  return Boolean(q && q.property && q.room && q.quote);
}

function BookingsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [open, setOpen] = useState<any>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "enquiries"],
    queryFn: () => listEnquiries(),
  });

  const { data: apptData } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const appointments = ((apptData as any)?.appointments ?? []) as any[];

  const link = useMutation({
    mutationFn: (input: { appointmentId: string; enquiryId: string | null }) =>
      linkAppointmentToEnquiry({ data: input }),
    onSuccess: () => {
      toast.success("Viewing updated");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not update the viewing link"),
  });

  const mutate = useMutation({
    mutationFn: (input: { id: string; status?: string; adminNotes?: string }) =>
      updateEnquiry({ data: input }),
    onSuccess: () => {
      toast.success("Enquiry updated");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: () => toast.error("Could not save changes"),
  });

  async function downloadQuote(row: any) {
    if (!hasSnapshot(row)) return;
    setDownloading(true);
    try {
      const { downloadStayQuote } = await import("@/lib/quote-pdf");
      await downloadStayQuote({ ...row.quote_snapshot, reference: row.reference });
    } catch (err) {
      console.error(err);
      toast.error("Could not build the quotation");
    } finally {
      setDownloading(false);
    }
  }

  const rows = (data as any[]).filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [r.reference, r.full_name, r.email, r.phone, r.residence_name, r.room_name]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Bookings</h1>
        <p className="text-sm text-muted-foreground">
          Enquiries submitted from the residence pages.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, room..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {[{ value: "all", label: "All" }, ...STATUSES].map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                status === s.value
                  ? "bg-brand-deep text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="hidden grid-cols-[1.4fr_1.3fr_1fr_0.8fr_auto] gap-3 border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
          <span>Student</span>
          <span>Stay</span>
          <span>First payment</span>
          <span>Status</span>
          <span />
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No enquiries yet.</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="grid gap-2 border-b border-border px-4 py-3 text-sm last:border-0 md:grid-cols-[1.4fr_1.3fr_1fr_0.8fr_auto] md:items-center md:gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{r.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-semibold text-brand-deep">{r.reference}</span> · {r.email}
                </p>
              </div>
              <div className="min-w-0 text-xs text-muted-foreground">
                <p className="truncate text-foreground">{r.room_name || "—"}</p>
                <p className="truncate">
                  {r.residence_name} · {r.occupancy === "twin" ? "Twin sharing" : "Single"}
                  {r.move_in ? ` · ${r.move_in}` : ""}
                </p>
              </div>
              <p className="text-xs font-semibold text-brand-deep md:text-sm">
                {money(r.first_payment)}
              </p>
              <select
                value={r.status}
                onChange={(e) => mutate.mutate({ id: r.id, status: e.target.value })}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost" onClick={() => setOpen(r)}>
                View
              </Button>
            </div>
          ))
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>{open.full_name}</DialogTitle>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-deep">
                  Ref {open.reference}
                </p>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={`mailto:${open.email}`}>
                      <Mail className="size-4" /> Email
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`https://wa.me/${String(open.phone).replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Phone className="size-4" /> WhatsApp
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!hasSnapshot(open) || downloading}
                    onClick={() => void downloadQuote(open)}
                  >
                    <Download className="size-4" />
                    {downloading ? "Preparing…" : "Download quotation"}
                  </Button>
                </div>
                {!hasSnapshot(open) ? (
                  <p className="-mt-2 text-xs text-muted-foreground">
                    No saved quotation for this enquiry (submitted before quotes were stored).
                  </p>
                ) : null}

                <dl className="grid grid-cols-2 gap-3">
                  {[
                    ["Residence", open.residence_name],
                    ["Room", open.room_name],
                    ["Occupancy", open.occupancy],
                    ["Move in", open.move_in ?? "—"],
                    ["Move out", open.move_out ?? "—"],
                    ["Rate", open.term === "short" ? "Short term" : "12 month"],
                    ["Monthly rent", money(open.monthly_rent)],
                    ["First payment", money(open.first_payment)],
                    ["Add-ons", (open.addons ?? []).join(", ") || "—"],
                    ["University", open.university || "—"],
                    ["Intake", open.intake || "—"],
                    ["Nationality", open.nationality || "—"],
                    ["Gender", open.gender || "—"],
                    ["Phone", open.phone],
                    [
                      "Heard about us",
                      open.heard_about
                        ? open.heard_about === "Other" && open.heard_about_other
                          ? `Other — ${open.heard_about_other}`
                          : open.heard_about
                        : "—",
                    ],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="font-medium capitalize text-foreground">{String(v)}</dd>
                    </div>
                  ))}
                </dl>

                {open.message ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Message</p>
                    <p className="mt-1 rounded-lg bg-muted p-3">{open.message}</p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Linked viewings</p>
                  {appointments.filter((a) => a.enquiry_id === open.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No viewings tagged yet.</p>
                  ) : (
                    appointments
                      .filter((a) => a.enquiry_id === open.id)
                      .map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                        >
                          <span className="text-xs">
                            <span className="font-medium text-foreground">
                              {new Date(a.starts_at).toLocaleDateString("en-MY", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}{" "}
                              · {formatSlot(a.starts_at)}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {a.mode === "virtual" ? "Virtual tour" : "In person"} · {a.status}
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              link.mutate({ appointmentId: a.id, enquiryId: null })
                            }
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))
                  )}

                  <div className="space-y-2 rounded-lg bg-muted p-3">
                    <p className="text-xs font-medium text-foreground">Tag a viewing</p>
                    <Input
                      value={linkQuery}
                      onChange={(e) => setLinkQuery(e.target.value)}
                      placeholder="Search viewings by name, email or date…"
                      className="h-9"
                    />
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {appointments
                        .filter((a) => a.enquiry_id !== open.id)
                        .map((a) => ({
                          a,
                          match:
                            a.email?.toLowerCase() === String(open.email).toLowerCase() ||
                            String(a.phone).replace(/\D/g, "") ===
                              String(open.phone).replace(/\D/g, ""),
                        }))
                        .filter(({ a }) => {
                          const q = linkQuery.trim().toLowerCase();
                          if (!q) return true;
                          return [a.full_name, a.email, a.phone, a.starts_at]
                            .join(" ")
                            .toLowerCase()
                            .includes(q);
                        })
                        .sort((x, y) => Number(y.match) - Number(x.match))
                        .slice(0, 12)
                        .map(({ a, match }) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() =>
                              link.mutate({ appointmentId: a.id, enquiryId: open.id })
                            }
                            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-background"
                          >
                            <span className="min-w-0 truncate">
                              <span className="font-medium text-foreground">{a.full_name}</span>{" "}
                              <span className="text-muted-foreground">
                                ·{" "}
                                {new Date(a.starts_at).toLocaleDateString("en-MY", {
                                  day: "numeric",
                                  month: "short",
                                })}{" "}
                                {formatSlot(a.starts_at)}
                              </span>
                              {a.enquiry_id ? (
                                <span className="text-muted-foreground"> · linked elsewhere</span>
                              ) : null}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 font-semibold text-brand-deep">
                              {match ? "Suggested" : null}
                              <Link2 className="size-3.5" />
                            </span>
                          </button>
                        ))}
                      {appointments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No viewings booked yet.</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Activity timeline</p>
                  <ol className="space-y-1.5 border-l border-border pl-3 text-xs">
                    {[
                      {
                        at: open.created_at,
                        label: `Enquiry ${open.reference} submitted`,
                      },
                      ...appointments
                        .filter((a) => a.enquiry_id === open.id)
                        .map((a) => ({
                          at: a.starts_at,
                          label: `Viewing (${a.mode === "virtual" ? "virtual" : "in person"}) · ${a.status}`,
                        })),
                      { at: open.updated_at, label: "Last updated" },
                    ]
                      .filter((e) => e.at)
                      .sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())
                      .map((e, i) => (
                        <li key={i} className="text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {new Date(e.at).toLocaleDateString("en-MY", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>{" "}
                          — {e.label}
                        </li>
                      ))}
                  </ol>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Internal notes</p>
                  <Textarea
                    defaultValue={open.admin_notes ?? ""}
                    rows={3}
                    onBlur={(e) =>
                      e.target.value !== (open.admin_notes ?? "") &&
                      mutate.mutate({ id: open.id, adminNotes: e.target.value })
                    }
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
