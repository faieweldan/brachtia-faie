import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck,
  CheckCircle2,
  FileSignature,
  Loader2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { missingResidentDocs, residentDocsFor, residentDocLabel } from "@/lib/resident-documents";
import {
  getProfileByToken,
  submitProfileByToken,
  uploadDocumentByToken,
  type ProfileLinkFields,
} from "@/lib/profile-link.functions";
import { compressImage, readableSize } from "@/lib/compress";
import { DeclarationSection } from "@/components/site/DeclarationSection";
import { FormSteps } from "@/components/site/FormSteps";
import { CheckInStep } from "@/components/site/CheckInStep";
import type { CheckInChoice } from "@/lib/checkin";
import { DateInput } from "@/components/ui/date-input";
import type { CalendarEvent } from "@/lib/calendar";
import { AddToCalendar } from "@/components/site/AddToCalendar";
import { RESIDENT_DOCUMENTS } from "@/lib/resident-reading";
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
  MIN_RESIDENT_AGE,
  RESIDENT_SECTIONS,
  emailProblem,
  fieldShown,
  latestBirthDate,
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
 * When the student pays for themselves, the payor's details are their own.
 * Asking for the same email and number a second time is how the two end up
 * disagreeing, so they are copied across instead of typed again.
 *
 * Out here rather than in the component: it never changes, so it is not
 * something an effect has to watch.
 */
/**
 * Who pays. Blank until they answer - a default here would mirror somebody's
 * details into the payor fields without them ever saying so.
 */
type PayorMode = "" | "self" | "other";

const PAYOR_CHOICES: { value: Exclude<PayorMode, "">; label: string; hint: string }[] = [
  { value: "self", label: "Myself", hint: "We use the details you gave above" },
  { value: "other", label: "Someone else", hint: "A parent, guardian or sponsor" },
];

const PAYOR_FROM_MINE: [keyof ProfileLinkFields, keyof ProfileLinkFields][] = [
  ["payer_name", "full_name"],
  ["payer_mobile", "mobile"],
  ["payer_email", "email"],
  ["payer_address", "address"],
  ["payer_postcode", "postcode"],
  ["payer_state", "state"],
  ["payer_country", "country"],
];

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

/**
 * What is wrong with one field, or "" if nothing is.
 *
 * Every field the student is shown is one Brachtia needs, so a blank one is a
 * problem like any other. Only the shape of an answer used to be checked, which
 * let an empty form be submitted whole and left staff chasing the gaps by hand.
 */
function problemFor(f: ResidentField, values: ProfileLinkFields): string {
  const value = values[f.key] ?? "";
  // "yes" to a medical condition means nothing without saying which
  if (f.key === "medical_detail" && !value.trim())
    return "Please tell us what the condition or allergy is.";
  if (!value.trim()) return `${f.label} is needed.`;
  // residents are at least sixteen
  if (f.key === "dob" && value > latestBirthDate())
    return `Residents must be at least ${MIN_RESIDENT_AGE} years old.`;
  if (f.kind === "email") return emailProblem(value);
  if (f.kind === "phone") {
    const { dial, rest } = splitPhone(value);
    return phoneProblem(rest, dial);
  }
  if (f.kind === "id" && values["nationality"] === "MYS") return nricProblem(value);
  return "";
}

/**
 * A phone number, asked for as a country code plus the rest.
 *
 * The rest only takes digits, and a leading 0 is refused as it is typed: the
 * code box already says +60, and 0 is not part of an international number.
 *
 * The code picked is remembered here rather than read back out of the stored
 * value. A number with no digits yet is stored as nothing at all - so a code
 * picked first had nowhere to live and the picker sprang back to the country's
 * own code, which read as a dropdown that would not open. Most students pick
 * the code before typing, so it has to hold on its own.
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
  const [picked, setPicked] = useState("");
  const dial = parts.dial || picked || fallbackDial || "+60";
  return (
    <div className="flex gap-2">
      <DialPicker
        value={dial}
        onChange={(d) => {
          setPicked(d);
          onChange(joinPhone(d, parts.rest));
        }}
      />
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
  // the ID they go by at Brachtia - shown, never edited, and not their university student ID
  const [residentCode, setResidentCode] = useState("");
  // a field's problem is shown once they have left it, not mid-word
  const [touched, setTouched] = useState<Set<string>>(new Set());
  /*
   * Which part of the form is on screen, and how far they have got.
   *
   * `furthest` is kept apart from `step` so a finished step can be gone back
   * to without losing the ones after it - a typo in a legal name is worth more
   * than the tidiness of a one-way form.
   */
  const [step, setStep] = useState(1);
  const [furthest, setFurthest] = useState(1);
  const [moveIn, setMoveIn] = useState("");
  const [residenceName, setResidenceName] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [checkIn, setCheckIn] = useState<CheckInChoice>({ on: "", slot: "", remind: false });
  // the documents they have opened - Submit waits for both
  const [read, setRead] = useState<Set<string>>(new Set());

  // remembered, not worked out from whether the two sides match: two empty
  // fields match, which is not the same as having been answered
  const [payorMode, setPayorMode] = useState<PayorMode>("");

  // while "Myself" stands the payor follows the details above, so an address
  // filled in afterwards still reaches it - copying once left those blank
  useEffect(() => {
    if (payorMode !== "self") return;
    setValues((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      let changed = false;
      for (const [to, from] of PAYOR_FROM_MINE) {
        const mine = prev[from] ?? "";
        if ((prev[to] ?? "") !== mine) {
          next[to] = mine;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [payorMode, values]);

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
          setMoveIn(String(res.moveIn ?? ""));
          setResidenceName(String((res as any).residenceName ?? ""));
          setPlaceName(String((res as any).placeName ?? ""));
          // a student coming back finds the arrival they already chose, rather
          // than an empty form that looks like it lost their answer
          if (res.checkIn)
            setCheckIn({
              on: String(res.checkIn.on ?? ""),
              slot: String(res.checkIn.slot ?? ""),
              remind: Boolean(res.checkIn.remind),
            });
          // a student coming back to a form whose payor already matches keeps
          // the tick, rather than finding it cleared
          // read back from what was saved: "Self" is the answer itself, and a
          // payor already on record means somebody else is paying
          const mirrored =
            !!(v["full_name"] ?? "").trim() &&
            PAYOR_FROM_MINE.every(([to, from]) => (v[to] ?? "") === (v[from] ?? ""));
          const anyPayor = PAYOR_FROM_MINE.some(([to]) => (v[to] ?? "").trim());
          setPayorMode(
            v["payer_relationship"] === "Self" || mirrored ? "self" : anyPayor ? "other" : "",
          );
          setDocs(Object.fromEntries(res.docs.map((d) => [d.key, d.fileName])));
          setResidentCode(res.residentCode);
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

  /*
   * Every field actually being asked for, in one list.
   *
   * The payor gate belongs here and not only where the fields are drawn: this
   * list is what counts the progress bar, what "N fields need fixing" counts,
   * and what the save is refused on. Left out, a student paying for themselves
   * is held back by seven fields they cannot see - the same mistake as
   * validating a hidden field on the enquiry form.
   */
  const shownFields = useMemo(() => {
    if (!values) return [];
    return SECTIONS.flatMap((s) =>
      s.key === "payment" && payorMode !== "other" ? [] : s.fields,
    ).filter((f) => fieldShown(f, (k) => values[k] ?? ""));
  }, [values, payorMode]);
  const shownKeys = useMemo(() => new Set(shownFields.map((f) => f.key)), [shownFields]);

  const remaining = values ? shownFields.filter((f) => !(values[f.key] ?? "").trim()).length : 0;
  const filledPct = shownFields.length
    ? Math.round(((shownFields.length - remaining) / shownFields.length) * 100)
    : 0;
  const problems = values
    ? shownFields.map((f) => ({ f, msg: problemFor(f, values) })).filter((p) => p.msg)
    : [];
  // worked out once, and read by both the count at the bottom and each field
  const problemByKey = new Map(problems.map((p) => [p.f.key, p.msg]));
  // the documents still to be opened - Submit waits for them
  const unread = RESIDENT_DOCUMENTS.filter((d) => !read.has(d.key));
  /*
   * The uploads still missing, for the answer they gave to Student or Employed.
   *
   * The dot beside each one said "required" and nothing checked it, so an
   * application could be sent with none of them - the form asked for a passport
   * copy in the same breath it accepted not having one. Only what this person is
   * actually shown counts: a student is never asked for an employment letter and
   * cannot be held up by one.
   */
  const missingDocs = missingResidentDocs(values?.["current_status"] ?? "", docs);

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

  /** Jump to a step already reached. Forward is earned, not clicked. */
  function goToStep(n: number) {
    if (n > furthest) return;
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Move on, if this step is finished.
   *
   * Step 1 is finished when nothing is blank or badly shaped - the same check
   * Submit makes, made here instead so a student is told at the point they
   * filled it in rather than three screens later. Step 2 is finished when the
   * declaration is signed.
   */
  function nextStep() {
    if (step === 1 && problems.length) {
      showProblems();
      return;
    }
    if (step === 1 && missingDocs.length) {
      showMissingDocs();
      return;
    }
    if (step === 2 && !signed) {
      toast.error("Please sign the declaration to continue");
      return;
    }
    if (step === 2 && unread.length) {
      toast.error("Please open the Tenancy Agreement and House Rules first");
      return;
    }
    const to = Math.min(step + 1, 3);
    setStep(to);
    setFurthest((was) => Math.max(was, to));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Show every gap at once and put the cursor in the first one. */
  function showProblems() {
    setTouched(new Set(problems.map((p) => p.f.key)));
    const first = document.getElementById(`f-${problems[0]!.f.key}`);
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
    first?.querySelector<HTMLElement>("input, select, textarea, button")?.focus({
      preventScroll: true,
    });
    toast.error(
      `${problems.length} field${problems.length === 1 ? "" : "s"} still ${problems.length === 1 ? "needs" : "need"} an answer`,
    );
  }

  /** Say which uploads are missing, and take them to the list. */
  function showMissingDocs() {
    document.getElementById("documents")?.scrollIntoView({ block: "start", behavior: "smooth" });
    const names = missingDocs
      .map((d) => residentDocLabel(d.key, values?.["nationality"] ?? ""))
      .join(", ");
    toast.error(
      missingDocs.length === 1 ? `${names} is still to upload` : `Still to upload: ${names}`,
    );
  }

  async function submit() {
    if (!values) return;
    // a gap can only be on step 1, so that is where they are taken to fix it
    if (problems.length) {
      setStep(1);
      showProblems();
      return;
    }
    if (missingDocs.length) {
      setStep(1);
      showMissingDocs();
      return;
    }
    setSaving(true);
    try {
      const res = await submitProfileByToken({ data: { token, values, checkIn } });
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
    // the arrival they asked for, as something they can keep - only when there
    // is a day and a time to keep; a reminder request has nothing to put in a diary
    const arrival: CalendarEvent | null =
      checkIn.on && checkIn.slot
        ? {
            uid: `checkin-${token}`,
            title: `Arrival check-in${residenceName ? ` — ${residenceName}` : " — Brachtia Homes"}`,
            startsAt: new Date(`${checkIn.on}T${checkIn.slot}:00+08:00`).toISOString(),
            // a check-in is booked as an hour
            endsAt: new Date(
              new Date(`${checkIn.on}T${checkIn.slot}:00+08:00`).getTime() + 60 * 60000,
            ).toISOString(),
            // the unit and room are what gets them to the right door on the day
            location: [placeName, residenceName].filter(Boolean).join(", ") || "Brachtia Homes",
            details:
              "Your arrival check-in with Brachtia Homes: a tour, your keys and access card. Full initial payment must be cleared before keys are handed over. We will confirm this slot with you.",
          }
        : null;
    const arrivalLabel = arrival
      ? `${new Date(`${checkIn.on}T00:00:00`).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })} at ${checkIn.slot}`
      : "";

    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="size-10 text-brand" />
          <h1 className="text-xl font-bold text-brand-deep">Thank you — your application is in</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            We have your details, documents and signed declaration. Our team will review them and
            be in touch.
          </p>

          {arrival ? (
            <div className="mt-3 w-full max-w-sm rounded-xl border border-border bg-card p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your arrival check-in request
              </p>
              <p className="mt-1 text-sm font-semibold text-brand-deep">{arrivalLabel}</p>
              {placeName ? <p className="text-sm text-foreground">{placeName}</p> : null}
              {residenceName ? (
                <p className="text-sm text-muted-foreground">{residenceName}</p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                We will confirm this slot with you before the day.
              </p>
              <AddToCalendar
                className="mt-3"
                event={arrival}
                fileName="brachtia-arrival-check-in.ics"
              />
            </div>
          ) : checkIn.remind ? (
            <p className="mt-3 max-w-sm rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              You asked us to remind you about your arrival. We will be in touch about a week
              before you move in.
            </p>
          ) : null}

          <p className="mt-2 max-w-sm text-xs text-muted-foreground">
            You can close this page. Reopen the same link any time to change something.
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

  /**
   * "Myself" hands the copying to the effect above and answers the relationship
   * on their behalf; "Someone else" gives the payor fields back, empty, so they
   * can be filled in for whoever is really paying.
   */
  const choosePayor = (mode: Exclude<PayorMode, "">) => {
    setPayorMode(mode);
    setValues((prev) => {
      if (!prev) return prev;
      // "Myself" answers the relationship too - it is not asked again below
      if (mode === "self") return { ...prev, payer_relationship: "Self" };
      // somebody else: the fields come back empty, and the relationship is
      // cleared so they pick a real one rather than inheriting "Self"
      return {
        ...prev,
        payer_relationship: "",
        ...Object.fromEntries(PAYOR_FROM_MINE.map(([to]) => [to, ""])),
      };
    });
  };

  return (
    <Shell>
      {/* No block. A slab of solid green outweighed the white cards it was
          introducing - the heaviest thing on the page was the part you only
          read once. The title carries the colour by itself, which is how the
          section headings below already work, and the bar is the one line of
          green that changes as you fill the form in. */}
      <div className="mb-6 px-1">
        <h1 className="text-2xl font-bold tracking-tight text-brand-deep sm:text-3xl">
          Your resident details
        </h1>
        {residentCode ? (
          <p className="mt-1.5 text-sm text-foreground">
            Resident ID{" "}
            <span className="font-semibold tabular-nums text-brand-deep">{residentCode}</span>
          </p>
        ) : null}
        {/* the muted grey lands at 4.4:1 on the tinted page, a hair under the
            4.5:1 body minimum, and fading the foreground only made it lighter -
            alpha over a light page raises lightness. So: the full foreground. */}
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-foreground">
          Please check everything below and fill in what is missing. If something we already have is
          wrong, just correct it.
        </p>

        {/* how far there is left to go, rather than a count nobody can place */}
        {shownFields.length ? (
          <div className="mt-5">
            <div
              role="progressbar"
              aria-valuenow={filledPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile completeness"
              className="h-1 overflow-hidden rounded-full bg-brand/15"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
                style={{ width: `${filledPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-brand-deep">
              {remaining > 0
                ? `${remaining} field${remaining === 1 ? "" : "s"} still empty · ${filledPct}% done`
                : "Everything is filled in"}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mb-6">
        <FormSteps
          steps={[
            { n: 1, label: "Resident profile", icon: UserRound },
            { n: 2, label: "Sign declaration", icon: FileSignature },
            { n: 3, label: "Schedule check-in", icon: CalendarCheck },
          ]}
          at={step}
          furthest={furthest}
          onGo={goToStep}
        />
      </div>

      <div className={step === 1 ? "space-y-4" : "hidden"}>
        {/* a section whose questions are all put away - Employment for a
            student, Academic for someone working - is not a heading over
            nothing, so it is not drawn at all */}
        {/*
          A section whose questions are all put away - Employment for a student,
          Academic for someone working - is not a heading over nothing, so it is
          not drawn at all. Payment is the exception: it carries the question of
          who is paying, which is what puts its fields on the screen in the first
          place, so it stays even when it has no fields to show.
        */}
        {SECTIONS.filter(
          (s) => s.key === "payment" || s.fields.some((f) => shownKeys.has(f.key)),
        ).map((section) => (
          <section
            key={section.key}
            className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.18)] sm:p-6"
          >
            {/* the rule under a heading is the brand's, so scanning the page
                reads as one system rather than grey furniture */}
            <h2 className="border-b-2 border-brand/25 pb-3 text-base font-semibold tracking-tight text-brand-deep">
              {section.title}
            </h2>
            {/*
              Only worth offering once they have said they pay for themselves.
              It tints when on, the way a ticked declaration term does, so the
              state of the section is readable without reading the box.
            */}
            {/*
              The question before the fields, not a tick beside them: who pays
              decides whether there is anything else to ask at all. Answering
              "Myself" states back what we already hold instead of asking for
              the same name, number and address a second time - which is how
              the two ended up disagreeing.
            */}
            {/*
              Asked before the payor's details, not after: whether there is a
              second person to ask about decides whether any of it is asked at
              all. Answering "Myself" copies the details above rather than
              asking for the same name, number and address again - which is how
              the two ended up disagreeing. Kept small: one question, not a section.
            */}
            {section.key === "payment" ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-foreground/70">
                  Who will be making the payment?
                </p>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  {PAYOR_CHOICES.map((o) => {
                    const on = payorMode === o.value;
                    return (
                      <label
                        key={o.value}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                          on
                            ? "border-brand/40 bg-brand-tint/60"
                            : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payor-mode"
                          className="size-3.5 shrink-0 accent-brand"
                          checked={on}
                          onChange={() => choosePayor(o.value)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-tight text-brand-deep">
                            {o.label}
                          </span>
                          <span className="block text-[11px] leading-snug text-muted-foreground">
                            {o.hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {/* empty when the payor is themselves - no top margin then, or the
                question above it sits over a gap with nothing under it */}
            <div
              className={`grid gap-x-5 gap-y-4 sm:grid-cols-2 ${
                section.fields.some((f) => shownKeys.has(f.key)) ? "mt-5" : ""
              }`}
            >
              {section.fields.map((f) => {
                // shownKeys already knows about the payor gate, so a field hidden
                // here is a field nothing else is counting either
                if (!shownKeys.has(f.key)) return null;

                const value = values[f.key] ?? "";
                const empty = !value.trim();
                const malaysian = values["nationality"] === "MYS";
                const problem = touched.has(f.key) ? (problemByKey.get(f.key) ?? "") : "";
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
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
                      {label}
                      {empty ? (
                        <span
                          aria-hidden
                          title="Still empty"
                          className="size-1.5 rounded-full bg-brand"
                        />
                      ) : null}
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
                    ) : f.kind === "date" ? (
                      // day first whatever the phone's language, and no
                      // birthday that makes them younger than sixteen
                      <DateInput
                        value={value}
                        max={latestBirthDate()}
                        aria-label={f.label}
                        data-invalid={problem ? "true" : undefined}
                        className={problem ? "border-destructive" : undefined}
                        onChange={(e) => set(f.key, e.target.value)}
                        onBlur={() => touch(f.key)}
                      />
                    ) : (
                      <Input
                        type={f.kind === "email" ? "email" : "text"}
                        inputMode={f.kind === "id" && malaysian ? "numeric" : undefined}
                        value={value}
                        placeholder={
                          f.kind === "id"
                            ? idPlaceholderFor(values["nationality"] ?? "")
                            : // a field's own hint, where it has one - it was
                              // only reaching the long boxes before
                              f.hint
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

        <section
          id="documents"
          className="scroll-mt-6 rounded-2xl border border-border bg-card p-5"
        >
          <h2 className="text-sm font-semibold text-brand-deep">Documents</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A clear phone photo is fine — we shrink it for you. PDFs work too.
          </p>
          <div className="mt-4 space-y-2">
            {/* what they are asked for follows the Student or Employed answer
                above, the same way the fields do - somebody working was being
                asked to upload a university offer letter they do not have */}
            {residentDocsFor(values["current_status"] ?? "").map((d) => {
              const have = docs[d.key];
              return (
                <div
                  key={d.key}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    have ? "border-brand/30 bg-brand-tint/40" : "border-border"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {/* follows the nationality picked above, like the ID number does */}
                      {residentDocLabel(d.key, values["nationality"] ?? "")}
                      {/* every one of these is needed before the application can
                          be processed, so the dot says so on the row itself
                          rather than in a sentence nobody reads twice */}
                      {d.required ? (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-emerald-600"
                          title="Required"
                          aria-label="Required"
                        />
                      ) : null}
                    </p>
                    <p
                      className={`truncate text-xs ${have ? "text-brand-deep" : "text-muted-foreground"}`}
                    >
                      {have ? have : "Not uploaded yet"}
                    </p>
                  </div>
                  <label className="cursor-pointer">
                    <span className="inline-flex h-9 items-center rounded-md border border-brand/40 px-3 text-sm font-medium text-brand-deep transition-colors hover:bg-brand-tint">
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

      {/* its own step, because it refers back to everything before it - nobody
          can agree to terms about their own tenancy before saying who they are,
          and on one long page they could scroll straight past and do exactly
          that */}
      <div className={step === 2 ? "space-y-4" : "hidden"}>
        <DeclarationSection
          token={token}
          fullName={values["full_name"] ?? ""}
          idNumber={values["id_number"] ?? ""}
          signed={signed}
          onSigned={setSigned}
        />

        {/* agreeing to a document nobody put in front of them is not agreement -
            so while there is nothing to put in front of them, this whole panel
            stays away rather than standing there empty asking them to open it */}
        {RESIDENT_DOCUMENTS.length ? (
          <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-brand-deep">What you are agreeing to</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Please open this before continuing. Your declaration above refers to it, so we ask
              that you have seen it.
            </p>
            <ul className="mt-3 space-y-2">
              {RESIDENT_DOCUMENTS.map((d) => {
                const opened = read.has(d.key);
                return (
                  <li key={d.key}>
                    <a
                      href={d.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setRead((was) => new Set(was).add(d.key))}
                      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                        opened
                          ? "border-brand-deep/40 bg-brand-tint"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                          opened
                            ? "border-brand-deep bg-brand-deep text-primary-foreground"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {opened ? "✓" : ""}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground underline underline-offset-2">
                          {d.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{d.note}</span>
                        <span className="mt-1 block text-xs font-medium text-brand-deep">
                          {opened ? "Opened" : "Opens in a new tab"}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <div className={step === 3 ? "space-y-4" : "hidden"}>
        <CheckInStep
          moveIn={moveIn}
          value={checkIn}
          onChange={setCheckIn}
          name={values["full_name"] ?? ""}
          residentCode={residentCode}
        />
      </div>

      {/* The save button follows you down the page without walling off the
          field behind it. A slab with an edge reads as a thing sitting on top;
          a fade into the page colour lets the form run underneath and keeps
          the button reachable at every scroll position. The strip ignores the
          pointer so only the controls in it can be clicked. */}
      <div className="pointer-events-none sticky bottom-0 z-10 -mx-4 mt-4 bg-gradient-to-t from-brand-tint via-brand-tint/85 to-transparent px-4 pb-4 pt-12 sm:mx-0">
        <div className="pointer-events-auto flex items-center justify-end gap-3">
          {/* one line, saying the thing that stands between them and finishing */}
          <p
            className={`mr-auto text-xs ${
              step === 1 && problems.length
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {step === 1
              ? problems.length
                ? `${problems.length} field${problems.length === 1 ? "" : "s"} need${problems.length === 1 ? "s" : ""} filling in`
                : // the fields are done and the uploads are not - said here too,
                  // so Next refusing is never a surprise
                  missingDocs.length
                  ? `${missingDocs.length} document${missingDocs.length === 1 ? "" : "s"} still to upload`
                  : "Everything is filled in."
              : step === 2
                ? !signed
                  ? "Sign the declaration to continue."
                  : unread.length
                    ? "Open the document above to continue."
                    : "Signed. One step to go."
                : "Submitting confirms these details are correct."}
          </p>
          {step > 1 ? (
            <Button variant="outline" onClick={() => goToStep(step - 1)} disabled={saving}>
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button
              onClick={nextStep}
              className="min-w-28 shadow-[0_2px_8px_rgba(16,24,40,0.12),0_12px_28px_-12px_rgba(16,24,40,0.35)]"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={saving}
              className="min-w-36 shadow-[0_2px_8px_rgba(16,24,40,0.12),0_12px_28px_-12px_rgba(16,24,40,0.35)]"
            >
              {saving ? "Submitting…" : "Submit my details"}
            </Button>
          )}
        </div>
      </div>
    </Shell>
  );
}

/**
 * The page the form sits on.
 *
 * No masthead: the site header already names Brachtia directly above this, and
 * a second one only repeated itself and put a tagline on top of a form. What
 * the green still does is work - the tinted canvas pushes the white cards
 * forward so the thing being filled in is the brightest surface on the page,
 * and the rest of it marks progress. Nothing decorative is painted green.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-ui min-h-screen bg-brand-tint">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">{children}</div>
    </div>
  );
}
