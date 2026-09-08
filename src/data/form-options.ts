export const UNIVERSITIES = ["MMU", "HWUM", "UoC", "LKW", "CU", "Other"];

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
  if (abbr && UNIVERSITIES.includes(abbr)) return abbr;
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

export const GENDERS = ["Female", "Male", "Prefer not to say"];

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
