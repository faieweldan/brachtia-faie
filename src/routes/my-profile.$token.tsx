import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  STUDENT_DOCS,
  getProfileByToken,
  submitProfileByToken,
  uploadDocumentByToken,
  type ProfileLinkFields,
} from "@/lib/profile-link.functions";
import { compressImage, readableSize } from "@/lib/compress";

export const Route = createFileRoute("/my-profile/$token")({
  component: MyProfilePage,
});

type FieldDef = { key: keyof ProfileLinkFields; label: string; type?: string; wide?: boolean };

/**
 * Every section is shown, prefilled and editable - not just the empty fields.
 *
 * A student is the only person who can tell us the imported spelling of their
 * name or passport number is wrong, and this is the one moment they are looking.
 * Hiding what we already hold would throw that away.
 */
const SECTIONS: { title: string; hint?: string; fields: FieldDef[] }[] = [
  {
    title: "About you",
    fields: [
      { key: "full_name", label: "Full name (as per passport / NRIC)" },
      { key: "email", label: "Email", type: "email" },
      { key: "mobile", label: "Mobile number" },
      { key: "dob", label: "Date of birth", type: "date" },
      { key: "nationality", label: "Nationality" },
      { key: "id_number", label: "Passport / NRIC number" },
      { key: "gender", label: "Gender" },
      { key: "marital_status", label: "Marital status" },
      { key: "race", label: "Race" },
      { key: "religion", label: "Religion" },
      { key: "address", label: "Home address", wide: true },
      { key: "postcode", label: "Postcode" },
      { key: "state", label: "State" },
      { key: "country", label: "Country" },
    ],
  },
  {
    title: "Your studies",
    fields: [
      { key: "university", label: "University / college" },
      { key: "level_of_study", label: "Level of study" },
      { key: "course", label: "Course / programme" },
      { key: "student_id", label: "University student ID" },
      { key: "graduation_year", label: "Expected graduation year" },
    ],
  },
  {
    title: "Health",
    hint: "Only so we can help in an emergency.",
    fields: [
      { key: "medical_condition", label: "Any medical condition or allergy? (yes / no)" },
      { key: "medical_detail", label: "Details", wide: true },
    ],
  },
  {
    title: "Emergency contact",
    hint: "Someone we can reach if we cannot reach you.",
    fields: [
      { key: "ec_name", label: "Full name" },
      { key: "ec_relationship", label: "Relationship to you" },
      { key: "ec_mobile", label: "Mobile number" },
      { key: "ec_email", label: "Email", type: "email" },
      { key: "ec_address", label: "Address", wide: true },
      { key: "ec_postcode", label: "Postcode" },
      { key: "ec_state", label: "State" },
      { key: "ec_country", label: "Country" },
    ],
  },
  {
    title: "Who pays the rent",
    hint: "Leave blank if you pay it yourself.",
    fields: [
      { key: "payer_name", label: "Full name" },
      { key: "payer_relationship", label: "Relationship to you" },
      { key: "payer_mobile", label: "Mobile number" },
      { key: "payer_email", label: "Email", type: "email" },
      { key: "payer_address", label: "Address", wide: true },
      { key: "payer_postcode", label: "Postcode" },
      { key: "payer_state", label: "State" },
      { key: "payer_country", label: "Country" },
    ],
  },
];

function MyProfilePage() {
  const { token } = Route.useParams();
  const [values, setValues] = useState<ProfileLinkFields | null>(null);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [busyDoc, setBusyDoc] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getProfileByToken({ data: { token } });
        if (cancelled) return;
        if (!res.ok) setError(res.error);
        else {
          setValues(res.values);
          setDocs(Object.fromEntries(res.docs.map((d) => [d.key, d.fileName])));
        }
      } catch {
        if (!cancelled) setError("Something went wrong loading this form.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const remaining = useMemo(() => {
    if (!values) return 0;
    return SECTIONS.flatMap((s) => s.fields).filter((f) => !(values[f.key] ?? "").trim()).length;
  }, [values]);

  /** Photos are shrunk in the browser first - a phone photo of an IC is several MB. */
  async function uploadDoc(key: string, file: File) {
    setBusyDoc(key);
    try {
      const small = await compressImage(file);
      const form = new FormData();
      form.set("token", token);
      form.set("key", key);
      form.set("file", small);
      const res = await uploadDocumentByToken({ data: form });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDocs((d) => ({ ...d, [key]: res.fileName }));
      const saved = file.size - small.size;
      toast.success("Uploaded", {
        description:
          saved > 100 * 1024
            ? `Shrunk from ${readableSize(file.size)} to ${readableSize(small.size)}.`
            : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that file");
    } finally {
      setBusyDoc("");
    }
  }

  async function submit() {
    if (!values) return;
    setSaving(true);
    try {
      const res = await submitProfileByToken({ data: { token, values } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{error}</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-10 text-brand" />
          <h1 className="text-xl font-bold text-brand-deep">Thank you</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your details are saved. You can close this page — reopen the same link any time to
            change something.
          </p>
        </div>
      </Shell>
    );
  }

  if (!values) {
    return (
      <Shell>
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your details…
        </div>
      </Shell>
    );
  }

  const set = (key: keyof ProfileLinkFields, v: string) =>
    setValues((prev) => (prev ? { ...prev, [key]: v } : prev));

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-brand-deep">Your resident details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Please check everything below and fill in what is missing. If something we already have is
          wrong, just correct it.
        </p>
        {remaining > 0 ? (
          <p className="mt-3 inline-flex rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand-deep">
            {remaining} field{remaining === 1 ? "" : "s"} still empty
          </p>
        ) : null}
      </div>

      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <section key={section.title} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-brand-deep">{section.title}</h2>
            {section.hint ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{section.hint}</p>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {section.fields.map((f) => {
                const value = values[f.key] ?? "";
                const empty = !value.trim();
                return (
                  <div key={f.key} className={`space-y-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
                    <Label className="text-xs text-muted-foreground">
                      {f.label}
                      {empty ? <span className="ml-1 text-brand">•</span> : null}
                    </Label>
                    {f.key === "medical_detail" ? (
                      <Textarea value={value} onChange={(e) => set(f.key, e.target.value)} />
                    ) : (
                      <Input
                        type={f.type ?? "text"}
                        value={value}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-brand-deep">Your documents</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A clear phone photo is fine — we shrink it for you. PDFs work too.
          </p>
          <div className="mt-4 space-y-2">
            {STUDENT_DOCS.map((d) => {
              const have = docs[d.key];
              return (
                <div
                  key={d.key}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{d.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {have ? have : "Not uploaded yet"}
                    </p>
                  </div>
                  <label className="cursor-pointer">
                    <span className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm">
                      {busyDoc === d.key ? "Uploading…" : have ? "Replace" : "Upload"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={busyDoc !== ""}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadDoc(d.key, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 mt-5 flex justify-end border-t border-border bg-background py-4">
        <Button onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save my details"}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-ui min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="mb-6 text-sm font-bold text-brand-deep">Brachtia Homes</p>
        {children}
      </div>
    </div>
  );
}
