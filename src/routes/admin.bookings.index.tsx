/* eslint-disable @typescript-eslint/no-explicit-any */
import { Dropdown } from "@/components/admin/Dropdown";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, ChevronUp, Search } from "lucide-react";

import { useOps, allBeds } from "@/lib/ops-store";
import { STAFF, universityAbbr } from "@/data/form-options";
import {
  ACTIONS,
  SLA_TONE,
  STAGES,
  STAGE_ORDER,
  STAGE_PILL,
  actionLabel,
  listActionLabel,
  bookingNextAction,
  upcomingViewing,
  slaText,
  stageLabel,
  type ActionKey,
} from "@/lib/bookings-pipeline";
import {
  listEnquiries,
  listAppointments,
  listNotDuplicates,
  dismissDuplicate,
} from "@/lib/admin.functions";
import { normaliseEmail, normaliseName, normalisePhone } from "@/lib/enquiry-duplicates";

/** Finished with: it shows its stage and carries no duplicate marks at all. */
const row_isClosed = (row: { status?: string }) => String(row.status ?? "") === "closed";

/** Ten to a page - about a screenful, and enough to see a morning's enquiries. */
const PAGE_SIZE = 10;

/**
 * A booking that looks like the same person, as seen from one particular row.
 *
 * Only open bookings are ever in here. Closing one as a duplicate settles it
 * everywhere at once: it drops out of this list on every row that resembled
 * it, and what it duplicates is told on its own page instead. Four rows for
 * one student become three the moment one of them is dealt with.
 */
type Lookalike = { id: string; reference: string };
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/bookings/")({
  component: BookingsTable,
});

type SortKey = "quote_id" | "student" | "move_in" | "stage" | "staff" | "sla";

const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" }) : "—";

function BookingsTable() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ops = useOps();

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  // which rows have been asked to show what was closed against them - kept shut
  // by default, or a reference on two lines doubles the height of every row
  const [openDuplicates, setOpenDuplicates] = useState<Record<string, boolean>>({});
  const [staffFilter, setStaffFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "quote_id", dir: -1 });
  const [page, setPage] = useState(1);
  /*
   * Closed bookings, off by default.
   *
   * This list is the team's to-do view, and a closed booking has no next step -
   * it sat between the ones that do, pushing live work onto a second page. It
   * is not gone: the count below the filters says how many are out and puts
   * them back in one click, so nothing is hidden without saying so, and asking
   * for Closed in the stage filter still shows them.
   */
  const [showClosed, setShowClosed] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "enquiries"],
    queryFn: () => listEnquiries(),
  });

  const { data: apptData } = useQuery({
    queryKey: ["admin", "appointments"],
    queryFn: () => listAppointments(),
  });
  const appointments = ((apptData as any)?.appointments ?? []) as any[];

  const beds = useMemo(() => allBeds(ops.units), [ops.units]);

  function roomAssigned(row: any) {
    const hit = beds.find((b) => b.bed.enquiryId === row.id);
    if (!hit) return "—";
    return `${hit.unit.unitNo} ${hit.room.letter}`;
  }

  /** Pairs staff have already said are different people. */
  const { data: notDuplicates = [] } = useQuery({
    queryKey: ["admin", "not-duplicates"],
    queryFn: () => listNotDuplicates(),
  });

  const dismiss = useMutation({
    mutationFn: (input: { aId: string; bId: string }) => dismissDuplicate({ data: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "not-duplicates"] }),
    onError: () => toast.error("Could not save that"),
  });

  /**
   * Every booking that looks like the same person as this one, both ways round.
   *
   * Indexed rather than compared: three maps of email, phone and name to the
   * rows carrying them, then each row takes the union of its own three keys.
   * Comparing all five hundred rows against each other would be a quarter of a
   * million comparisons on every keystroke in the search box.
   *
   * It is symmetric on purpose - if A shows B, C and D, then C shows A, B and
   * D. A student who enquired four times is four rows, and whichever one staff
   * happen to open should show the other three.
   */
  const lookalikesById = useMemo(() => {
    const byKey = new Map<string, string[]>();
    const add = (key: string, id: string) => {
      if (!key) return;
      byKey.set(key, [...(byKey.get(key) ?? []), id]);
    };
    for (const row of data as any[]) {
      // A closed booking is settled, so it is nobody's lookalike any more. It
      // never enters the index, which is what takes it off the other rows too -
      // close B and A, C and D stop listing it in the same breath.
      if (row_isClosed(row)) continue;
      const id = String(row.id);
      add(`e:${normaliseEmail(row.email ?? "")}`, id);
      add(`p:${normalisePhone(row.phone ?? "")}`, id);
      add(`n:${normaliseName(row.full_name ?? "")}`, id);
    }

    // the pairs already dismissed, looked up the same way round every time
    const pairKey = (a: string, b: string) => [a, b].sort().join("|");
    const dismissed = new Set(
      (notDuplicates as { a_id: string; b_id: string }[]).map((p) => pairKey(p.a_id, p.b_id)),
    );

    // the reference is the whole of a chip, and every id reached here is open
    const referenceById = new Map<string, string>(
      (data as any[]).map((r) => [String(r.id), String(r.reference ?? "")]),
    );
    const map = new Map<string, Lookalike[]>();
    for (const row of data as any[]) {
      // and it carries no list of its own: a closed booking shows its stage
      if (row_isClosed(row)) continue;
      const id = String(row.id);
      const mates = new Set<string>();
      for (const key of [
        `e:${normaliseEmail(row.email ?? "")}`,
        `p:${normalisePhone(row.phone ?? "")}`,
        `n:${normaliseName(row.full_name ?? "")}`,
      ]) {
        for (const other of byKey.get(key) ?? []) {
          if (other !== id && !dismissed.has(pairKey(id, other))) mates.add(other);
        }
      }
      if (mates.size) {
        map.set(
          id,
          [...mates].map((m) => ({ id: m, reference: referenceById.get(m) ?? "" })),
        );
      }
    }
    return map;
  }, [data, notDuplicates]);

  // every next action is done on the booking itself, so they all open it
  function runAction(row: any, _action: ActionKey) {
    void navigate({ to: "/admin/bookings/$id", params: { id: row.id } });
  }

  const decorated = (data as any[]).map((r) => {
    const viewing = upcomingViewing(appointments, r.id);
    const next = bookingNextAction(r, appointments);
    return { row: r, next, sla: slaText(next.due), viewing };
  });

  const counters = [
    { label: "New enquiries", value: decorated.filter((d) => d.row.status === "open").length },
    {
      label: "Overdue actions",
      value: decorated.filter((d) => d.sla.tone === "over").length,
    },
    {
      label: "Viewings upcoming",
      value: decorated.filter(
        (d) => d.viewing && new Date(d.viewing.starts_at).getTime() > Date.now(),
      ).length,
    },
    {
      /*
       * Named by the one list the stage dropdown reads, and counting the stage
       * that name belongs to. Written out by hand the two came apart: the box
       * said "Awaiting payment" while counting awaiting_payment - the stage
       * that list calls Awaiting balance - so it totted up part-paid bookings
       * under the name of unpaid ones, and the bookings with nothing in at all
       * were counted nowhere on the page.
       */
      label: stageLabel("awaiting_fee"),
      value: decorated.filter((d) => d.row.status === "awaiting_fee").length,
    },
  ];

  /*
   * Everything the filters and the search agree on, closed or not. Counted
   * before the closed ones are dropped, so the count offering them back is a
   * real number and not "some".
   */
  const matching = decorated.filter(({ row, next }) => {
    if (stageFilter !== "all" && row.status !== stageFilter) return false;
    if (staffFilter !== "all" && (row.assigned_staff || "") !== staffFilter) return false;
    if (actionFilter !== "all" && next.action !== actionFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [row.reference, row.full_name, row.email, row.phone, row.residence_name, row.room_name, row.university]
      .join(" ")
      .toLowerCase();
    // every word typed, in any order
    return q.split(/\s+/).every((w) => hay.includes(w));
  });

  // asked for by name in the filter, it is shown whatever the toggle says
  const closedShown = showClosed || stageFilter === "closed";
  const closedCount = matching.filter(({ row }) => row_isClosed(row)).length;
  const rows = (closedShown ? matching : matching.filter(({ row }) => !row_isClosed(row))).sort(
    (a, b) => {
      const dir = sort.dir;
      switch (sort.key) {
        case "quote_id":
          return (
            dir *
            ((a.row.created_at ? new Date(a.row.created_at).getTime() : 0) -
              (b.row.created_at ? new Date(b.row.created_at).getTime() : 0))
          );
        case "student":
          return dir * String(a.row.full_name).localeCompare(String(b.row.full_name));
        case "move_in":
          return (
            dir *
            ((a.row.move_in ? new Date(a.row.move_in).getTime() : Infinity) -
              (b.row.move_in ? new Date(b.row.move_in).getTime() : Infinity))
          );
        case "stage":
          return dir * ((STAGE_ORDER[a.row.status] ?? 99) - (STAGE_ORDER[b.row.status] ?? 99));
        case "staff":
          return dir * String(a.row.assigned_staff || "zzz").localeCompare(String(b.row.assigned_staff || "zzz"));
        default:
          return dir * (a.sla.remaining - b.sla.remaining);
      }
    },
  );

  function SortHead({ label, sortKey, className = "" }: { label: string; sortKey: SortKey; className?: string }) {
    const active = sort.key === sortKey;
    return (
      <button
        type="button"
        onClick={() =>
          setSort((s) => (s.key === sortKey ? { key: sortKey, dir: s.dir === 1 ? -1 : 1 } : { key: sortKey, dir: 1 }))
        }
        className={`flex items-center gap-1 text-left uppercase tracking-wide transition-colors hover:text-foreground ${
          active ? "text-brand-deep" : ""
        } ${className}`}
      >
        {label}
        {active ? (sort.dir === 1 ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : null}
      </button>
    );
  }

  const SHARING_SHORT: Record<string, string> = { single: "Single", twin: "Twin", unit: "Whole unit" };
  const requirements = (r: any) => {
    const line1 = [universityAbbr(r.university), SHARING_SHORT[r.occupancy] ?? r.occupancy]
      .filter(Boolean)
      .join(" · ");
    const line2 = r.room_name || "";
    return { line1: line1 || "—", line2 };
  };

  /*
   * Ten rows at a time. The page is clamped rather than stored back: narrowing
   * the filters while on page 5 would otherwise leave an empty list with no
   * obvious way back, and clamping keeps that honest without an effect that
   * fights the user's own clicks.
   */
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Bookings</h1>
        <p className="text-sm text-muted-foreground">
          Every enquiry with its current stage, owner and next step.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counters.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xl font-bold text-brand-deep">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
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
        <Dropdown
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Dropdown>
        <Dropdown
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All staff</option>
          <option value="">Unassigned</option>
          {STAFF.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Dropdown>
        <Dropdown
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="all">All next actions</option>
          {ACTIONS.filter((a) => a.value !== "none").map((a) => (
            <option key={a.value} value={a.value}>
              {listActionLabel(a.value)}
            </option>
          ))}
        </Dropdown>
      </div>

      {/*
        Closed bookings are out of the list, and this says so rather than the
        list quietly being shorter. Only when there are some: a line explaining
        that nothing is hidden is itself clutter on a list with nothing hidden.
        It reads as a sentence, because it is telling them something, not
        offering a third filter beside the three above.
      */}
      {closedCount > 0 && stageFilter !== "closed" ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {closedCount} closed booking{closedCount === 1 ? "" : "s"}{" "}
          {closedShown ? "shown" : "hidden"}.{" "}
          <button
            type="button"
            className="font-medium text-brand underline underline-offset-2"
            onClick={() => setShowClosed((was) => !was)}
          >
            {closedShown ? "Hide them" : "Show them"}
          </button>
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[minmax(8.5rem,0.8fr)_1.4fr_1.4fr_0.7fr_0.9fr_0.9fr_0.5fr_0.7fr_1.1fr] gap-3 border-b border-border px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">
            <SortHead label="Quote ID" sortKey="quote_id" />
            <SortHead label="Name" sortKey="student" />
            <span className="uppercase tracking-wide">Requirements</span>
            <SortHead label="Move-in" sortKey="move_in" />
            <span className="uppercase tracking-wide">Room assigned</span>
            <SortHead label="Stage" sortKey="stage" />
            <SortHead label="Staff" sortKey="staff" />
            <SortHead label="SLA" sortKey="sla" />
            <span className="uppercase tracking-wide">Next action</span>
          </div>

          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No enquiries match these filters.</p>
          ) : (
            pageRows.map(({ row: r, next, sla }) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: "/admin/bookings/$id", params: { id: r.id } })}
                onKeyDown={(e) => e.key === "Enter" && navigate({ to: "/admin/bookings/$id", params: { id: r.id } })}
                className="grid cursor-pointer grid-cols-[minmax(8.5rem,0.8fr)_1.4fr_1.4fr_0.7fr_0.9fr_0.9fr_0.5fr_0.7fr_1.1fr] items-center gap-3 border-b border-border px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted/60"
              >
                <div className="min-w-0">
                  {/* the whole reference, not the first two thirds of it - it is
                      the one thing on the row staff read out to each other */}
                  <p className="whitespace-nowrap text-[11px] font-semibold text-brand-deep">
                    {r.reference || "—"}
                  </p>
                  {/*
                    A closed booking says so in its Stage and nothing else. What
                    it duplicates is told on its own page, where somebody has
                    gone to look - spreading it across every row that resembles
                    it was the thing that made this list hard to read.
                  */}
                  {row_isClosed(r) ? null : (lookalikesById.get(String(r.id)) ?? []).length ? (
                    // Shares an email, a phone or a name with these. Shut by
                    // default - one line saying there is something to look at,
                    // opened when somebody wants to know what. Each reference
                    // opens that booking; the X beside it says they are not the
                    // same person, and stops the pair being marked again.
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        title="Shares an email, phone or name with these bookings"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDuplicates((o) => ({ ...o, [r.id]: !o[r.id] }));
                        }}
                        className="rounded-full border border-sky-300 bg-sky-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-sky-800 hover:bg-sky-100"
                      >
                        {(lookalikesById.get(String(r.id)) ?? []).length} duplicate
                        {(lookalikesById.get(String(r.id)) ?? []).length === 1 ? "" : "s"}
                      </button>
                      {openDuplicates[r.id]
                        ? (lookalikesById.get(String(r.id)) ?? []).map((d) => (
                            <span
                              key={d.id}
                              className="inline-flex items-center overflow-hidden rounded-full border border-sky-200"
                            >
                              <button
                                type="button"
                                title={`Open ${d.reference || "this booking"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void navigate({
                                    to: "/admin/bookings/$id",
                                    params: { id: d.id },
                                  });
                                }}
                                className="px-1.5 py-px text-[9px] font-medium text-sky-800 underline-offset-2 hover:bg-sky-50 hover:underline"
                              >
                                {d.reference || "—"}
                              </button>
                              {/* every one of these is open, so every one can be
                                  dismissed - a closed booking is not here to ask */}
                              <button
                                type="button"
                                title="Not the same person — stop marking these two"
                                aria-label={`${d.reference} is not a duplicate`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismiss.mutate({ aId: String(r.id), bId: d.id });
                                }}
                                className="border-l border-sky-200 px-1 py-px text-[9px] text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                              >
                                ✕
                              </button>
                            </span>
                          ))
                        : null}
                    </span>
                  ) : null}
                  <p className="text-[10px] text-muted-foreground">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-foreground">
                    <span className="truncate">{r.full_name}</span>
                    {r.gender ? (
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          r.gender.charAt(0).toUpperCase() === "M"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-pink-100 text-pink-700"
                        }`}
                      >
                        {r.gender.charAt(0).toUpperCase()}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="min-w-0 space-y-0.5">
                  {(() => {
                    const req = requirements(r);
                    return (
                      <>
                        <p className="truncate text-xs text-muted-foreground">{req.line1}</p>
                        {req.line2 ? (
                          <p className="truncate text-xs text-foreground">{req.line2}</p>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
                <p className="text-xs text-foreground">{shortDate(r.move_in)}</p>
                <p className="truncate text-xs text-foreground">{roomAssigned(r)}</p>
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    STAGE_PILL[r.status] ?? "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {stageLabel(r.status)}
                </span>
                <p className="truncate text-xs text-foreground">
                  {r.assigned_staff ? (
                    <span className="truncate">{r.assigned_staff}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
                <p className={`text-xs font-medium ${SLA_TONE[sla.tone]}`}>{sla.text}</p>
                {next.action === "none" ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      runAction(r, next.action);
                    }}
                    className="flex items-center gap-1 text-left text-xs font-semibold text-brand-deep hover:underline"
                  >
                    {listActionLabel(next.action)}
                    <ArrowRight className="size-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Only once there is more than one page - a pager under a short list
            is noise that says nothing. */}
        {rows.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, rows.length)} of{" "}
              {rows.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-xs text-muted-foreground">
                Page {current} of {pageCount}
              </p>
              <button
                type="button"
                disabled={current >= pageCount}
                onClick={() => setPage(current + 1)}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
