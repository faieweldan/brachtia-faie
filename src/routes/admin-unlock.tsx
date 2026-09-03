import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";

import { unlockAdmin } from "@/lib/admin-gate.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin-unlock")({
  head: () => ({
    meta: [
      { title: "Staff access | Brachtia Homes" },
      { name: "description", content: "Brachtia Homes staff portal access." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminUnlock,
});

function AdminUnlock() {
  const router = useRouter();
  const unlock = useServerFn(unlockAdmin);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const result = await unlock({ data: { passcode } });
      if (result.ok) {
        await router.navigate({ to: "/admin", replace: true });
        router.invalidate();
      } else {
        setError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-ui flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="flex size-10 items-center justify-center rounded-xl bg-brand-tint text-brand-deep">
          <Lock className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-foreground">Brachtia staff portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the access passcode to continue.
        </p>

        <div className="mt-6 space-y-2">
          <Label htmlFor="passcode">Passcode</Label>
          <Input
            id="passcode"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            required
          />
          {error ? <p className="text-sm text-destructive">Incorrect passcode.</p> : null}
        </div>

        <Button type="submit" className="mt-6 w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Unlock
        </Button>
      </form>
    </div>
  );
}
