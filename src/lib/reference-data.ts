/**
 * The lists a student picks from, in one place.
 *
 * Typed answers were arriving as "malaysia", "Malaysian", "MY" and "MYS" for the
 * same country, which no report can group. A fixed list is not a nicety here -
 * it is the difference between a column that can be counted and one that cannot.
 *
 * Countries are stored as the ISO-3 code the master list already uses (MYS,
 * CHN, FRA), so nothing needs translating on import.
 */

export type Country = { code: string; name: string; dial: string };

/** Malaysia first, then the nationalities the master list actually contains,
 *  then the rest in alphabetical order. */
export const COUNTRIES: Country[] = [
  { code: "MYS", name: "Malaysia", dial: "+60" },
  { code: "AFG", name: "Afghanistan", dial: "+93" },
  { code: "DZA", name: "Algeria", dial: "+213" },
  { code: "AUS", name: "Australia", dial: "+61" },
  { code: "AUT", name: "Austria", dial: "+43" },
  { code: "BHR", name: "Bahrain", dial: "+973" },
  { code: "BGD", name: "Bangladesh", dial: "+880" },
  { code: "BEL", name: "Belgium", dial: "+32" },
  { code: "BRA", name: "Brazil", dial: "+55" },
  { code: "BRN", name: "Brunei", dial: "+673" },
  { code: "KHM", name: "Cambodia", dial: "+855" },
  { code: "CMR", name: "Cameroon", dial: "+237" },
  { code: "CAN", name: "Canada", dial: "+1" },
  { code: "TCD", name: "Chad", dial: "+235" },
  { code: "CHN", name: "China", dial: "+86" },
  { code: "COL", name: "Colombia", dial: "+57" },
  { code: "CON", name: "Congo", dial: "+242" },
  { code: "EGY", name: "Egypt", dial: "+20" },
  { code: "ERI", name: "Eritrea", dial: "+291" },
  { code: "ETH", name: "Ethiopia", dial: "+251" },
  { code: "FRA", name: "France", dial: "+33" },
  { code: "GAB", name: "Gabon", dial: "+241" },
  { code: "DEU", name: "Germany", dial: "+49" },
  { code: "GHA", name: "Ghana", dial: "+233" },
  { code: "GUI", name: "Guinea", dial: "+224" },
  { code: "HKG", name: "Hong Kong", dial: "+852" },
  { code: "IND", name: "India", dial: "+91" },
  { code: "IDN", name: "Indonesia", dial: "+62" },
  { code: "IRN", name: "Iran", dial: "+98" },
  { code: "IRQ", name: "Iraq", dial: "+964" },
  { code: "IRL", name: "Ireland", dial: "+353" },
  { code: "ITA", name: "Italy", dial: "+39" },
  { code: "JPN", name: "Japan", dial: "+81" },
  { code: "JOR", name: "Jordan", dial: "+962" },
  { code: "KAZ", name: "Kazakhstan", dial: "+7" },
  { code: "KEN", name: "Kenya", dial: "+254" },
  { code: "KOR", name: "Korea, South", dial: "+82" },
  { code: "KWT", name: "Kuwait", dial: "+965" },
  { code: "LAO", name: "Laos", dial: "+856" },
  { code: "LBY", name: "Libya", dial: "+218" },
  { code: "MDG", name: "Madagascar", dial: "+261" },
  { code: "MDV", name: "Maldives", dial: "+960" },
  { code: "MLI", name: "Mali", dial: "+223" },
  { code: "MRT", name: "Mauritania", dial: "+222" },
  { code: "MUS", name: "Mauritius", dial: "+230" },
  { code: "MAR", name: "Morocco", dial: "+212" },
  { code: "MOZ", name: "Mozambique", dial: "+258" },
  { code: "MMR", name: "Myanmar", dial: "+95" },
  { code: "NPL", name: "Nepal", dial: "+977" },
  { code: "NLD", name: "Netherlands", dial: "+31" },
  { code: "NZL", name: "New Zealand", dial: "+64" },
  { code: "NGA", name: "Nigeria", dial: "+234" },
  { code: "OMN", name: "Oman", dial: "+968" },
  { code: "PAK", name: "Pakistan", dial: "+92" },
  { code: "PSE", name: "Palestine", dial: "+970" },
  { code: "PHL", name: "Philippines", dial: "+63" },
  { code: "POL", name: "Poland", dial: "+48" },
  { code: "QAT", name: "Qatar", dial: "+974" },
  { code: "RUS", name: "Russia", dial: "+7" },
  { code: "RWA", name: "Rwanda", dial: "+250" },
  { code: "SAU", name: "Saudi Arabia", dial: "+966" },
  { code: "SEN", name: "Senegal", dial: "+221" },
  { code: "SGP", name: "Singapore", dial: "+65" },
  { code: "SOM", name: "Somalia", dial: "+252" },
  { code: "ZAF", name: "South Africa", dial: "+27" },
  { code: "ESP", name: "Spain", dial: "+34" },
  { code: "LKA", name: "Sri Lanka", dial: "+94" },
  { code: "SDN", name: "Sudan", dial: "+249" },
  { code: "SWE", name: "Sweden", dial: "+46" },
  { code: "CHE", name: "Switzerland", dial: "+41" },
  { code: "SYR", name: "Syria", dial: "+963" },
  { code: "TWN", name: "Taiwan", dial: "+886" },
  { code: "TZA", name: "Tanzania", dial: "+255" },
  { code: "THA", name: "Thailand", dial: "+66" },
  { code: "TUN", name: "Tunisia", dial: "+216" },
  { code: "TUR", name: "Turkey", dial: "+90" },
  { code: "UGA", name: "Uganda", dial: "+256" },
  { code: "ARE", name: "United Arab Emirates", dial: "+971" },
  { code: "GBR", name: "United Kingdom", dial: "+44" },
  { code: "USA", name: "United States", dial: "+1" },
  { code: "UZB", name: "Uzbekistan", dial: "+998" },
  { code: "VNM", name: "Vietnam", dial: "+84" },
  { code: "YEM", name: "Yemen", dial: "+967" },
  { code: "ZMB", name: "Zambia", dial: "+260" },
  { code: "ZWE", name: "Zimbabwe", dial: "+263" },
];

export const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));

export function dialFor(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.dial ?? "";
}

/** Malaysians are asked for an NRIC; everybody else for a passport number. */
export function idLabelFor(nationality: string): string {
  return nationality === "MYS" ? "NRIC number" : "Passport number";
}

export function idPlaceholderFor(nationality: string): string {
  return nationality === "MYS" ? "e.g. 010203-14-5678" : "as printed on your passport";
}

export const GENDER_OPTIONS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

export const MARITAL_OPTIONS = [
  { value: "Single", label: "Single" },
  { value: "Married", label: "Married" },
  { value: "Divorced", label: "Divorced" },
  { value: "Widowed", label: "Widowed" },
];

/** The universities in the master list today, plus a way out. CTU is City
 *  University; the master list writes the short code, so that is what is kept. */
export const UNIVERSITY_OPTIONS = [
  { value: "MMU", label: "MMU - Multimedia University" },
  { value: "HWUM", label: "HWUM - Heriot-Watt University Malaysia" },
  { value: "CTU", label: "CityU - City University Malaysia" },
  { value: "UOC", label: "UOC - University of Cyberjaya" },
  { value: "UM", label: "UM - Universiti Malaya" },
  { value: "MITRA", label: "MITRA" },
  { value: "OTHER", label: "Other - I will type it" },
];

export const LEVEL_OPTIONS = [
  { value: "Foundation", label: "Foundation" },
  { value: "Diploma", label: "Diploma" },
  { value: "Undergraduate", label: "Undergraduate" },
  { value: "Master", label: "Master" },
  { value: "Doctorate", label: "Doctorate" },
];

/**
 * This year and the next five, worked out when the form is opened.
 *
 * A fixed list would quietly go stale in January and start offering a year that
 * has already passed while missing the one at the far end.
 */
export function graduationYearOptions() {
  const now = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => {
    const y = String(now + i);
    return { value: y, label: y };
  });
}

export const RELATIONSHIP_OPTIONS = [
  { value: "Parent", label: "Parent" },
  { value: "Guardian", label: "Guardian" },
  { value: "Sponsor", label: "Sponsor" },
  { value: "Self", label: "Self" },
];

export const YES_NO_OPTIONS = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

/**
 * A phone number is stored as one string, but asked for in two parts.
 *
 * Splitting on the longest matching dial code - not the shortest - keeps +60
 * from swallowing a +607 that does not exist, and stops +1 from claiming every
 * number beginning with a one.
 */
export function splitPhone(raw: string): { dial: string; rest: string } {
  const v = (raw ?? "").trim();
  if (!v.startsWith("+")) return { dial: "", rest: v };
  const dials = [...new Set(COUNTRIES.map((c) => c.dial))].sort((a, b) => b.length - a.length);
  const hit = dials.find((d) => v.startsWith(d));
  return hit ? { dial: hit, rest: v.slice(hit.length).trim() } : { dial: "", rest: v };
}

export function joinPhone(dial: string, rest: string): string {
  const n = (rest ?? "").replace(/^0+/, "").trim();
  if (!n) return "";
  return dial ? `${dial} ${n}` : n;
}

/* -------------------------------------------------------------------------
 * Normalising what is already written down.
 *
 * The student form can only offer the lists above, but two other writers do not
 * have that luxury: staff editing a resident, and the master-list importer
 * reading whatever the spreadsheet says. A rule enforced in one place is not
 * enforced, so all three agree here.
 *
 * Each function returns the value it settled on and whether it recognised it.
 * Nothing is thrown away - an unrecognised value is kept as typed and reported,
 * because losing a real university is worse than storing an untidy one.
 * ---------------------------------------------------------------------- */

export type Normalised = { value: string; matched: boolean };

const keep = (v: string): Normalised => ({ value: v.trim(), matched: false });
const hit = (v: string): Normalised => ({ value: v, matched: true });

/** Spellings seen in the master list and in enquiries, mapped to the code. */
const UNIVERSITY_ALIASES: Record<string, string> = {
  mmu: "MMU",
  "multimedia university": "MMU",
  hwum: "HWUM",
  hw: "HWUM",
  "heriot watt": "HWUM",
  "heriot-watt": "HWUM",
  "heriot watt university malaysia": "HWUM",
  "heriot-watt university malaysia": "HWUM",
  ctu: "CTU",
  cityu: "CTU",
  "city university": "CTU",
  "city university malaysia": "CTU",
  uoc: "UOC",
  "university of cyberjaya": "UOC",
  um: "UM",
  "universiti malaya": "UM",
  "university of malaya": "UM",
  mitra: "MITRA",
};

export function normUniversity(raw: string): Normalised {
  const v = (raw ?? "").trim();
  if (!v || /^(n\/a|na|-)$/i.test(v)) return { value: "", matched: true };
  const key = v.toLowerCase().replace(/\s+/g, " ");
  const code = UNIVERSITY_ALIASES[key];
  if (code) return hit(code);
  if (UNIVERSITY_OPTIONS.some((o) => o.value === v.toUpperCase())) return hit(v.toUpperCase());
  return keep(v);
}

/** Accepts the ISO-3 code the sheet uses, a country name, or a 2-letter code. */
const COUNTRY_ALIASES: Record<string, string> = {
  malaysian: "MYS",
  my: "MYS",
  chinese: "CHN",
  cn: "CHN",
  indian: "IND",
  in: "IND",
  french: "FRA",
  fr: "FRA",
  indonesian: "IDN",
  id: "IDN",
  pakistani: "PAK",
  pk: "PAK",
  japanese: "JPN",
  jp: "JPN",
  burmese: "MMR",
  mm: "MMR",
  bangladeshi: "BGD",
  bd: "BGD",
  nigerian: "NGA",
  ng: "NGA",
  german: "DEU",
  de: "DEU",
  // a non-standard code the sheet uses for Germany
  ger: "DEU",
  kenyan: "KEN",
  ke: "KEN",
  british: "GBR",
  uk: "GBR",
  gb: "GBR",
  american: "USA",
  us: "USA",
};

export function normCountry(raw: string): Normalised {
  const v = (raw ?? "").trim();
  if (!v || /^(n\/a|na|-)$/i.test(v)) return { value: "", matched: true };
  const upper = v.toUpperCase();
  if (COUNTRIES.some((c) => c.code === upper)) return hit(upper);
  const byName = COUNTRIES.find((c) => c.name.toLowerCase() === v.toLowerCase());
  if (byName) return hit(byName.code);
  const alias = COUNTRY_ALIASES[v.toLowerCase()];
  if (alias) return hit(alias);
  return keep(v);
}

export function normGender(raw: string): Normalised {
  const v = (raw ?? "").trim();
  if (!v) return { value: "", matched: true };
  const c = v.charAt(0).toUpperCase();
  if (c === "M") return hit("Male");
  if (c === "F") return hit("Female");
  return keep(v);
}

/** Matches a fixed list on its first letters, so "Undergrad" finds
 *  "Undergraduate" and "PhD" is mapped by alias. */
function normFromList(raw: string, options: { value: string }[], aliases: Record<string, string>) {
  const v = (raw ?? "").trim();
  if (!v) return { value: "", matched: true };
  const lower = v.toLowerCase();
  const alias = aliases[lower];
  if (alias) return hit(alias);
  const exact = options.find((o) => o.value.toLowerCase() === lower);
  if (exact) return hit(exact.value);
  const starts = options.find((o) => o.value.toLowerCase().startsWith(lower) && lower.length >= 3);
  if (starts) return hit(starts.value);
  return keep(v);
}

export function normLevel(raw: string): Normalised {
  return normFromList(raw, LEVEL_OPTIONS, {
    phd: "Doctorate",
    "ph.d": "Doctorate",
    doctoral: "Doctorate",
    masters: "Master",
    "master's": "Master",
    msc: "Master",
    degree: "Undergraduate",
    bachelor: "Undergraduate",
    bachelors: "Undergraduate",
    undergrad: "Undergraduate",
    dip: "Diploma",
    found: "Foundation",
  });
}

export function normMarital(raw: string): Normalised {
  return normFromList(raw, MARITAL_OPTIONS, { widow: "Widowed", widower: "Widowed" });
}

export function normRelationship(raw: string): Normalised {
  return normFromList(raw, RELATIONSHIP_OPTIONS, {
    father: "Parent",
    mother: "Parent",
    dad: "Parent",
    mum: "Parent",
    mom: "Parent",
    parents: "Parent",
    myself: "Self",
    "self-funded": "Self",
  });
}
