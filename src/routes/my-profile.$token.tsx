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
import { DeclarationSection } from "@/components/site/DeclarationSection";
import { ChoicePicker, DialPicker } from "@/components/site/ChoicePicker";
import { getDeclarationByToken, type SignedDeclaration } from "@/lib/declaration.functions";
import {
  UNIVERSITY_OPTIONS,
  dialFor,
  idLabelFor,
  idPlaceholderFor,
  joinPhone,
  splitPhone,
} from "@/lib/reference-data";
import {
  RESIDENT_SECTIONS,
  emailProblem,
  fieldShown,
  formatNric,
  nricProblem,
  phoneDigits,
  phoneProblem,
  type ResidentField,
} from "@/lib/resident-fields";

export const Route = createFileRoute("/my-profile/$token")({
  component: MyProfilePage,
});

/**
 * The same sections, titles and labels as the admin portal, minus what only
 * staff set. Both read RESIDENT_SECTIONS, so they cannot drift apart again.
 *
 * Every field is shown, prefilled and editable - not just the empty ones. A
 * student is the only person who can tell us the imported spelling of their
 * name or passport number is wrong, and this is the one moment they are looking.
 */
const SECTIONS = RESIDENT_SECTIONS.map((s) => ({
  ...s,
  fields: s.fields.filter((f) => !f.staffOnly),
})).filter((s) => s.fields.length > 0);

/**
 * A phone number on record, brought into "+60 123456789" shape.
 *
 * Imported numbers arrive as 014-5498243 or 60145498243. Without this the form
 * would show the leading 0 in the box beside a +60 - the very thing it exists
 * to stop.
 */
function tidyPhone(raw: string, fallbackDial: string): string {
  const v = (raw ?? "").trim();
  if (!v || v.startsWith("+")) return v;
  const dial = fallbackDial || "+60";
  let digits = v.replace(/\D/g, "");
  // 60145498243 already carries the country code, just without the +
  const code = dial.slice(1);
  if (digits.startsWith(code) && digits.length > 10) digits = digits.slice(code.length);
  return joinPhone(dial, phoneDigits(digits));
}

/** What is wrong with one field, or "" if nothing is. */
function problemFor(f: ResidentField, values: ProfileLinkFields): string {
  const value = values[f.key] ?? "";
  if (f.kind === "email") return emailProblem(value);
  if (f.kind === "phone") {
    const { dial, rest } = splitPhone(value);
    return phoneProblem(rest, dial);
  }
  if (f.kind === "id" && values["nationality"] === "MYS") return nricProblem(value);
  // "yes" to a medical condition means nothing without saying which
  if (f.key === "medical_detail" && values["medical_condition"] === "yes" && !value.trim())
    return "Please tell us what the condition or allergy is.";
  return "";
}

/**
 * A phone number, asked for as a country code plus the rest.
 *
 * The rest only takes digits, and a leading 0 is refused as it is typed: the
 * code box already says +60, and 0 is not part of an international number.
 */
function PhoneField({
  value,
  fallbackDial,
  invalid,
  onChange,
  onBlur,
}: {
  value: string;
  fallbackDial: string;
  invalid: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const parts = splitPhone(value);
  const dial = parts.dial || fallbackDial || "+60";
  return (
    <div className="flex gap-2">
      <DialPicker value={dial} onChange={(d) => onChange(joinPhone(d, parts.rest))} />
      <Input
        inputMode="numeric"
        placeholder="123456789"
        value={parts.rest}
        aria-invalid={invalid}
        className={invalid ? "border-destructive" : undefined}
        onChange={(e) => onChange(joinPhone(dial, phoneDigits(e.target.value)))}
        onBlur={onBlur}
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
  const [signed, setSigned] = useState<SignedDeclaration | null>(null);
  // a field's problem is shown once they have left it, not mid-word
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getProfileByToken({ data: { token } });
        if (cancelled) return;
        if (!res.ok) setError(res.error);
        else {
          const dial = dialFor(res.values["nationality"] ?? "");
          const v = { ...res.values };
          for (const s of SECTIONS)
            for (const f of s.fields)
              if (f.kind === "phone") v[f.key] = tidyPhone(v[f.key] ?? "", dial);
          if (v["nationality"] === "MYS" && v["id_number"])
            v["id_number"] = formatNric(v["id_number"]);
          setValues(v);
          setDocs(Object.fromEntries(res.docs.map((d) => [d.key, d.fileName])));
          const dec = await getDeclarationByToken({ data: { token } });
          if (!cancelled && dec.ok) setSigned(dec.signed);
        }
      } catch {
        if (!cancelled) setError("Something went wrong loading this form.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const shownFields = useMemo(() => {
    if (!values) return [];
    return SECTIONS.flatMap((s) => s.fields).filter((f) => fieldShown(f, (k) => values[k] ?? ""));
  }, [values]);

  const remaining = values ? shownFields.filter((f) => !(values[f.key] ?? "").trim()).length : 0;
  const problems = values
    ? shownFields.map((f) => ({ f, msg: problemFor(f, values) })).filter((p) => p.msg)
    : [];

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
    if (problems.length) {
      // show every problem at once, and take them to the first
      setTouched(new Set(problems.map((p) => p.f.key)));
      document.getElementById(`f-${problems[0]!.f.key}`)?.scrollIntoView({ block: "center" });
      return;
    }
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
  const touch = (key: string) => setTouched((t) => new Set(t).add(key));

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
          <section key={section.key} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-brand-deep">{section.title}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {section.fields.map((f) => {
                if (!fieldShown(f, (k) => values[k] ?? "")) return null;

                const value = values[f.key] ?? "";
                const empty = !value.trim();
                const malaysian = values["nationality"] === "MYS";
                const problem = touched.has(f.key) ? problemFor(f, values) : "";
                const label = f.kind === "id" ? idLabelFor(values["nationality"] ?? "") : f.label;

                // A university outside the list is typed into the same field, so
                // nothing new has to be stored. The dropdown reads back as
                // "Other" whenever what is saved is not one of the known codes.
                const knownUniversity = UNIVERSITY_OPTIONS.some((o) => o.value === value);
                const otherUniversity = f.key === "university" && !!value && !knownUniversity;

                return (
                  <div
                    key={f.key}
                    id={`f-${f.key}`}
                    className={`space-y-1.5 ${f.wide || f.kind === "long" ? "sm:col-span-2" : ""}`}
                  >
                    <Label className="text-xs text-muted-foreground">
                      {label}
                      {empty ? <span className="ml-1 text-brand">•</span> : null}
                    </Label>

                    {f.kind === "long" ? (
                      <Textarea
                        value={value}
                        placeholder={f.hint}
                        aria-invalid={!!problem}
                        className={problem ? "border-destructive" : undefined}
                        onChange={(e) => set(f.key, e.target.value)}
                        onBlur={() => touch(f.key)}
                      />
                    ) : f.kind === "phone" ? (
                      <PhoneField
                        value={value}
                        fallbackDial={dialFor(values["nationality"] ?? "")}
                        invalid={!!problem}
                        onChange={(v) => set(f.key, v)}
                        onBlur={() => touch(f.key)}
                      />
                    ) : f.kind === "choice" ? (
                      f.key === "university" ? (
                        <ChoicePicker
                          value={otherUniversity ? "OTHER" : value}
                          options={UNIVERSITY_OPTIONS}
                          // choosing Other clears the field so they can type
                          onChange={(v) => set(f.key, v === "OTHER" ? "" : v)}
                        />
                      ) : (
                        <ChoicePicker
                          value={value}
                          options={f.options ?? []}
                          onChange={(v) => set(f.key, v)}
                        />
                      )
                    ) : (
                      <Input
                        type={f.kind === "email" ? "email" : f.kind === "date" ? "date" : "text"}
                        inputMode={f.kind === "id" && malaysian ? "numeric" : undefined}
                        value={value}
                        placeholder={
                          f.kind === "id"
                            ? idPlaceholderFor(values["nationality"] ?? "")
                            : undefined
                        }
                        aria-invalid={!!problem}
                        className={problem ? "border-destructive" : undefined}
                        onChange={(e) =>
                          set(
                            f.key,
                            // an NRIC is typed as digits; the dashes put themselves in
                            f.kind === "id" && malaysian
                              ? formatNric(e.target.value)
                              : e.target.value,
                          )
                        }
                        onBlur={() => touch(f.key)}
                      />
                    )}

                    {f.key === "university" && (otherUniversity || !value) ? (
                      <Input
                        placeholder="Not listed? Type your university or college"
                        value={knownUniversity ? "" : value}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    ) : null}

                    {problem ? <p className="text-[11px] text-destructive">{problem}</p> : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-brand-deep">Documents</h2>
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

      {/* last, because it refers back to everything above it - nobody can agree
          to terms about their own tenancy before saying who they are */}
      <div className="mt-5">
        <DeclarationSection
          token={token}
          fullName={values["full_name"] ?? ""}
          idNumber={values["id_number"] ?? ""}
          signed={signed}
          onSigned={setSigned}
        />
      </div>

      <div className="sticky bottom-0 mt-5 flex items-center justify-end gap-3 border-t border-border bg-background py-4">
        {problems.length ? (
          <p className="text-xs text-destructive">
            {problems.length} field{problems.length === 1 ? "" : "s"} need
            {problems.length === 1 ? "s" : ""} fixing
          </p>
        ) : null}
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
