import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Panel, Select, StatusPill } from "@/components/admin/ops-ui";
import {
  blankResident,
  completeness,
  findBed,
  fmtDate,
  money,
  saveResidentRecord,
  useOps,
} from "@/lib/ops-store";

export const Route = createFileRoute("/admin/residents/")({
  component: ResidentsListPage,
});

function ResidentsListPage() {
  const navigate = useNavigate();
  const { residents, units, tenancies, payments } = useOps();
  const [q, setQ] = useState("");
  const [university, setUniversity] = useState("");
  const [residence, setResidence] = useState("");

  const universities = useMemo(
    () => Array.from(new Set(residents.map((r) => r.university).filter(Boolean))),
    [residents],
  );
  const residences = useMemo(
    () => Array.from(new Set(units.map((u) => u.residenceName).filter(Boolean))),
    [units],
  );

  const rows = residents.filter((r) => {
    if (university && r.university !== university) return false;
    if (residence) {
      const placed = findBed(units, r.bedId);
      if (placed?.unit.residenceName !== residence) return false;
    }
    if (q && !`${r.fullName} ${r.email} ${r.studentId}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  function addResident() {
    const r = blankResident();
    saveResidentRecord(r);
    void navigate({ to: "/admin/residents/$id", params: { id: r.id } });
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Residents"
        description="Profiles built from the student housing application form."
        action={
          <Button size="sm" onClick={addResident}>
            <Plus className="mr-1 size-4" /> Add resident
          </Button>
        }
      >
        {residents.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No residents yet"
            hint="Create a resident profile from a booked enquiry, or add one manually to test the flow."
            action={
              <Button size="sm" onClick={addResident}>
                Add resident
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Search</p>
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, student ID" />
              </div>
              <Select label="University" value={university} onChange={setUniversity} options={universities} placeholder="All" />
              <Select label="Residence" value={residence} onChange={setResidence} options={residences} placeholder="All" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Resident</th>
                    <th className="px-3 py-2 font-medium">Student ID</th>
                    <th className="px-3 py-2 font-medium">Placement</th>
                    <th className="px-3 py-2 font-medium">University</th>
                    <th className="px-3 py-2 font-medium">Tenancy</th>
                    <th className="px-3 py-2 font-medium">Profile</th>
                    <th className="px-3 py-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const placed = findBed(units, r.bedId);
                    const tenancy = tenancies.find((t) => t.residentId === r.id);
                    const balance = payments
                      .filter((p) => p.residentId === r.id && p.status !== "paid")
                      .reduce((n, p) => n + p.amount, 0);
                    const pct = completeness(r).pct;
                    return (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          <Link
                            to="/admin/residents/$id"
                            params={{ id: r.id }}
                            className="font-medium text-brand-deep underline-offset-2 hover:underline"
                          >
                            {r.fullName || "Untitled resident"}
                          </Link>
                          <p className="text-xs text-muted-foreground">{r.email || "No email"}</p>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.studentId || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {placed
                            ? `${placed.unit.unitNo} · Room ${placed.room.letter} · ${placed.bed.label}`
                            : "Unassigned"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.university || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {tenancy ? `${fmtDate(tenancy.start)} → ${fmtDate(tenancy.end)}` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={pct === 100 ? "paid" : "due"} label={`${pct}% complete`} />
                        </td>
                        <td className="px-3 py-2">{balance ? money(balance) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
