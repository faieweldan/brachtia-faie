export const UNIVERSITIES = [
  "MMU",
  "HWUM",
  "UoC",
  "Lim Kok Wing",
  "City University",
  "Other",
];

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
