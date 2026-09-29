/**
 * The declaration a student agrees to, as content rather than as markup.
 *
 * The terms live here so the same words can be shown on screen, frozen
 * into the signature record, and printed later without being written out three
 * times and drifting apart.
 *
 * Changing any word here means a new version. The old text is not edited,
 * because a student who signed it agreed to what it said then, and that has to
 * stay answerable. `DECLARATION_VERSION` is the only thing to bump.
 */

export const DECLARATION_VERSION = "v3";

/**
 * The declaration, word for word from Brachtia's form, with its emphasis kept.
 *
 * Not tidied up, not rephrased. This is a consent: a clearer paraphrase is a
 * different thing from the one a student agreed to, and if the two ever
 * disagree nobody can say which was signed.
 *
 * The bold is part of the document, not decoration - it is what the drafter
 * chose to draw the eye to. `**bold**` and `__underlined__` mark it up here so
 * the same words stand out on screen and in the stored copy without the text
 * being written out twice.
 */
export const DECLARATION_TERMS: string[] = [
  "Brachtia Homes may collect and use my personal information to manage my accommodation, prepare my **Tenancy Agreement**, maintain my resident profile and provide related resident services.",
  "My information and supporting documents may be shared with the relevant **building management and security management** where required for resident registration, access card application and building access.",
  "I will inform Brachtia Homes if any information provided changes or is incorrect.",
  "I agree to review and comply with the applicable **Tenancy Terms and Brachtia Homes House Rules** and agree to any and all penalties as deemed appropriate by the management.",
];

/**
 * The term that points at a document, and the document itself (v3, 29 Sep
 * 2026). Its bold words open the Tenancy Terms and House Rules, and the term
 * cannot be ticked until they have been opened - agreeing to rules nobody has
 * looked at is not agreeing to them.
 */
export const TERMS_DOC_TERM = 3;
export const TERMS_DOC_URL = "/documents/tenancy-terms-and-house-rules.pdf";

/** The marked-up text as the plain words, for anything that cannot show
 *  emphasis - the stored copy a signature is taken against, for instance. */
export function plainTerm(text: string): string {
  return text.replace(/\*\*/g, "").replace(/__/g, "");
}

/**
 * Split marked-up text into runs a renderer can walk.
 *
 * Kept deliberately small: two markers, no nesting rules beyond bold wrapping
 * underline, because this formats one fixed document rather than arbitrary
 * input.
 */
export type Run = { text: string; bold: boolean; underline: boolean };

export function termRuns(text: string): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let underline = false;
  let buf = "";
  const push = () => {
    if (buf) runs.push({ text: buf, bold, underline });
    buf = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith("**", i)) {
      push();
      bold = !bold;
      i += 1;
    } else if (text.startsWith("__", i)) {
      push();
      underline = !underline;
      i += 1;
    } else {
      buf += text[i];
    }
  }
  push();
  return runs;
}

export const DECLARATION_TITLE = "Declaration and consent";

export const DECLARATION_INTRO =
  "I declare that the information and documents provided in this form are true, complete and accurate. I understand and agree that:";

/** The line under the terms, which is what the signature is given against. */
export const DECLARATION_CLOSING =
  "By submitting this form, I confirm that I have read, understood and agreed to this Declaration & Consent.";

/** The party on the other side of this agreement, as printed on the form. */
export const LANDLORD_ENTITY = "Brachtia Maju Resources PLT";
export const LANDLORD_REG_NO = "202304003086 (LLP0037045-LGN)";

/**
 * The exact words a signature is taken against.
 *
 * Built from the parts above rather than typed out again, so the text shown on
 * screen and the text recorded in the signature cannot drift. The server hashes
 * this and refuses to record a signature if its hash does not match the version
 * on record - which is how an accidental edit to the wording is caught rather
 * than quietly changing what past students appear to have agreed to.
 */
export function declarationBody(): string {
  const numbered = DECLARATION_TERMS.map((t, i) => `${i + 1}. ${plainTerm(t)}`).join("\n");
  return [
    `${DECLARATION_TITLE.toUpperCase()} (${DECLARATION_VERSION})`,
    `${LANDLORD_ENTITY} · Reg No ${LANDLORD_REG_NO}`,
    "",
    DECLARATION_INTRO,
    "",
    numbered,
    "",
    DECLARATION_CLOSING,
    "",
  ].join("\n");
}

/**
 * The signed copy as the student is shown it.
 *
 * The stored text keeps the version and the company line - that is the record,
 * and the server's hash is taken against it - but the student does not need to
 * read either. Only the display drops them, so what was signed stays exactly
 * what was signed.
 */
export function shownBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => !line.startsWith(`${LANDLORD_ENTITY} · Reg No`))
    .map((line) => line.replace(/\s*\(v\d+\)\s*$/, ""))
    .join("\n");
}

/** Names compared the way a person would: spacing and case do not matter. */
export function nameMatches(typed: string, onFile: string): boolean {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm(typed) || !norm(onFile)) return false;
  return norm(typed) === norm(onFile);
}

/**
 * ID numbers compared ignoring how they were punctuated - 040225-14-1207 and
 * 040225141207 are one number typed two ways, and a passport can carry spaces.
 *
 * The number is typed rather than filled in for the student, because a field
 * they never touched is not something they attested to. Typing it is part of
 * the signature; checking it against the record is what makes it worth having.
 */
export function idMatches(typed: string, onFile: string): boolean {
  const norm = (v: string) => v.replace(/[\s-]/g, "").toLowerCase();
  if (!norm(typed) || !norm(onFile)) return false;
  return norm(typed) === norm(onFile);
}
