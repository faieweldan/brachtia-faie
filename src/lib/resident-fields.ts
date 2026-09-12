import type { ProfileLinkFields } from "@/lib/profile-link.functions";
import type { Resident } from "@/lib/ops-store";
import {
  COUNTRY_OPTIONS,
  GENDER_OPTIONS,
  LEVEL_OPTIONS,
  MARITAL_OPTIONS,
  RELATIONSHIP_OPTIONS,
  UNIVERSITY_OPTIONS,
  YES_NO_OPTIONS,
  graduationYearOptions,
  normCountry,
  normRelationship,
  normUniversity,
  type Normalised,
} from "@/lib/reference-data";

/**
 * The resident profile, section by section - the one list both screens read.
 *
 * The admin portal and the student's profile link used to each keep their own
 * copy. They drifted: the student form grew a "Health" box the admin portal
 * never had, and called "Personal" "About you". Now there is one list. Rename a
 * section, move a field or delete one here and both screens change together.
 */

type Option = { value: string; label: string };

export type FieldKind =
  | "text"
  | "email"
  | "date"
  | "phone"
  | "id" // passport or NRIC, depending on nationality
  | "choice" // a fixed list
  | "long"; // several lines of text

export type ResidentField = {
  /** the database column, which is also what the profile link sends */
  key: keyof ProfileLinkFields;
  /** the same field on the admin portal's Resident record */
  camel: keyof Resident;
  label: string;
  kind: FieldKind;
  options?: Option[];
  /** staff may type something off the list; students choose from it */
  normalise?: (v: string) => Normalised;
  wide?: boolean;
  /** set by Brachtia, never shown on the student's form */
  staffOnly?: boolean;
  /** only asked when another field has this value */
  showIf?: { key: keyof ProfileLinkFields; equals: string };
  /** placeholder on the student's form */
  hint?: string;
};

export type ResidentSection = {
  key: string;
  title: string;
  fields: ResidentField[];
};

export const RESIDENT_SECTIONS: ResidentSection[] = [
  {
    key: "personal",
    title: "Personal",
    fields: [
      {
        key: "full_name",
        camel: "fullName",
        label: "Full name (per passport / NRIC)",
        kind: "text",
      },
      { key: "email", camel: "email", label: "Email", kind: "email" },
      { key: "mobile", camel: "mobile", label: "Mobile number", kind: "phone" },
      { key: "dob", camel: "dob", label: "Date of birth", kind: "date" },
      {
        key: "nationality",
        camel: "nationality",
        label: "Nationality",
        kind: "choice",
        options: COUNTRY_OPTIONS,
        normalise: normCountry,
      },
      { key: "id_number", camel: "idNumber", label: "Passport / NRIC number", kind: "id" },
      { key: "gender", camel: "gender", label: "Gender", kind: "choice", options: GENDER_OPTIONS },
      {
        key: "marital_status",
        camel: "maritalStatus",
        label: "Marital status",
        kind: "choice",
        options: MARITAL_OPTIONS,
      },
      { key: "race", camel: "race", label: "Race", kind: "text" },
      { key: "religion", camel: "religion", label: "Religion", kind: "text" },
      { key: "address", camel: "address", label: "Address", kind: "text", wide: true },
      { key: "postcode", camel: "postcode", label: "Postcode", kind: "text" },
      { key: "state", camel: "state", label: "State", kind: "text" },
      {
        key: "country",
        camel: "country",
        label: "Country",
        kind: "choice",
        options: COUNTRY_OPTIONS,
        normalise: normCountry,
      },
      {
        key: "medical_condition",
        camel: "medicalCondition",
        label: "Medical condition / allergy",
        kind: "choice",
        options: YES_NO_OPTIONS,
      },
      {
        key: "medical_detail",
        camel: "medicalDetail",
        label: "Medical details",
        kind: "long",
        wide: true,
        showIf: { key: "medical_condition", equals: "yes" },
        hint: "Conditions, allergies, medication…",
      },
    ],
  },
  {
    key: "academic",
    title: "Academic",
    fields: [
      {
        key: "university",
        camel: "university",
        label: "University / college",
        kind: "choice",
        options: UNIVERSITY_OPTIONS.filter((o) => o.value !== "OTHER"),
        normalise: normUniversity,
      },
      {
        key: "level_of_study",
        camel: "levelOfStudy",
        label: "Level of study",
        kind: "choice",
        options: LEVEL_OPTIONS,
      },
      { key: "course", camel: "course", label: "Course / programme", kind: "text" },
      { key: "student_id", camel: "studentId", label: "Student ID", kind: "text" },
      {
        key: "graduation_year",
        camel: "graduationYear",
        label: "Expected graduation year",
        kind: "choice",
        options: graduationYearOptions(),
      },
    ],
  },
  {
    key: "emergency",
    title: "Emergency contact",
    fields: [
      { key: "ec_name", camel: "ecName", label: "Full name", kind: "text" },
      {
        key: "ec_relationship",
        camel: "ecRelationship",
        label: "Relationship",
        kind: "choice",
        options: RELATIONSHIP_OPTIONS,
        normalise: normRelationship,
      },
      { key: "ec_mobile", camel: "ecMobile", label: "Mobile number", kind: "phone" },
      { key: "ec_email", camel: "ecEmail", label: "Email", kind: "email" },
      { key: "ec_address", camel: "ecAddress", label: "Address", kind: "text", wide: true },
      { key: "ec_postcode", camel: "ecPostcode", label: "Postcode", kind: "text" },
      { key: "ec_state", camel: "ecState", label: "State", kind: "text" },
      {
        key: "ec_country",
        camel: "ecCountry",
        label: "Country",
        kind: "choice",
        options: COUNTRY_OPTIONS,
        normalise: normCountry,
      },
    ],
  },
  {
    key: "payment",
    title: "Payor details",
    fields: [
      // the lists for these two live with the rest of the billing rules in
      // ops-store, which the student's page has no business loading
      {
        key: "pay_method",
        camel: "payMethod",
        label: "Payment method",
        kind: "choice",
        staffOnly: true,
      },
      {
        key: "pay_schedule",
        camel: "paySchedule",
        label: "Payment schedule",
        kind: "choice",
        staffOnly: true,
      },
      { key: "payer_name", camel: "payerName", label: "Payor name", kind: "text" },
      {
        key: "payer_relationship",
        camel: "payerRelationship",
        label: "Relationship to resident",
        kind: "choice",
        options: RELATIONSHIP_OPTIONS,
        normalise: normRelationship,
      },
      { key: "payer_mobile", camel: "payerMobile", label: "Payor mobile", kind: "phone" },
      { key: "payer_email", camel: "payerEmail", label: "Payor email", kind: "email" },
      {
        key: "payer_address",
        camel: "payerAddress",
        label: "Payor address",
        kind: "text",
        wide: true,
      },
      { key: "payer_postcode", camel: "payerPostcode", label: "Payor postcode", kind: "text" },
      { key: "payer_state", camel: "payerState", label: "Payor state", kind: "text" },
      {
        key: "payer_country",
        camel: "payerCountry",
        label: "Payor country",
        kind: "choice",
        options: COUNTRY_OPTIONS,
        normalise: normCountry,
      },
    ],
  },
];

/** Is this field asked, given what else has been answered? */
export function fieldShown(
  f: ResidentField,
  get: (key: keyof ProfileLinkFields) => string,
): boolean {
  return !f.showIf || get(f.showIf.key) === f.showIf.equals;
}

/* ---------------------------------------------------------------------------
 * Checking what was typed.
 *
 * Each returns "" when the value is fine, or a sentence saying what is wrong.
 * An empty value is never an error here - leaving something blank is allowed,
 * typing something broken is not.
 * ------------------------------------------------------------------------- */

export function emailProblem(v: string): string {
  const s = v.trim();
  if (!s) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? "" : "This does not look like an email address.";
}

/** The part after the country code: digits only, no leading 0. */
export function phoneDigits(v: string): string {
  return v.replace(/\D/g, "").replace(/^0+/, "");
}

export function phoneProblem(rest: string, dial: string): string {
  const d = rest.replace(/\D/g, "");
  if (!d) return "";
  // Malaysian mobiles are 9 or 10 digits after +60 (12 345 6789, 11 2345 6789)
  if (dial === "+60" && (d.length < 9 || d.length > 10))
    return "A Malaysian number is 9 or 10 digits after +60.";
  if (d.length < 6 || d.length > 14) return "This number looks too short or too long.";
  return "";
}

/** 010203145678 -> 010203-14-5678, whatever dashes or spaces were typed. */
export function formatNric(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 8) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

export function nricProblem(v: string): string {
  const d = v.replace(/\D/g, "");
  if (!d) return "";
  return d.length === 12 ? "" : "An NRIC has 12 digits.";
}
