import arcExterior from "@/assets/arc-exterior.jpg";
import arcPool from "@/assets/arc-pool.jpg";
import roomTwin from "@/assets/room-twin.jpg";
import roomSingle from "@/assets/room-single.jpg";
import livingDining from "@/assets/living-dining.jpg";
import kitchen from "@/assets/kitchen.jpg";
import solsticeExterior from "@/assets/solstice-exterior.jpg";
import solsticeStudio from "@/assets/solstice-studio.jpg";

export type Occupancy = "single" | "twin";
export type ContractTerm = "long" | "short";
export type RoomStatus = "available" | "limited" | "occupied";

export type FeeConfig = {
  /** Months of rent payable in advance */
  advanceMonths: number;
  /** Months of rent held as refundable utilities deposit */
  utilitiesMonths: number;
  /** Months of rent held as refundable security deposit */
  securityMonths: number;
  accessCardDeposit: number;
  accessCardCharge: number;
  /** One-time admin / agreement charges */
  adminFee: number;
};

export type PricingRow = {
  roomType: string;
  note?: string;
  single: number | null;
  twin: number | null;
};

export type PricingTable = {
  unitType: string;
  blocks?: string;
  rows: PricingRow[];
};

export type BathroomType = "ensuite" | "shared";

export type RoomType = {
  id: string;
  propertySlug: string;
  /** Operational tag used by admin, e.g. "Room A" */
  tag: string;
  /** Admin room_code, e.g. "A" */
  roomCode: string;
  name: string;
  unitType: string;
  description: string;

  sizeSqft?: number;
  sizeLabel?: string;
  bathroom: BathroomType;
  hasView: boolean;
  viewType?: string;
  publicVisible: boolean;
  image: string;
  gallery: string[];
  features: string[];
  occupancies: Occupancy[];
  /** Monthly rent per person by contract term and occupancy */
  rent: Record<ContractTerm, Record<Occupancy, number | null>>;
  availableFrom: string;
  status: RoomStatus;
  spotsLeft?: number;
};


export type PlaceNearby = {
  name: string;
  distance: string;
  walk: string;
  bike: string;
  transit: string;
};

export type Property = {
  id: string;
  slug: string;
  name: string;
  location: string;
  tagline: string;
  summary: string;
  description: string[];
  heroImage: string;
  gallery: { src: string; caption: string }[];
  buildingFacilities: string[];
  includedInStay: string[];
  utilitiesNote: string;
  insideApartment: string[];
  apartmentFootnote?: string;
  coords: { lat: number; lng: number };
  nearbyUniversities: PlaceNearby[];
  pointsOfInterest: PlaceNearby[];
  terms: string[];
  contractTerms: ContractTerm[];
  paymentCycle: string;
  feeConfig: Record<ContractTerm, FeeConfig>;
  pricing: Record<ContractTerm, PricingTable[]>;
  wazeUrl: string;
};

const universitiesCyberjaya: PlaceNearby[] = [
  { name: "Multimedia University (MMU)", distance: "0.9 km", walk: "12 min", bike: "4 min", transit: "5 min" },
  { name: "Heriot-Watt University Malaysia", distance: "2.1 km", walk: "26 min", bike: "8 min", transit: "9 min" },
  { name: "University of Cyberjaya", distance: "2.6 km", walk: "32 min", bike: "10 min", transit: "11 min" },
  { name: "Limkokwing University", distance: "3.4 km", walk: "42 min", bike: "13 min", transit: "14 min" },
];

const poiCyberjaya: PlaceNearby[] = [
  { name: "D'Pulze Shopping Centre", distance: "1.2 km", walk: "15 min", bike: "5 min", transit: "6 min" },
  { name: "Tamarind Square", distance: "1.6 km", walk: "20 min", bike: "6 min", transit: "7 min" },
  { name: "MRT Cyberjaya City Centre", distance: "2.0 km", walk: "25 min", bike: "8 min", transit: "8 min" },
  { name: "24-hour clinic & hospital", distance: "1.4 km", walk: "18 min", bike: "6 min", transit: "6 min" },
  { name: "Convenience shops & pharmacy", distance: "0.6 km", walk: "8 min", bike: "3 min", transit: "4 min" },
  { name: "Cyberjaya Recreation Park", distance: "1.8 km", walk: "22 min", bike: "7 min", transit: "8 min" },
];


export const properties: Property[] = [
  {
    id: "the-arc",
    slug: "the-arc-cyberjaya",
    name: "The Arc, Cyberjaya",
    location: "Cyberjaya, Selangor",
    tagline: "Shared student units with free Wi-Fi and monthly cleaning",
    summary:
      "Fully furnished 3 and 4 bedroom student units with free Wi-Fi, monthly cleaning and 24/7 warden support.",
    description: [
      "The Arc is our flagship off-campus student residence in Cyberjaya, minutes from the main university campuses and a 3 minute walk to the bus stop for the MRT feeder and free university shuttle.",
      "Units are fully furnished with a shared living and dining area and a fully equipped kitchen. Choose a single room for your own space, or twin sharing to keep costs low. Every unit is gender-segregated, halal and non-smoking.",
    ],
    heroImage: arcExterior,
    gallery: [
      { src: arcPool, caption: "Swimming pool" },
      { src: livingDining, caption: "Living & dining area" },
      { src: roomTwin, caption: "Twin-share room" },
      { src: roomSingle, caption: "Single occupancy room" },
      { src: kitchen, caption: "Fully equipped kitchen" },
      { src: arcExterior, caption: "The Arc, Cyberjaya" },
    ],
    buildingFacilities: [
      "Swimming Pool",
      "Gym",
      "Squash Court",
      "Arc Café / Food Court",
      "Mini Mart",
      "Barber Shop",
      "Self-Service Laundry",
      "Vending Machines",
      "Prayer Room",
      "24/7 Security & Controlled Access",
      "Car park",
    ],
    includedInStay: [
      "Free Wi-Fi",
      "Monthly Common Area Cleaning",
      "24/7 Student & Warden Support",
      "Maintenance Support",
    ],
    utilitiesNote: "Utilities: Water and electricity are billed separately based on usage.",
    insideApartment: [
      "Fully Furnished",
      "Single-Size Bed",
      "Study Desk & Chair",
      "Wardrobe",
      "Air Conditioning & Fan",
      "Equipped Kitchen",
      "Refrigerator",
      "Dining Table & Chairs",
      "Living Area with Sofa & Coffee Table",
      "Washing Machine",
    ],
    apartmentFootnote: "Where available.",
    coords: { lat: 2.9213, lng: 101.6559 },
    nearbyUniversities: universitiesCyberjaya,
    pointsOfInterest: poiCyberjaya,
    terms: [
      "Minimum tenancy of 12 months, or short-term below 6 months",
      "Rental payable bi-monthly",
      "Halal, non-smoking and gender-segregated units (no unisex)",
      "Optional room cleaning at RM30 per session",
      "Annual air-conditioning service at RM120",
      "Room or unit changes permitted anytime with an RM100 administrative fee",
    ],
    contractTerms: ["long", "short"],
    paymentCycle: "Rental payable bi-monthly",
    feeConfig: {
      long: {
        advanceMonths: 2,
        utilitiesMonths: 0.5,
        securityMonths: 2,
        accessCardDeposit: 50,
        accessCardCharge: 20,
        adminFee: 200,
      },
      short: {
        advanceMonths: 2,
        utilitiesMonths: 0,
        securityMonths: 0.5,
        accessCardDeposit: 50,
        accessCardCharge: 20,
        adminFee: 150,
      },
    },
    pricing: {
      long: [
        {
          unitType: "3-Bedroom Apartment",
          blocks: "Block A, B, C & D",
          rows: [
            { roomType: "Room A", note: "Ensuite, with view · 105 sq ft", single: 1050, twin: 550 },
            { roomType: "Room B", note: "Standard, with view · 105 sq ft", single: 850, twin: 450 },
            { roomType: "Room C", note: "Standard small, internal facing · 90 sq ft", single: 750, twin: 400 },
          ],
        },
        {
          unitType: "4-Bedroom Apartment",
          blocks: "Block A & B",
          rows: [
            { roomType: "Room A", note: "Standard, with view · 105 sq ft", single: 800, twin: 450 },
            { roomType: "Room B", note: "Standard, with view · 105 sq ft", single: 800, twin: 450 },
            { roomType: "Room C", note: "Standard small, internal facing · 90 sq ft", single: 700, twin: 400 },
            { roomType: "Room D", note: "Standard small, with view · 90 sq ft", single: 800, twin: 450 },
          ],
        },
      ],
      short: [
        {
          unitType: "3-Bedroom Apartment",
          blocks: "Block A, B, C & D · short-term available in 3-bedroom units only",
          rows: [
            { roomType: "Room A", note: "Ensuite, with view · 105 sq ft", single: 1200, twin: 650 },
            { roomType: "Room B", note: "Standard, with view · 105 sq ft", single: 950, twin: 550 },
            { roomType: "Room C", note: "Standard small, internal facing · 90 sq ft", single: 850, twin: 500 },
          ],
        },
      ],

    },
    wazeUrl: "https://waze.com/ul?q=The%20Arc%20Cyberjaya",
  },
  {
    id: "solstice",
    slug: "solstice-residence-cyberjaya",
    name: "Solstice Residence, Cyberjaya",
    location: "Cyberjaya, Selangor",
    tagline: "Private one-bedroom apartments for students who want their own space",
    summary:
      "Fully furnished private 1-bedroom apartments with an attached bathroom, ideal for postgraduate and senior students.",
    description: [
      "Solstice Residence offers fully furnished private one-bedroom apartments with an attached bathroom — your own front door, kitchen and study space in the heart of Cyberjaya.",
      "It suits students who prefer complete privacy while staying close to campus, transport and the same 24/7 Brachtia Homes student support.",
    ],
    heroImage: solsticeExterior,
    gallery: [
      { src: solsticeStudio, caption: "1-bedroom apartment" },
      { src: livingDining, caption: "Living & dining area" },
      { src: kitchen, caption: "Kitchenette" },
      { src: solsticeExterior, caption: "Solstice Residence" },
    ],
    buildingFacilities: [
      "Swimming Pool",
      "Gym",
      "Café",
      "Mini Mart",
      "Self-Service Laundry",
      "Prayer Room",
      "24/7 Security & Controlled Access",
      "Car park",
    ],
    includedInStay: [
      "Fully Furnished Apartment",
      "Free Wi-Fi",
      "24/7 Student Support",
      "Maintenance Support",
    ],
    utilitiesNote: "Utilities: Water and electricity are billed separately based on usage.",
    insideApartment: [
      "Fully Furnished",
      "Queen Bed",
      "Study Desk & Chair",
      "Wardrobe",
      "Air Conditioning & Fan",
      "Equipped Kitchen",
      "Refrigerator",
      "Dining Table & Chairs",
      "Living Area with Sofa & Coffee Table",
      "Washing Machine",
    ],
    apartmentFootnote: "Where available.",
    coords: { lat: 2.9285, lng: 101.6432 },
    nearbyUniversities: universitiesCyberjaya,
    pointsOfInterest: poiCyberjaya,
    terms: [
      "Minimum tenancy of 12 months",
      "Rental payable monthly",
      "Halal, non-smoking and gender-segregated units (no unisex)",
    ],
    contractTerms: ["long"],
    paymentCycle: "Rental payable monthly",
    feeConfig: {
      long: {
        advanceMonths: 2,
        utilitiesMonths: 1,
        securityMonths: 2,
        accessCardDeposit: 50,
        accessCardCharge: 0,
        adminFee: 350,
      },
      short: {
        advanceMonths: 2,
        utilitiesMonths: 0,
        securityMonths: 0.5,
        accessCardDeposit: 50,
        accessCardCharge: 0,
        adminFee: 350,
      },
    },
    pricing: {
      long: [
        {
          unitType: "1 Bedroom Apartment with attached bath",
          rows: [
            { roomType: "Whole apartment", note: "Single occupancy, queen bed", single: 1400, twin: null },
          ],
        },
      ],
      short: [],
    },
    wazeUrl: "https://waze.com/ul?q=Solstice%20Residence%20Cyberjaya",
  },
];

export const roomTypes: RoomType[] = [
  {
    id: "arc-3br-a",
    tag: "Room A",
    roomCode: "A",
    propertySlug: "the-arc-cyberjaya",
    name: "Room A – Ensuite (with View)",
    unitType: "3-Bedroom Apartment",
    description:
      "The largest room in the unit with its own private ensuite bathroom, wardrobe and study desk, plus an exterior view. Ideal if you want privacy without leaving the shared-unit community.",
    sizeSqft: 105,
    sizeLabel: "105 sq ft",
    bathroom: "ensuite",
    hasView: true,
    viewType: "Exterior",
    publicVisible: true,
    image: roomSingle,
    gallery: [roomSingle, livingDining, kitchen, arcPool],
    features: ["Private ensuite bathroom", "Air-conditioned", "Study desk & wardrobe", "Shared living, dining & kitchen"],
    occupancies: ["single", "twin"],
    rent: { long: { single: 1050, twin: 550 }, short: { single: 1200, twin: 650 } },
    availableFrom: "2026-09-01",
    status: "available",
  },
  {
    id: "arc-3br-b",
    tag: "Room B",
    roomCode: "B",
    propertySlug: "the-arc-cyberjaya",
    name: "Room B – Standard (with View)",
    unitType: "3-Bedroom Apartment",
    description:
      "A bright standard room with an exterior view, sharing two bathrooms with the rest of the unit. Available as single occupancy or twin sharing for the best value.",
    sizeSqft: 105,
    sizeLabel: "105 sq ft",
    bathroom: "shared",
    hasView: true,
    viewType: "Exterior",
    publicVisible: true,
    image: roomTwin,
    gallery: [roomTwin, livingDining, kitchen, arcPool],
    features: ["Exterior view", "Air-conditioned", "Study desk & wardrobe", "Shared bathroom"],
    occupancies: ["single", "twin"],
    rent: { long: { single: 850, twin: 450 }, short: { single: 950, twin: 550 } },
    availableFrom: "2026-08-15",
    status: "limited",
    spotsLeft: 2,
  },
  {
    id: "arc-3br-c",
    tag: "Room C",
    roomCode: "C",
    propertySlug: "the-arc-cyberjaya",
    name: "Room C – Standard Small",
    unitType: "3-Bedroom Apartment",
    description:
      "A quiet, well-priced internal-facing room — a favourite with students who study late. Shares two bathrooms with the rest of the unit.",
    sizeSqft: 90,
    sizeLabel: "90 sq ft",
    bathroom: "shared",
    hasView: false,
    viewType: "Internal facing",
    publicVisible: true,
    image: roomSingle,
    gallery: [roomSingle, livingDining, kitchen],
    features: ["Quiet internal facing", "Air-conditioned", "Study desk & wardrobe", "Shared bathroom"],
    occupancies: ["single", "twin"],
    rent: { long: { single: 750, twin: 400 }, short: { single: 850, twin: 500 } },
    availableFrom: "2026-10-01",
    status: "available",
  },
  {
    id: "arc-4br-a",
    tag: "Room A",
    roomCode: "A",
    propertySlug: "the-arc-cyberjaya",
    name: "Room A – Standard (with View)",
    unitType: "4-Bedroom Apartment",
    description:
      "A standard room with an exterior view in our larger four-bedroom units, sharing two common bathrooms and a big living and dining area with three other students.",
    sizeSqft: 105,
    sizeLabel: "105 sq ft",
    bathroom: "shared",
    hasView: true,
    viewType: "Exterior",
    publicVisible: true,
    image: roomSingle,
    gallery: [roomSingle, kitchen, livingDining],
    features: ["Exterior view", "Air-conditioned", "Study desk & wardrobe", "Two common bathrooms"],
    occupancies: ["single", "twin"],
    rent: { long: { single: 800, twin: 450 }, short: { single: null, twin: null } },
    availableFrom: "2026-09-01",
    status: "available",
  },
  {
    id: "arc-4br-b",
    tag: "Room B",
    roomCode: "B",
    propertySlug: "the-arc-cyberjaya",
    name: "Room B – Standard (with View)",
    unitType: "4-Bedroom Apartment",
    description:
      "A standard room with an exterior view and its own layout, sharing two common bathrooms with three other students in a four-bedroom unit.",
    sizeSqft: 105,
    sizeLabel: "105 sq ft",
    bathroom: "shared",
    hasView: true,
    viewType: "Exterior",
    publicVisible: true,
    image: roomTwin,
    gallery: [roomTwin, kitchen, livingDining],
    features: ["Exterior view", "Air-conditioned", "Study desk & wardrobe", "Two common bathrooms"],
    occupancies: ["single", "twin"],
    rent: { long: { single: 800, twin: 450 }, short: { single: null, twin: null } },
    availableFrom: "2026-09-01",
    status: "available",
  },
  {
    id: "arc-4br-c",
    tag: "Room C",
    roomCode: "C",
    propertySlug: "the-arc-cyberjaya",
    name: "Room C – Standard Small",
    unitType: "4-Bedroom Apartment",
    description:
      "The most affordable room at The Arc — quiet, internal-facing and fully furnished, in a four-bedroom shared unit.",
    sizeSqft: 90,
    sizeLabel: "90 sq ft",
    bathroom: "shared",
    hasView: false,
    viewType: "Internal facing",
    publicVisible: true,
    image: roomTwin,
    gallery: [roomTwin, kitchen, livingDining],
    features: ["Best value", "Air-conditioned", "Study desk & wardrobe", "Two common bathrooms"],
    occupancies: ["single", "twin"],
    rent: { long: { single: 700, twin: 400 }, short: { single: null, twin: null } },
    availableFrom: "2026-11-01",
    status: "available",
  },
  {
    id: "arc-4br-d",
    tag: "Room D",
    roomCode: "D",
    propertySlug: "the-arc-cyberjaya",
    name: "Room D – Standard Small (with View)",
    unitType: "4-Bedroom Apartment",
    description:
      "A compact room with an exterior view in a four-bedroom unit — well priced, fully furnished and sharing two common bathrooms.",
    sizeSqft: 90,
    sizeLabel: "90 sq ft",
    bathroom: "shared",
    hasView: true,
    viewType: "Exterior",
    publicVisible: true,
    image: roomSingle,
    gallery: [roomSingle, livingDining, kitchen],
    features: ["Exterior view", "Air-conditioned", "Study desk & wardrobe", "Two common bathrooms"],
    occupancies: ["single", "twin"],
    rent: { long: { single: 800, twin: 450 }, short: { single: null, twin: null } },
    availableFrom: "2026-10-01",
    status: "available",
  },
  {
    id: "solstice-one-bedroom",
    tag: "Room A",
    roomCode: "A",
    propertySlug: "solstice-residence-cyberjaya",
    name: "Private 1-Bedroom Apartment",
    unitType: "1 Bedroom Apartment with attached bath",
    description:
      "Your own front door: a fully furnished one-bedroom apartment with attached bathroom, kitchenette, living area and queen bed — complete privacy with 24/7 student support.",
    bathroom: "ensuite",
    hasView: true,
    viewType: "Exterior",
    publicVisible: true,
    image: solsticeStudio,
    gallery: [solsticeStudio, livingDining, kitchen, solsticeExterior],
    features: ["Entire apartment to yourself", "Attached bathroom", "Kitchenette", "Queen bed & study nook"],
    occupancies: ["single"],
    rent: { long: { single: 1400, twin: null }, short: { single: null, twin: null } },
    availableFrom: "2026-09-01",
    status: "available",
  },
];


export function getProperty(slug: string) {
  return properties.find((p) => p.slug === slug);
}

export function getRoomTypes(slug: string) {
  return roomTypes.filter((r) => r.propertySlug === slug && r.publicVisible);
}

export type RoomFilterState = {
  unit: string;
  bath: string;
  view: string;
};

export function filterRoomTypes(rooms: RoomType[], f: Partial<RoomFilterState>) {
  return rooms.filter((r) => {
    if (f.unit && f.unit !== "all" && r.unitType !== f.unit) return false;
    if (f.bath && f.bath !== "all" && r.bathroom !== f.bath) return false;
    if (f.view === "view" && !r.hasView) return false;
    return true;
  });
}

export function unitTypesFor(slug: string) {
  return Array.from(new Set(getRoomTypes(slug).map((r) => r.unitType)));
}


export function getRoomType(slug: string, typeId: string) {
  return roomTypes.find((r) => r.propertySlug === slug && r.id === typeId);
}

export function rentFor(room: RoomType, term: ContractTerm, occupancy: Occupancy) {
  return room.rent[term][occupancy];
}

export function termsFor(room: RoomType, property: Property): ContractTerm[] {
  return property.contractTerms.filter((t) =>
    room.occupancies.some((o) => room.rent[t][o] != null),
  );
}

export function lowestRent(room: RoomType) {
  const values = room.occupancies
    .map((o) => room.rent.long[o])
    .filter((v): v is number => v != null);
  return values.length ? Math.min(...values) : 0;
}

export function priceFrom(slug: string) {
  const list = getRoomTypes(slug).filter((r) => r.status !== "occupied");
  const values = list.map(lowestRent).filter((v) => v > 0);
  return values.length ? Math.min(...values) : 0;
}

export function availableCount(slug: string) {
  return getRoomTypes(slug).filter((r) => r.status !== "occupied").length;
}

export type CostLine = { label: string; amount: number; kind: "advance" | "refundable" | "onetime" };

export function costBreakdown(property: Property, rent: number, term: ContractTerm) {
  const cfg = property.feeConfig[term];
  const lines: CostLine[] = [
    {
      label: `Rental in advance (${cfg.advanceMonths} months)`,
      amount: rent * cfg.advanceMonths,
      kind: "advance",
    },
  ];
  if (cfg.utilitiesMonths > 0) {
    lines.push({
      label: `Utilities deposit (${formatMonths(cfg.utilitiesMonths)})`,
      amount: rent * cfg.utilitiesMonths,
      kind: "refundable",
    });
  }
  lines.push({
    label: `Security deposit (${formatMonths(cfg.securityMonths)})`,
    amount: rent * cfg.securityMonths,
    kind: "refundable",
  });
  lines.push({ label: "Access card deposit", amount: cfg.accessCardDeposit, kind: "refundable" });
  if (cfg.accessCardCharge > 0) {
    lines.push({ label: "Access card charges", amount: cfg.accessCardCharge, kind: "onetime" });
  }
  lines.push({
    label: term === "long" ? "Admin + agreement charges" : "Admin charges",
    amount: cfg.adminFee,
    kind: "onetime",
  });
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return { lines, total };
}

function formatMonths(m: number) {
  return m === 0.5 ? "½ month" : `${m} month${m > 1 ? "s" : ""}`;
}

/* ---------------- Stay calculator (daily pro-rata) ---------------- */

export type StaySegment = {
  label: string;
  days: number;
  daysInMonth: number;
  amount: number;
  full: boolean;
};

function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function addMonths(iso: string, months: number) {
  const d = parseISO(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const dim = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), dim));
  return toISO(target);
}

/** Nights + 1, i.e. move-out date is the last day of the stay. */
export function stayDays(fromISO: string, toISOStr: string) {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISOStr).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

export function termForRange(fromISO: string, toISOStr: string): ContractTerm {
  return stayDays(fromISO, toISOStr) >= 182 ? "long" : "short";
}

/** Splits a date range into calendar months and pro-rates partial ones daily. */
export function staySchedule(fromISO: string, toISOStr: string, rent: number): StaySegment[] {
  const start = parseISO(fromISO);
  const end = parseISO(toISOStr);
  if (end.getTime() < start.getTime()) return [];

  const segments: StaySegment[] = [];
  let cursor = start;
  let guard = 0;

  while (cursor.getTime() <= end.getTime() && guard < 60) {
    guard += 1;
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(y, m, dim));
    const segEnd = monthEnd.getTime() < end.getTime() ? monthEnd : end;
    const days = Math.floor((segEnd.getTime() - cursor.getTime()) / 86400000) + 1;
    const full = days === dim;
    segments.push({
      label: cursor.toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }),
      days,
      daysInMonth: dim,
      amount: full ? rent : round2((rent / dim) * days),
      full,
    });
    cursor = new Date(Date.UTC(y, m + 1, 1));
  }

  return segments;
}

export type StayQuote = {
  term: ContractTerm;
  rent: number;
  days: number;
  months: number;
  schedule: StaySegment[];
  firstPayment: CostLine[];
  totalUpfront: number;
  totalStay: number;
  monthlyAfter: number;
};

/** Full quote: pro-rated rent schedule + deposits/fees due before move-in. */
export function stayQuote(
  property: Property,
  rent: number,
  term: ContractTerm,
  fromISO: string,
  toISOStr: string,
): StayQuote | null {
  const days = stayDays(fromISO, toISOStr);
  if (!rent || days < 1) return null;

  const schedule = staySchedule(fromISO, toISOStr, rent);
  const cfg = property.feeConfig[term];
  const first = schedule[0];
  const lines: CostLine[] = [];

  if (first) {
    lines.push({
      label: first.full
        ? `First month rent (${first.label})`
        : `First month rent — pro-rated ${first.days}/${first.daysInMonth} days`,
      amount: first.amount,
      kind: "advance",
    });
  }
  const extraAdvance = Math.max(0, cfg.advanceMonths - 1);
  if (extraAdvance > 0) {
    lines.push({
      label: `Advance rental (${formatMonths(extraAdvance)})`,
      amount: round2(rent * extraAdvance),
      kind: "advance",
    });
  }
  if (cfg.utilitiesMonths > 0) {
    lines.push({
      label: `Utilities deposit (${formatMonths(cfg.utilitiesMonths)})`,
      amount: round2(rent * cfg.utilitiesMonths),
      kind: "refundable",
    });
  }
  lines.push({
    label: `Security deposit (${formatMonths(cfg.securityMonths)})`,
    amount: round2(rent * cfg.securityMonths),
    kind: "refundable",
  });
  lines.push({ label: "Access card deposit", amount: cfg.accessCardDeposit, kind: "refundable" });
  if (cfg.accessCardCharge > 0) {
    lines.push({ label: "Access card charges", amount: cfg.accessCardCharge, kind: "onetime" });
  }
  lines.push({
    label: term === "long" ? "Admin + agreement charges" : "Admin charges",
    amount: cfg.adminFee,
    kind: "onetime",
  });

  const totalUpfront = round2(lines.reduce((s, l) => s + l.amount, 0));
  const totalStay = round2(schedule.reduce((s, seg) => s + seg.amount, 0));

  return {
    term,
    rent,
    days,
    months: round2(days / 30.44),
    schedule,
    firstPayment: lines,
    totalUpfront,
    totalStay,
    monthlyAfter: rent,
  };
}

export function formatRM(amount: number) {

  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const company = {
  name: "Brachtia Homes",
  legalName: "Brachtia Maju Resources PLT",
  registration: "202304003086 (LLP0037045-LGN)",
  tagline: "Where You Belong",
  email: "contact@brachtiahomes.com",
  phones: ["+6012-950 5670", "+6012-226 6815", "+6012-330 6815"],
  office: "+603 832 0813",
  whatsapp: "60129505670",
  address:
    "Level 15 D'Pulze, Lingkaran Cyber Point Timur, Cyber 12, 63000 Cyberjaya, Selangor",
  bookingFee: "RM500 / USD100",
};

export function whatsappUrl(message: string) {
  return `https://wa.me/${company.whatsapp}?text=${encodeURIComponent(message)}`;
}
