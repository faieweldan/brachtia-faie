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
import {
  COUNTRY_OPTIONS,
  GENDER_OPTIONS,
  LEVEL_OPTIONS,
  MARITAL_OPTIONS,
  RELATIONSHIP_OPTIONS,
  UNIVERSITY_OPTIONS,
  YES_NO_OPTIONS,
  dialFor,
  idLabelFor,
  idPlaceholderFor,
  COUNTRIES,
  joinPhone,
  splitPhone,
} from "@/lib/reference-data";

export const Route = createFileRoute("/my-profile/$token")({
  component: MyProfilePage,
});

type Option = { value: string; label: string };
type FieldDef = {
  key: keyof ProfileLinkFields;
  label: string;
  type?: string;
  wide?: boolean;
  /** a fixed list to choose from, instead of free text */
  options?: Option[];
  /** asked for as a dial code plus a number */
  phone?: boolean;
};

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
      { key: "mobile", label: "Mobile number", phone: true },
      { key: "dob", label: "Date of birth", type: "date" },
      { key: "nationality", label: "Nationality", options: COUNTRY_OPTIONS },
      // the label and the hint follow the nationality chosen above
      { key: "id_number", label: "Passport / NRIC number" },
      { key: "gender", label: "Gender", options: GENDER_OPTIONS },
      { key: "marital_status", label: "Marital status", options: MARITAL_OPTIONS },
      { key: "race", label: "Race" },
      { key: "religion", label: "Religion" },
      { key: "address", label: "Home address", wide: true },
      { key: "postcode", label: "Postcode" },
      { key: "state", label: "State" },
      { key: "country", label: "Country", options: COUNTRY_OPTIONS },
    ],
  },
  {
    title: "Your studies",
    fields: [
      { key: "university", label: "University / college", options: UNIVERSITY_OPTIONS },
      { key: "level_of_study", label: "Level of study", options: LEVEL_OPTIONS },
      { key: "course", label: "Course / programme" },
      { key: "student_id", label: "University student ID" },
      { key: "graduation_year", label: "Expected graduation year" },
    ],
  },
  {
    title: "Health",
    hint: "Only so we can help in an emergency.",
    fields: [
      {
        key: "medical_condition",
        label: "Any medical condition or allergy?",
        options: YES_NO_OPTIONS,
      },
      { key: "medical_detail", label: "Details", wide: true },
    ],
  },
  {
    title: "Emergency contact",
    hint: "Someone we can reach if we cannot reach you.",
    fields: [
      { key: "ec_name", label: "Full name" },
      { key: "ec_relationship", label: "Relationship to you", options: RELATIONSHIP_OPTIONS },
      { key: "ec_mobile", label: "Mobile number", phone: true },
      { key: "ec_email", label: "Email", type: "email" },
      { key: "ec_address", label: "Address", wide: true },
      { key: "ec_postcode", label: "Postcode" },
      { key: "ec_state", label: "State" },
      { key: "ec_country", label: "Country", options: COUNTRY_OPTIONS },
    ],
  },
  {
    title: "Who pays the rent",
    fields: [
      { key: "payer_name", label: "Full name" },
      { key: "payer_relationship", label: "Relationship to you", options: RELATIONSHIP_OPTIONS },
      { key: "payer_mobile", label: "Mobile number", phone: true },
      { key: "payer_email", label: "Email", type: "email" },
      { key: "payer_address", label: "Address", wide: true },
      { key: "payer_postcode", label: "Postcode" },
      { key: "payer_state", label: "State" },
      { key: "payer_country", label: "Country", options: COUNTRY_OPTIONS },
    ],
  },
];

/**
 * A phone number, asked for as a country code plus the rest.
 *
 * Students typed 012-345 6789, 60123456789 and +60 12 345 6789 for the same
 * number. Splitting the code out makes the stored value consistent without
 * making anyone think about formatting. The leading zero Malaysians write is
 * dropped, because it is not part of an international number.
 */
function PhoneField({
  value,
  fallbackDial,
  onChange,
}: {
  value: string;
  fallbackDial: string;
  onChange: (v: string) => void;
}) {
  const parts = splitPhone(value);
  const dial = parts.dial || fallbackDial || "+60";
  return (
    <div className="flex gap-2">
      <select
        className="h-9 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
        value={dial}
        onChange={(e) => onChange(joinPhone(e.target.value, parts.rest))}
      >
        {[...new Set(COUNTRIES.map((c) => c.dial))]
          .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
          .map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
      </select>
      <Input
        inputMode="tel"
        placeholder="12 345 6789"
        value={parts.rest}
        onChange={(e) => onChange(joinPhone(dial, e.target.value))}
      />
    </div>
  );
}

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

                // a Malaysian is asked for an NRIC, everyone else a passport
                const label =
                  f.key === "id_number" ? idLabelFor(values["nationality"] ?? "") : f.label;

                // A university outside the list is typed into the same field, so
                // nothing new has to be stored. The dropdown reads back as
                // "Other" whenever what is saved is not one of the known codes.
                const knownUniversity = UNIVERSITY_OPTIONS.some((o) => o.value === value);
                const otherUniversity = f.key === "university" && !!value && !knownUniversity;

                // details are pointless unless there is a condition to detail
                if (f.key === "medical_detail" && values["medical_condition"] !== "yes") {
                  return null;
                }

                return (
                  <div key={f.key} className={`space-y-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
                    <Label className="text-xs text-muted-foreground">
                      {label}
                      {empty ? <span className="ml-1 text-brand">•</span> : null}
                    </Label>

                    {f.key === "medical_detail" ? (
                      <Textarea value={value} onChange={(e) => set(f.key, e.target.value)} />
                    ) : f.phone ? (
                      <PhoneField
                        value={value}
                        fallbackDial={dialFor(values["nationality"] ?? "")}
                        onChange={(v) => set(f.key, v)}
                      />
                    ) : f.options ? (
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={otherUniversity ? "OTHER" : value}
                        onChange={(e) =>
                          // choosing Other clears the field so they can type
                          set(f.key, e.target.value === "OTHER" ? "" : e.target.value)
                        }
                      >
                        <option value="">Please choose</option>
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={f.type ?? "text"}
                        value={value}
                        placeholder={
                          f.key === "id_number"
                            ? idPlaceholderFor(values["nationality"] ?? "")
                            : undefined
                        }
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    )}

                    {f.key === "university" && (otherUniversity || !value) ? (
                      <Input
                        placeholder="Not listed? Type your university or college"
                        value={knownUniversity ? "" : value}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    ) : null}
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
