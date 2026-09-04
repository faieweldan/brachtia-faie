import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BedDouble } from "lucide-react";
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
import { EmptyState, Panel, Select, Text } from "@/components/admin/ops-ui";
import { GENDERS, addTask, allBeds, fmtDate, money, updateBed, useOps } from "@/lib/ops-store";

export const Route = createFileRoute("/admin/homes/availability")({
  component: AvailabilityPage,
});

function addMonths(date: string, months: number) {
  if (!date) return "";
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function AvailabilityPage() {
  const { units } = useOps();
  const [residence, setResidence] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [months, setMonths] = useState("12");
  const [occupancy, setOccupancy] = useState("");
  const [gender, setGender] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [holdFor, setHoldFor] = useState("");
  const [enquiryId, setEnquiryId] = useState("");
  const [holdUntil, setHoldUntil] = useState("");

  const residenceOptions = useMemo(
    () => Array.from(new Set(units.map((u) => u.residenceName).filter(Boolean))),
    [units],
  );

  const matches = useMemo(
    () =>
      allBeds(units).filter(({ unit, room, bed }) => {
        if (bed.status !== "vacant") return false;
        if (residence && unit.residenceName !== residence) return false;
        if (occupancy && room.occupancy !== occupancy) return false;
        if (gender && unit.gender !== gender && unit.gender !== "Any") return false;
        return true;
      }),
    [units, residence, occupancy, gender],
  );

  const selected = matches.find((m) => m.bed.id === target);

  function reserve() {
    if (!selected) return;
    if (!holdFor.trim() || !holdUntil) {
      toast.error("Add who the hold is for and a hold expiry date");
      return;
    }
    updateBed(selected.bed.id, {
      status: "held",
      holdFor: holdFor.trim(),
      holdUntil,
      enquiryId: enquiryId.trim() || undefined,
      tenancyStart: moveIn || undefined,
      tenancyEnd: moveIn ? addMonths(moveIn, Number(months) || 12) : undefined,
      rent: selected.room.rent,
    });
    addTask({
      type: "hold",
      title: "Hold expires — confirm booking fee",
      refLabel: `${holdFor.trim()} · ${selected.unit.unitNo} Room ${selected.room.letter}`,
      dueDate: holdUntil,
      link: "/admin/homes",
    });
    toast.success("Bed held");
    setTarget(null);
    setHoldFor("");
    setEnquiryId("");
    setHoldUntil("");
  }

  return (
    <div className="space-y-5">
      <Panel title="Find a bed" description="Search live availability, then place a hold against an enquiry.">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Select label="Residence" value={residence} onChange={setResidence} options={residenceOptions} placeholder="Any" />
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Move-in date</p>
            <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </div>
          <Select
            label="Lease length"
            value={months}
            onChange={setMonths}
            options={[
              { value: "3", label: "3 months" },
              { value: "6", label: "6 months" },
              { value: "12", label: "12 months" },
            ]}
            placeholder="Any"
          />
          <Select
            label="Occupancy"
            value={occupancy}
            onChange={setOccupancy}
            options={[
              { value: "single", label: "Single" },
              { value: "twin", label: "Twin" },
            ]}
            placeholder="Any"
          />
          <Select label="Gender" value={gender} onChange={setGender} options={GENDERS} placeholder="Any" />
        </div>
      </Panel>

      {units.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No inventory to search"
          hint="Add units first — available beds show up here as soon as they exist."
          action={
            <Button asChild size="sm">
              <Link to="/admin/homes/units">Go to unit setup</Link>
            </Button>
          }
        />
      ) : matches.length === 0 ? (
        <EmptyState icon={BedDouble} title="No available beds match" hint="Loosen a filter and search again." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(({ unit, room, bed }) => (
            <div key={bed.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-brand-deep">
                {unit.residenceName} · {unit.unitNo}
              </p>
              <p className="text-xs text-muted-foreground">
                Room {room.letter} · {bed.label} · {room.occupancy} · {unit.gender || "Any"}
              </p>
              <p className="mt-3 text-lg font-bold text-brand-deep">{money(room.rent)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground">
                Available from {moveIn ? fmtDate(moveIn) : "now"}
              </p>
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={() => {
                  setTarget(bed.id);
                  setHoldUntil(addMonths(new Date().toISOString().slice(0, 10), 0));
                }}
              >
                Reserve (hold)
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place a hold</DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.unit.residenceName} · ${selected.unit.unitNo} · Room ${selected.room.letter} · ${selected.bed.label}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Text label="Hold for (student name)" value={holdFor} onChange={setHoldFor} />
            <Text label="Enquiry reference (optional)" value={enquiryId} onChange={setEnquiryId} />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Hold expires</p>
              <Input type="date" value={holdUntil} onChange={(e) => setHoldUntil(e.target.value)} />
            </div>
            <Button className="w-full" onClick={reserve}>
              Confirm hold
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
