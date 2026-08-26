import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { FileText } from "lucide-react";

import type { Property } from "@/data/properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type QuoteLead = {
  name: string;
  university: string;
  intake: string;
  nationality: string;
  gender: string;
  email: string;
  mobile: string;
};

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  university: z.string().trim().min(2, "Select your university").max(120),
  intake: z.string().trim().min(4, "Select your intake").max(20),
  nationality: z.string().trim().min(2, "Enter your nationality").max(60),
  gender: z.string().trim().min(1, "Select your gender").max(30),
  email: z.string().trim().email("Enter a valid email").max(255),
  mobile: z.string().trim().min(7, "Enter a valid mobile number").max(25),
});

const GENDERS = ["Female", "Male", "Prefer not to say"];

const selectClass =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40";

export default function QuoteDetailsDialog({
  open,
  onOpenChange,
  property,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property;
  onSubmit: (lead: QuoteLead) => void | Promise<void>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const universities = [
    ...property.nearbyUniversities.map((u) => u.name),
    "Other",
  ];

  const now = new Date();
  const intakes = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-brand-deep">
            <FileText className="size-5 text-brand" /> Get your quote
          </DialogTitle>
          <DialogDescription>
            Almost there — tell us who this quote is for and we'll generate it instantly.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
            const parsed = schema.safeParse(raw);
            if (!parsed.success) {
              const next: Record<string, string> = {};
              for (const issue of parsed.error.issues) {
                next[String(issue.path[0])] = issue.message;
              }
              setErrors(next);
              return;
            }
            setErrors({});
            onOpenChange(false);
            await onSubmit(parsed.data);
            toast.success("Quote ready", {
              description: "Your PDF quote has been downloaded.",
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="q-name">Full name</Label>
              <Input id="q-name" name="name" placeholder="Aisha Rahman" maxLength={100} />
              {errors['name'] && <p className="text-xs text-destructive">{errors['name']}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-uni">University</Label>
              <select id="q-uni" name="university" className={selectClass} defaultValue="">
                <option value="" disabled>
                  Select
                </option>
                {universities.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {errors['university'] && (
                <p className="text-xs text-destructive">{errors['university']}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-intake">Intake</Label>
              <select id="q-intake" name="intake" className={selectClass} defaultValue="">
                <option value="" disabled>
                  Select month & year
                </option>
                {intakes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {errors['intake'] && <p className="text-xs text-destructive">{errors['intake']}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-nat">Nationality</Label>
              <Input id="q-nat" name="nationality" placeholder="Malaysian" maxLength={60} />
              {errors['nationality'] && (
                <p className="text-xs text-destructive">{errors['nationality']}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-gender">Gender</Label>
              <select id="q-gender" name="gender" className={selectClass} defaultValue="">
                <option value="" disabled>
                  Select
                </option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              {errors['gender'] && <p className="text-xs text-destructive">{errors['gender']}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-email">Email</Label>
              <Input id="q-email" name="email" type="email" placeholder="you@email.com" maxLength={255} />
              {errors['email'] && <p className="text-xs text-destructive">{errors['email']}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-mobile">Mobile / WhatsApp</Label>
              <Input id="q-mobile" name="mobile" placeholder="+60..." maxLength={25} />
              {errors['mobile'] && <p className="text-xs text-destructive">{errors['mobile']}</p>}
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full">
            Generate my quote
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            We'll only use these details to prepare your quote and follow up.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
