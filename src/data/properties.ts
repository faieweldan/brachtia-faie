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

export type Room = {
  id: string;
  propertySlug: string;
  unitId: string;
  unitLabel: string;
  unitType: string;
  block: string;
  floor: string;
  gender: "Female" | "Male";
  roomLabel: string;
  roomName: string;
  sizeLabel?: string;
  occupancy: Occupancy;
  rentLong: number;
  rentShort?: number;
  availableFrom: string;
  status: RoomStatus;
  bedsLeft?: number;
  image: string;
  highlights: string[];
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
  facilities: string[];
  nearby: string[];
  included: string[];
  excluded: string[];
  terms: string[];
  contractTerms: ContractTerm[];
  paymentCycle: string;
  feeConfig: Record<ContractTerm, FeeConfig>;
  pricing: Record<ContractTerm, PricingTable[]>;
  wazeUrl: string;
};

const nearbyCyberjaya = [
  "7–15 min walk to KFC, McDonald's, convenience shops & pharmacy",
  "Tamarind Square & D'Pulze Mall in Cyberjaya",
  "IOI City Mall & Alamanda in Putrajaya",
  "24-hour clinic and hospital nearby",
  "2 recreation parks and Splash Mania water theme park",
  "3 min walk to bus stop (MRT feeder bus & free university shuttle)",
  "Rapid on Demand mini van around Cyberjaya & to Putrajaya Sentral",
  "2 MRT Cyberjaya stations & KL Transit (ERL) at Putrajaya",
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
    facilities: [
      "Swimming pool",
      "Gym",
      "Squash court",
      "Arc Cafe",
      "Mini mart & barber shop",
      "Self-service laundry",
      "Vending machines (water/snacks)",
      "Prayer room",
      "24/7 security guards",
      "Access card entry to designated blocks & floors",
      "CCTV monitoring of carpark, corridors, lifts & surroundings",
    ],
    nearby: nearbyCyberjaya,
    included: [
      "Free Wi-Fi in all units",
      "Monthly cleaning of bathrooms and common areas",
      "Fully furnished unit & fully equipped kitchen",
      "Technical support (response within 24–48 hours)",
      "Student support & warden service 24/7",
    ],
    excluded: ["Water charges", "Electricity charges"],
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
          unitType: "3 Rooms, 2 Baths",
          blocks: "Block A, B, C & D",
          rows: [
            { roomType: "Room A", note: "Master room with en-suite bath", single: 1050, twin: 550 },
            { roomType: "Room B", note: 'With view (10" x 10.5")', single: 850, twin: 450 },
            { roomType: "Room C", note: 'Facing yard (10" x 9")', single: 750, twin: 400 },
          ],
        },
        {
          unitType: "4 Rooms, 2 Common Baths",
          blocks: "Block A & B",
          rows: [
            { roomType: "Room A", note: "With view", single: 800, twin: 450 },
            { roomType: "Room B", note: "With view", single: 800, twin: 450 },
            { roomType: "Room C", note: "Facing yard", single: 700, twin: 400 },
            { roomType: "Room D", note: "With view", single: 800, twin: 450 },
          ],
        },
      ],
      short: [
        {
          unitType: "3 Rooms, 2 Baths",
          blocks: "Block A, B, C & D",
          rows: [
            { roomType: "Room A", note: "Master room with en-suite bath", single: 1200, twin: 650 },
            { roomType: "Room B", note: 'With view (10" x 10.5")', single: 950, twin: 550 },
            { roomType: "Room C", note: 'Facing yard (10" x 9")', single: 850, twin: 500 },
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
    facilities: [
      "Swimming pool",
      "Gym",
      "Cafe",
      "Mini mart",
      "Self-service laundry",
      "Prayer room",
      "24/7 security guards",
      "Access card entry to designated blocks & floors",
      "CCTV monitoring of carpark, corridors, lifts & surroundings",
    ],
    nearby: nearbyCyberjaya,
    included: [
      "Fully furnished apartment",
      "Technical support",
      "Student support 24/7",
    ],
    excluded: [
      "Wi-Fi (RM105 per month)",
      "Cleaning service (RM150 upon request)",
      "Water, electricity & sewerage charges",
    ],
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

export const rooms: Room[] = [
  // The Arc — Unit A-12-3 (3 rooms, 2 baths, female)
  {
    id: "arc-a1203-a",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-a-12-03",
    unitLabel: "Unit A-12-03",
    unitType: "3 Rooms, 2 Baths",
    block: "Block A",
    floor: "Level 12",
    gender: "Female",
    roomLabel: "Room A",
    roomName: "Master room with en-suite bath",
    occupancy: "single",
    rentLong: 1050,
    rentShort: 1200,
    availableFrom: "2026-09-01",
    status: "available",
    image: roomSingle,
    highlights: ["En-suite bathroom", "Air-conditioned", "Study desk & wardrobe"],
  },
  {
    id: "arc-a1203-b",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-a-12-03",
    unitLabel: "Unit A-12-03",
    unitType: "3 Rooms, 2 Baths",
    block: "Block A",
    floor: "Level 12",
    gender: "Female",
    roomLabel: "Room B",
    roomName: "Room with view",
    sizeLabel: '10" x 10.5"',
    occupancy: "twin",
    rentLong: 450,
    rentShort: 550,
    availableFrom: "2026-08-15",
    status: "limited",
    bedsLeft: 1,
    image: roomTwin,
    highlights: ["Twin sharing", "City view", "Two study desks"],
  },
  {
    id: "arc-a1203-c",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-a-12-03",
    unitLabel: "Unit A-12-03",
    unitType: "3 Rooms, 2 Baths",
    block: "Block A",
    floor: "Level 12",
    gender: "Female",
    roomLabel: "Room C",
    roomName: "Room facing yard",
    sizeLabel: '10" x 9"',
    occupancy: "single",
    rentLong: 750,
    rentShort: 850,
    availableFrom: "2026-10-01",
    status: "available",
    image: roomSingle,
    highlights: ["Quiet yard-facing", "Air-conditioned", "Shared bathroom"],
  },
  // The Arc — Unit B-08-11 (4 rooms, 2 common baths, male)
  {
    id: "arc-b0811-a",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-b-08-11",
    unitLabel: "Unit B-08-11",
    unitType: "4 Rooms, 2 Common Baths",
    block: "Block B",
    floor: "Level 8",
    gender: "Male",
    roomLabel: "Room A",
    roomName: "Room with view",
    occupancy: "single",
    rentLong: 800,
    availableFrom: "2026-09-01",
    status: "available",
    image: roomSingle,
    highlights: ["With view", "Air-conditioned", "Shared common baths"],
  },
  {
    id: "arc-b0811-b",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-b-08-11",
    unitLabel: "Unit B-08-11",
    unitType: "4 Rooms, 2 Common Baths",
    block: "Block B",
    floor: "Level 8",
    gender: "Male",
    roomLabel: "Room B",
    roomName: "Room with view",
    occupancy: "twin",
    rentLong: 450,
    availableFrom: "2026-09-01",
    status: "available",
    bedsLeft: 2,
    image: roomTwin,
    highlights: ["Twin sharing", "With view", "Best value at The Arc"],
  },
  {
    id: "arc-b0811-c",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-b-08-11",
    unitLabel: "Unit B-08-11",
    unitType: "4 Rooms, 2 Common Baths",
    block: "Block B",
    floor: "Level 8",
    gender: "Male",
    roomLabel: "Room C",
    roomName: "Room facing yard",
    occupancy: "single",
    rentLong: 700,
    availableFrom: "2026-11-01",
    status: "available",
    image: roomSingle,
    highlights: ["Quiet yard-facing", "Air-conditioned", "Wardrobe & desk"],
  },
  {
    id: "arc-b0811-d",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-b-08-11",
    unitLabel: "Unit B-08-11",
    unitType: "4 Rooms, 2 Common Baths",
    block: "Block B",
    floor: "Level 8",
    gender: "Male",
    roomLabel: "Room D",
    roomName: "Room with view",
    occupancy: "single",
    rentLong: 800,
    availableFrom: "2026-07-01",
    status: "occupied",
    image: roomSingle,
    highlights: ["With view", "Air-conditioned"],
  },
  // The Arc — Unit C-05-07 (3 rooms, 2 baths, female)
  {
    id: "arc-c0507-a",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-c-05-07",
    unitLabel: "Unit C-05-07",
    unitType: "3 Rooms, 2 Baths",
    block: "Block C",
    floor: "Level 5",
    gender: "Female",
    roomLabel: "Room A",
    roomName: "Master room with en-suite bath",
    occupancy: "twin",
    rentLong: 550,
    rentShort: 650,
    availableFrom: "2026-08-20",
    status: "limited",
    bedsLeft: 1,
    image: roomTwin,
    highlights: ["Twin sharing in master room", "En-suite bathroom", "Short-term available"],
  },
  {
    id: "arc-c0507-b",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-c-05-07",
    unitLabel: "Unit C-05-07",
    unitType: "3 Rooms, 2 Baths",
    block: "Block C",
    floor: "Level 5",
    gender: "Female",
    roomLabel: "Room B",
    roomName: "Room with view",
    sizeLabel: '10" x 10.5"',
    occupancy: "single",
    rentLong: 850,
    rentShort: 950,
    availableFrom: "2026-09-15",
    status: "available",
    image: roomSingle,
    highlights: ["With view", "Short-term available", "Air-conditioned"],
  },
  {
    id: "arc-c0507-c",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-c-05-07",
    unitLabel: "Unit C-05-07",
    unitType: "3 Rooms, 2 Baths",
    block: "Block C",
    floor: "Level 5",
    gender: "Female",
    roomLabel: "Room C",
    roomName: "Room facing yard",
    sizeLabel: '10" x 9"',
    occupancy: "twin",
    rentLong: 400,
    rentShort: 500,
    availableFrom: "2026-09-01",
    status: "available",
    bedsLeft: 2,
    image: roomTwin,
    highlights: ["Most affordable option", "Twin sharing", "Short-term available"],
  },
  // The Arc — Unit D-15-02 (3 rooms, 2 baths, male)
  {
    id: "arc-d1502-a",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-d-15-02",
    unitLabel: "Unit D-15-02",
    unitType: "3 Rooms, 2 Baths",
    block: "Block D",
    floor: "Level 15",
    gender: "Male",
    roomLabel: "Room A",
    roomName: "Master room with en-suite bath",
    occupancy: "single",
    rentLong: 1050,
    rentShort: 1200,
    availableFrom: "2026-08-01",
    status: "available",
    image: roomSingle,
    highlights: ["High floor", "En-suite bathroom", "Short-term available"],
  },
  {
    id: "arc-d1502-b",
    propertySlug: "the-arc-cyberjaya",
    unitId: "arc-d-15-02",
    unitLabel: "Unit D-15-02",
    unitType: "3 Rooms, 2 Baths",
    block: "Block D",
    floor: "Level 15",
    gender: "Male",
    roomLabel: "Room B",
    roomName: "Room with view",
    sizeLabel: '10" x 10.5"',
    occupancy: "twin",
    rentLong: 450,
    rentShort: 550,
    availableFrom: "2026-12-01",
    status: "occupied",
    image: roomTwin,
    highlights: ["Twin sharing", "High floor view"],
  },
  // Solstice
  {
    id: "solstice-1103",
    propertySlug: "solstice-residence-cyberjaya",
    unitId: "sol-11-03",
    unitLabel: "Unit 11-03",
    unitType: "1 Bedroom Apartment",
    block: "Tower A",
    floor: "Level 11",
    gender: "Female",
    roomLabel: "Whole apartment",
    roomName: "1 bedroom with attached bath",
    occupancy: "single",
    rentLong: 1400,
    availableFrom: "2026-09-01",
    status: "available",
    image: solsticeStudio,
    highlights: ["Private apartment", "Queen bed", "Attached bathroom"],
  },
  {
    id: "solstice-0708",
    propertySlug: "solstice-residence-cyberjaya",
    unitId: "sol-07-08",
    unitLabel: "Unit 07-08",
    unitType: "1 Bedroom Apartment",
    block: "Tower A",
    floor: "Level 7",
    gender: "Male",
    roomLabel: "Whole apartment",
    roomName: "1 bedroom with attached bath",
    occupancy: "single",
    rentLong: 1400,
    availableFrom: "2026-10-15",
    status: "available",
    image: solsticeStudio,
    highlights: ["Private apartment", "Queen bed", "Study nook"],
  },
];

export function getProperty(slug: string) {
  return properties.find((p) => p.slug === slug);
}

export function getRoomsForProperty(slug: string) {
  return rooms.filter((r) => r.propertySlug === slug);
}

export function getRoom(slug: string, roomId: string) {
  return rooms.find((r) => r.propertySlug === slug && r.id === roomId);
}

export function priceFrom(slug: string) {
  const list = getRoomsForProperty(slug).filter((r) => r.status !== "occupied");
  return list.length ? Math.min(...list.map((r) => r.rentLong)) : 0;
}

export function availableCount(slug: string) {
  return getRoomsForProperty(slug).filter((r) => r.status !== "occupied").length;
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
