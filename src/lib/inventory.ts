/**
 * Schedule C - the inventory and condition record, as a checklist the resident
 * fills in on their signing page (Dani, 1 Oct 2026).
 *
 * It was a printed form: a table of every item in the unit, each ticked
 * Present, Defect or Not Provided. There is nothing to fill from a record and
 * nothing to upload - the resident walks the room and answers - so it is kept
 * here as data, and the signed copy is drawn from their answers.
 *
 * The list is the Schedule C form of 1 Oct 2026. Changing it changes what the
 * next resident is asked; a signed record keeps the items it was signed with.
 */

export type InventoryStatus = "present" | "defect" | "not_provided";

export type InventoryItem = {
  /** stable across edits to the wording, so an answer stays with its item */
  id: string;
  name: string;
  /** how many there should be - a number only; the form's "1 set" is 1 */
  qty: number;
  /**
   * The form's "Brand / Model / Serial No." column. Where it says "Brand", the
   * brand is picked from BRANDS (the list the form gives for the fridge, for
   * every "Brand" row - Dani, 1 Oct 2026); some rows list their own choices;
   * a dash in the form is no details at all. SERIAL asks for the card's
   * serial number, typed (form of 2 Oct 2026). Required either way.
   */
  details?: readonly string[] | typeof SERIAL;
};

/** The form's brand list, on the Refrigerator row; "Other" asks for the name. */
/* A to Z, "Other" last (Dani, 5 Oct 2026) */
export const BRANDS = [
  "Alpha",
  "BeeBest",
  "Daikin",
  "Electrolux",
  "Elton",
  "Joven",
  "KDK",
  "Midea",
  "Mitsubishi",
  "Panasonic",
  "Pensonic",
  "Samsung",
  "Sharp",
  "Toshiba",
  "TSL",
  "York",
  "Other",
] as const;
export const OTHER = "Other";
/** the details column asks for a number typed in, not a choice */
export const SERIAL = "serial";

export type InventoryArea = { id: string; name: string; items: InventoryItem[] };

const item = (id: string, name: string, qty = 1, details?: readonly string[] | typeof SERIAL): InventoryItem => ({ id, name, qty, ...(details ? { details } : {}) });

/* the Schedule C form of 1 Oct 2026 (references/agreement and access) */
export const INVENTORY: InventoryArea[] = [
  {
    id: "foyer",
    name: "Foyer",
    items: [item("foyer-door-bell", "Door Bell"), item("foyer-ceiling-lights", "Ceiling Lights")],
  },
  {
    id: "living",
    name: "Living Hall",
    items: [
      item("living-ceiling-lights", "Ceiling Lights"),
      item("living-ceiling-fan", "Ceiling Fan", 1, BRANDS),
      item("living-curtains", "Curtains"),
      item("living-sofa", "Sofa (3 Seater)"),
      item("living-coffee-table", "Coffee Table"),
      item("living-tv-cabinet", "TV Cabinet"),
      item("dining-wall-tv-frame", "Wall TV Frame"),
    ],
  },
  {
    id: "dining",
    name: "Dining",
    items: [
      item("dining-ceiling-lights", "Ceiling Lights"),
      item("dining-ceiling-fan", "Ceiling Fan", 1, BRANDS),
      item("dining-table", "Dining Table"),
      item("dining-chairs", "Dining Chairs", 6),
    ],
  },
  {
    id: "kitchen",
    name: "Kitchen",
    items: [
      item("kitchen-ceiling-lights", "Ceiling Lights"),
      item("kitchen-cabinet", "Kitchen Cabinet (Top & Bottom)"),
      item("kitchen-hood-hob", "Built In Cooker Hood & Hob"),
      item("kitchen-induction-cooker", "Portable Induction Cooker", 1, BRANDS),
      item("kitchen-refrigerator", "Refrigerator", 1, BRANDS),
      item("kitchen-microwave", "Microwave", 1, BRANDS),
      item("kitchen-rice-cooker", "Rice Cooker", 1, BRANDS),
      item("kitchen-kettle", "Electric Jug / Kettle", 1, BRANDS),
      item("kitchen-pot-pan", "Pot with Lid & Pan"),
      item("kitchen-induction-pot", "Induction Pot"),
      item("kitchen-dish-drainer", "Dish Drainer"),
      // the form: "4 or 6 set" - the count the resident finds is entered
      item("kitchen-cutlery", "Cutlery, Plates, Bowls & Mugs", 4),
      item("kitchen-spoon-spatula", "Cooking Spoon & Spatula"),
    ],
  },
  {
    id: "yard",
    name: "Yard",
    items: [
      item("yard-washing-machine", "Washing Machine", 1, BRANDS),
      item("yard-pail-mop", "Pail, Mop & Toilet Brush"),
      item("yard-broom", "Broom, Dustpan & Dustbin"),
      item("yard-ceiling-lights", "Ceiling Lights"),
    ],
  },
  {
    id: "room",
    name: "Room",
    items: [
      item("room-ceiling-lights", "Ceiling Lights"),
      item("room-ceiling-fan", "Ceiling Fan", 1, BRANDS),
      item("room-curtains", "Curtains"),
      item("room-aircon", "Air Conditioner + Remote", 1, BRANDS),
      item("room-bed", "Bed Frame + Mattress"),
      item("room-mattress-protector", "Mattress Protector (Jean Perry)", 1, ["Single", "Queen", "King"]),
      item("room-bedside", "Bedside Table / Drawer"),
      item("room-wardrobe", "Wardrobe", 1, ["Built In", "Movable"]),
      item("room-study", "Study Table + Chair"),
    ],
  },
  {
    id: "bath1",
    name: "Attached / Common Bathroom 1",
    items: [
      item("bath1-ceiling-lights", "Ceiling Lights"),
      item("bath1-mirror", "Wall Mirror"),
      item("bath1-water-heater", "Water Heater", 1, BRANDS),
    ],
  },
  {
    id: "bath2",
    name: "Common Bathroom 2",
    items: [
      item("bath2-ceiling-lights", "Ceiling Lights"),
      item("bath2-mirror", "Wall Mirror"),
      item("bath2-water-heater", "Water Heater", 1, BRANDS),
    ],
  },
  {
    id: "other",
    name: "Other Items",
    items: [
      item("other-grill-key", "Main Grill Key"),
      item("other-door-key", "Main Door Key"),
      item("other-room-key", "Room Door Key"),
      item("other-access-card", "Resident Access Card", 1, SERIAL),
      item("other-carpark-card", "Carpark Access Card", 1, SERIAL),
      item("other-car-sticker", "Car Sticker"),
    ],
  },
];

export const STATUS_LABEL: Record<InventoryStatus, string> = {
  present: "Present",
  defect: "Defect",
  not_provided: "Not provided",
};

/**
 * One answered item. `qty` is what the resident counted, when it differs.
 * `photos`: a defect's pictures, as storage paths - the form asks for
 * "supporting image(s)" with every defect (Dani, 1 Oct 2026).
 */
export type InventoryAnswer = { status: InventoryStatus | ""; remark: string; qty?: string; detail?: string; photos?: string[] };
/** An item the list did not name, added by the resident in that area. */
export type ExtraItem = { id: string; areaId: string; name: string; qty: string; status: InventoryStatus | ""; remark: string; photos?: string[] };

/** At most this many photos on one defect. */
export const MAX_PHOTOS = 4;
export type Meters = { keys: string; water: string; electric: string };

export type InventoryRecord = {
  answers: Record<string, InventoryAnswer>;
  extras: ExtraItem[];
  meters: Meters;
  generalRemarks: string;
};

/** Moving in is the Schedule C record; moving out is checked against it. */
export type InventoryMode = "in" | "out";
export const MODE_LABEL: Record<InventoryMode, string> = { in: "Move-in check", out: "Move-out check" };

export const emptyRecord = (): InventoryRecord => ({
  answers: {},
  extras: [],
  meters: { keys: "", water: "", electric: "" },
  generalRemarks: "",
});

export const ALL_ITEMS = INVENTORY.flatMap((a) => a.items);

/** What still stops the check being sent, and the rows it is about - in list order. */
export type InventoryGap = { label: string; rows: string[] };

/**
 * What still stops the record being submitted: every item answered, every
 * defect described (the form: "described under Remarks") and pictured, every
 * brand or serial number given, every added item named and answered. Each gap
 * names its rows, so the page can take the resident to the first one (Dani,
 * 2 Oct 2026).
 */
export function inventoryGaps(r: InventoryRecord): InventoryGap[] {
  // every row, in the order the page shows them
  const rows: { id: string; status: string; remark: string; photos: number; needsDetail: boolean; extra: boolean }[] = [];
  for (const area of INVENTORY) {
    for (const i of area.items) {
      const a = r.answers[i.id];
      const needsDetail = !!i.details && !!a?.status && a.status !== "not_provided" && (!a.detail?.trim() || a.detail === OTHER);
      rows.push({ id: i.id, status: a?.status ?? "", remark: a?.remark ?? "", photos: a?.photos?.length ?? 0, needsDetail, extra: false });
    }
    for (const e of r.extras)
      if (e.areaId === area.id && e.name.trim())
        rows.push({ id: e.id, status: e.status, remark: e.remark, photos: e.photos?.length ?? 0, needsDetail: false, extra: true });
  }
  const gap = (label: (n: number) => string, pick: (x: (typeof rows)[number]) => boolean): InventoryGap[] => {
    const hit = rows.filter(pick).map((x) => x.id);
    return hit.length ? [{ label: label(hit.length), rows: hit }] : [];
  };
  const s = (n: number) => (n === 1 ? "" : "s");
  return [
    ...gap((n) => `${n} item${s(n)} not checked yet`, (x) => !x.extra && !x.status),
    ...gap((n) => `${n} added item${s(n)} not checked`, (x) => x.extra && !x.status),
    ...gap((n) => `${n} defect${s(n)} not described`, (x) => x.status === "defect" && !x.remark.trim()),
    // the details column, where the form has one: needed unless the item is not there
    ...gap((n) => `${n} detail${s(n)} not chosen`, (x) => x.needsDetail),
    // the form: a defect goes in "together with supporting image(s)"
    ...gap((n) => `${n} defect${s(n)} without a photo`, (x) => x.status === "defect" && !x.photos),
  ];
}

export const inventoryProblems = (r: InventoryRecord): string[] => inventoryGaps(r).map((g) => g.label);

/** Every defect in a record, in list order - what admin reviews first. `key` is the item's id, or the added item's. */
export function inventoryDefects(r: InventoryRecord): { key: string; area: string; name: string; remark: string; photos: string[] }[] {
  const out: { key: string; area: string; name: string; remark: string; photos: string[] }[] = [];
  for (const area of INVENTORY) {
    for (const it of area.items) {
      const a = r.answers[it.id];
      if (a?.status === "defect") out.push({ key: it.id, area: area.name, name: it.name, remark: a.remark, photos: a.photos ?? [] });
    }
    for (const e of r.extras)
      if (e.areaId === area.id && e.name.trim() && e.status === "defect")
        out.push({ key: e.id, area: area.name, name: e.name, remark: e.remark, photos: e.photos ?? [] });
  }
  return out;
}

/** Every item marked Not provided, in list order. */
export function inventoryNotProvided(r: InventoryRecord): { key: string; area: string; name: string; remark: string; photos: string[] }[] {
  const out: { key: string; area: string; name: string; remark: string; photos: string[] }[] = [];
  for (const area of INVENTORY) {
    for (const it of area.items) {
      const a = r.answers[it.id];
      if (a?.status === "not_provided") out.push({ key: it.id, area: area.name, name: it.name, remark: a.remark, photos: [] });
    }
    for (const e of r.extras)
      if (e.areaId === area.id && e.name.trim() && e.status === "not_provided")
        out.push({ key: e.id, area: area.name, name: e.name, remark: e.remark, photos: [] });
  }
  return out;
}

/**
 * What Brachtia answers before the resident signs: every defect, and every
 * item marked Not provided (Dani, 2 Oct 2026). For a missing item, Resolved
 * means Brachtia will provide it; Accepted means it stays not provided.
 */
export function inventoryAnswerables(r: InventoryRecord) {
  return [
    ...inventoryDefects(r).map((d) => ({ ...d, kind: "defect" as const })),
    ...inventoryNotProvided(r).map((d) => ({ ...d, kind: "not_provided" as const })),
  ];
}

/** Every photo path in a record. */
export const recordPhotos = (r: InventoryRecord) => [
  ...Object.values(r.answers).flatMap((a) => a.photos ?? []),
  ...r.extras.flatMap((e) => e.photos ?? []),
];

/*
 * Brachtia's answer to each defect (Dani, 1 Oct 2026). The resident sends the
 * check in for review first, without signing; Brachtia answers every defect
 * within 48 hours and sends it back:
 *   resolved - fixed outside the system (a remote's battery replaced); the
 *              admin's click is trusted, there is no further step
 *   accepted - left as it is (a scratch on the table) and recorded as an
 *              existing defect, so it is not charged at move-out
 * The resident reads the answers, and either sends it back again or signs.
 */
export type Verdict = "resolved" | "accepted";
export const VERDICT_LABEL: Record<Verdict, string> = { resolved: "Resolved", accepted: "Accepted" };
/** `remark` is the defect as it read when answered - a changed defect needs a new answer */
export type DefectDecision = { verdict: Verdict; remark: string; at: string };

/** The answers that still fit: the item is still a defect, described the same way. */
export function liveDecisions(r: InventoryRecord, d: Record<string, DefectDecision> | undefined): Record<string, DefectDecision> {
  const out: Record<string, DefectDecision> = {};
  for (const x of inventoryAnswerables(r)) {
    const v = d?.[x.key];
    if (v && v.remark.trim() === x.remark.trim()) out[x.key] = v;
  }
  return out;
}

/** The defects and missing items Brachtia has not answered yet. */
export const undecided = (r: InventoryRecord, d: Record<string, DefectDecision> | undefined) => {
  const live = liveDecisions(r, d);
  return inventoryAnswerables(r).filter((x) => !live[x.key]);
};

/**
 * The answers the resident agrees to before signing: only the Resolved ones -
 * "Accepted as it is" changes nothing for them, so there is nothing to agree
 * to (Dani, 2 Oct 2026).
 */
export const toAgree = (r: InventoryRecord, d: Record<string, DefectDecision> | undefined) => {
  const live = liveDecisions(r, d);
  return inventoryAnswerables(r).filter((x) => live[x.key]?.verdict === "resolved");
};

/** The form's acknowledgement - shown above the Agree tick, and printed in the PDF. */
// **...** is printed bold in the PDF - the words a resident must not miss (Dani, 6 Oct 2026)
export const ACKNOWLEDGEMENT = [
  "The Resident acknowledges that the items marked **Present** were provided with the premises as at the Effective Date stated above. Items marked **Not Provided** are not included as part of the inventory provided to the Resident.",
  "Any existing defect must be marked **Defect**, described under **Remarks** and submitted to Brachtia Homes for review **within 48 hours of the Effective Date** together with **supporting image(s)**.",
  "Any defect not reported within this 48-hour period **may not be recognised as an existing defect** at the commencement of the Resident's occupancy.",
  "The Resident agrees to take reasonable care of the items provided and shall be **responsible for any loss or damage** beyond reasonable wear and tear, subject to the terms of the Tenancy Agreement.",
];

/** Brachtia answers each defect within 48 hours of it being sent in. */
export const REVIEW_HOURS = 48;

/**
 * When the checklist can be filled in: from the start of the check-in day
 * until 48 hours after the check-in time (Schedule C: "within 48 hours of the
 * Effective Date"). Times are Malaysia time.
 */
export function inventoryWindow(checkinOn: string, checkinSlot: string): { opens: Date; closes: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkinOn)) return null;
  const slot = /^\d{2}:\d{2}$/.test(checkinSlot) ? checkinSlot : "00:00";
  const opens = new Date(`${checkinOn}T00:00:00+08:00`);
  const at = new Date(`${checkinOn}T${slot}:00+08:00`);
  return { opens, closes: new Date(at.getTime() + 48 * 3600 * 1000) };
}

/**
 * Whether the inventory check waits for the documents to be signed first.
 * OFF while testing (Dani, 1 Oct 2026), so the checklist can be tried without
 * signing the TA and Schedules A and B. Turn it back on before real residents
 * get their links.
 */
export const INVENTORY_AFTER_DOCUMENTS = false;
