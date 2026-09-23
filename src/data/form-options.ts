/**
 * The universities the public forms offer, in the words a student would use.
 *
 * One list, shown by the enquiry dialog and the viewing form, and matching the
 * application form's own list. It used to be six bare codes - "UoC", "CU" -
 * which meant a student picked an abbreviation they may never have seen, and
 * the enquiry form offered LKW while the application form did not.
 *
 * `value` is what gets stored, and it is deliberately the SAME string as
 * before. Relabelling must not rewrite a single stored answer, and
 * `universityAbbr` below still maps these values for the admin lists - the
 * rule the level, race and payment schedule lists already follow.
 */
export const UNIVERSITIES: { value: string; label: string }[] = [
  { value: "MMU", label: "MMU - Multimedia University" },
  { value: "HWUM", label: "HWUM - Heriot-Watt University Malaysia" },
  { value: "UoC", label: "UoC - University of Cyberjaya" },
  { value: "CU", label: "CU - City University Malaysia" },
  { value: "Other", label: "Other - I will type it" },
];

/** Just the stored values, for the places that only need to know the set. */
export const UNIVERSITY_VALUES = UNIVERSITIES.map((u) => u.value);

// Map any stored university value (abbreviation or full name) to its short form.
const UNIVERSITY_ABBR: Record<string, string> = {
  MMU: "MMU",
  "Multimedia University": "MMU",
  HWUM: "HWUM",
  "Heriot-Watt University Malaysia": "HWUM",
  "Heriot-Watt University": "HWUM",
  "Heriot-Watt": "HWUM",
  UoC: "UoC",
  "University of Cyberjaya": "UoC",
  LKW: "LKW",
  "Lim Kok Wing": "LKW",
  Limkokwing: "LKW",
  "Limkokwing University": "LKW",
  CU: "CU",
  "City University": "CU",
  "City University Malaysia": "CU",
};

export function universityAbbr(value?: string | null): string {
  if (!value) return "";
  const v = value.trim();
  if (v === "Other") return "Other";
  if (UNIVERSITY_ABBR[v]) return UNIVERSITY_ABBR[v];
  // Handle stored values like "Multimedia University (MMU)" — use the
  // parenthetical abbreviation when it is a known short form.
  const paren = v.match(/\(([A-Za-z]+)\)$/);
  const abbr = paren ? paren[1] : "";
  if (abbr && UNIVERSITY_VALUES.includes(abbr)) return abbr;
  return v;
}

export const HEARD_ABOUT = [
  "University",
  "Google Search",
  "Friend",
  "Agent",
  "Social Media",
  "Other",
];

export const ENQUIRY_STATUS = [
  { value: "enquired", label: "Yes, I've already enquired" },
  { value: "viewing_first", label: "No, I'd like to view first" },
];

// rooms and units are allocated by gender, so a stay cannot be placed without
// one - there is no third answer the allocation could act on
export const GENDERS = ["Female", "Male"];

export const STAFF = ["Syazwani", "Norfadirah", "Valsala"];


export const SHARING_PREFERENCES = [
  { value: "single", label: "Single room" },
  { value: "twin", label: "Twin sharing" },
  { value: "unit", label: "Whole unit" },
];

export const SHARING_LABEL: Record<string, string> = Object.fromEntries(
  SHARING_PREFERENCES.map((s) => [s.value, s.label]),
);

export function intakeMonths(count = 18) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return d.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  });
}
