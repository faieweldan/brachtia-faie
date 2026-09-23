import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setUnitDeactivated, type Unit } from "@/lib/ops-store";

/**
 * Why a unit is out of service.
 *
 * The reason is the whole point of keeping a unit rather than deleting it. A
 * number that is simply missing tells the next person nothing - not whether it
 * was deliberate, not whether something went wrong - and the people who knew
 * move on. So it is asked for here, in the admin's own words, and it can be
 * corrected later without disturbing when the unit went out of service.
 *
 * The same dialog writes the reason and edits it. Editing keeps the original
 * date: re-stamping it as today would destroy the fact the row is here to hold.
 */
export function DeactivateUnitDialog({
  unit,
  onOpenChange,
}: {
  /** the unit being taken out of service, or whose reason is being edited */
  unit: Unit | null;
  onOpenChange: (open: boolean) => void;
}) {
  // already off means this is a correction to the wording, not a new decision
  const editing = Boolean(unit?.deactivatedAt);
  const [reason, setReason] = useState(unit?.deactivationReason ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!unit) return;
    const text = reason.trim();
    if (!text) {
      toast.error("Give a reason - that is the point of keeping the unit");
      return;
    }
    setBusy(true);
    try {
      const res = await setUnitDeactivated(unit.id, true, text);
      if (!res.ok) {
        // somebody is still in it, and the server says who
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Reason updated" : `${unit.unitNo} deactivated`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the unit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(unit)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Why it is out of service" : `Take ${unit?.unitNo ?? ""} out of service`}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Correct the wording. The date it went out of service does not change."
              : "It stays in the list, greyed, and stops being offered as a room. Nobody can be placed in it until it comes back."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="deactivate-reason" className="text-xs text-muted-foreground">
            Reason
          </Label>
          <Textarea
            id="deactivate-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="The owner took it back · under renovation · no longer on the lease…"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Written for whoever reads this a year from now.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {editing ? "Save reason" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
