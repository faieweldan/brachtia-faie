import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin-login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Staff sign in | Brachtia Homes" },
      { name: "description", content: "Brachtia Homes staff portal sign in." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <form
        className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          const { error: err } = await supabase.auth.signInWithPassword({
            email: String(fd.get("email") ?? ""),
            password: String(fd.get("password") ?? ""),
          });
          setBusy(false);
          if (err) {
            setError("Incorrect email or password.");
            return;
          }
          void navigate({ to: "/admin", replace: true });
        }}
      >
        <div className="flex items-center gap-2 text-brand-deep">
          <ShieldCheck className="size-5" />
          <h1 className="text-lg font-bold">Brachtia staff portal</h1>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Sign in
        </Button>
      </form>
    </div>
  );
}
