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
  /** as the form prints it - "1", "1 set", "4 / 6"; "" when not stated */
  qty: string;
};

export type InventoryArea = { id: string; name: string; items: InventoryItem[] };

const item = (id: string, name: string, qty = ""): InventoryItem => ({ id, name, qty });

export const INVENTORY: InventoryArea[] = [
  {
    id: "foyer",
    name: "Foyer",
    items: [item("foyer-door-bell", "Door Bell", "1"), item("foyer-ceiling-lights", "Ceiling Lights")],
  },
  {
    id: "living",
    name: "Living Hall",
    items: [
      item("living-ceiling-lights", "Ceiling Lights"),
      item("living-ceiling-fan", "Ceiling Fan", "1"),
      item("living-curtains", "Curtains"),
      item("living-sofa", "Sofa (3 Seater)", "1"),
      item("living-coffee-table", "Coffee Table", "1"),
      item("living-tv-cabinet", "TV Cabinet", "1"),
    ],
  },
  {
    id: "dining",
    name: "Dining",
    items: [
      item("dining-wall-tv-frame", "Wall TV Frame", "1"),
      item("dining-ceiling-lights", "Ceiling Lights"),
      item("dining-ceiling-fan", "Ceiling Fan", "1"),
      item("dining-table", "Dining Table", "1"),
      item("dining-chairs", "Dining Chairs", "6"),
    ],
  },
  {
    id: "kitchen",
    name: "Kitchen",
    items: [
      item("kitchen-ceiling-lights", "Ceiling Lights", "1"),
      item("kitchen-cabinet", "Kitchen Cabinet (Top & Bottom)", "1 set"),
      item("kitchen-hood-hob", "Cooker Hood & Hob", "1 set"),
      item("kitchen-induction-cooker", "Induction Cooker", "1"),
      item("kitchen-refrigerator", "Refrigerator", "1"),
      item("kitchen-microwave", "Microwave", "1"),
      item("kitchen-rice-cooker", "Rice Cooker", "1"),
      item("kitchen-kettle", "Electric Jug / Kettle", "1"),
      item("kitchen-pot-pan", "Pot with Lid & Pan", "1 set"),
      item("kitchen-induction-pot", "Induction Pot", "1"),
      item("kitchen-dish-drainer", "Dish Drainer", "1"),
      item("kitchen-cutlery", "Cutlery, Plates, Bowls & Mugs", "4 / 6"),
      item("kitchen-spoon-spatula", "Wooden Spoon & Spatula", "1 set"),
    ],
  },
  {
    id: "yard",
    name: "Yard",
    items: [
      item("yard-washing-machine", "Washing Machine", "1"),
      item("yard-pail-mop", "Pail, Mop & Toilet Brush", "1 set"),
      item("yard-broom", "Broom, Dustpan & Dustbin", "1 set"),
      item("yard-ceiling-lights", "Ceiling Lights", "1"),
    ],
  },
  {
    id: "room",
    name: "Room",
    items: [
      item("room-ceiling-lights", "Ceiling Lights"),
      item("room-ceiling-fan", "Ceiling Fan", "1"),
      item("room-curtains", "Curtains"),
      item("room-aircon", "Air Conditioner + Remote", "1"),
      item("room-bed", "Bed Frame + Mattress"),
      item("room-mattress-protector", "Mattress Protector (Single / King)", "1"),
      item("room-bedside", "Bedside Table / Drawer"),
      item("room-wardrobe", "Wardrobe (Built-in / Movable)", "1 set"),
      item("room-study", "Study Table + Chair", "1 set"),
    ],
  },
  {
    id: "bath1",
    name: "Attached / Common Bathroom 1",
    items: [
      item("bath1-ceiling-lights", "Ceiling Lights", "1"),
      item("bath1-mirror", "Wall Mirror", "1"),
      item("bath1-water-heater", "Water Heater", "1"),
    ],
  },
  {
    id: "bath2",
    name: "Common Bathroom 2",
    items: [
      item("bath2-ceiling-lights", "Ceiling Lights", "1"),
      item("bath2-mirror", "Wall Mirror", "1"),
      item("bath2-water-heater", "Water Heater", "1"),
    ],
  },
  {
    id: "other",
    name: "Other Items",
    items: [item("other-keys", "Keys")],
  },
];

export const STATUS_LABEL: Record<InventoryStatus, string> = {
  present: "Present",
  defect: "Defect",
  not_provided: "Not provided",
};

/** One answered item. `qty` is what the resident counted, when it differs. */
export type InventoryAnswer = { status: InventoryStatus | ""; remark: string; qty?: string };
/** An item the list did not name, added by the resident in that area. */
export type ExtraItem = { id: string; areaId: string; name: string; qty: string; status: InventoryStatus | ""; remark: string };
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

/**
 * What still stops the record being submitted: every item answered, every
 * defect described (the form: "described under Remarks"), every added item
 * named and answered, and the keys counted - a key not counted at move-in is
 * a deduction nobody can make at move-out.
 */
export function inventoryProblems(r: InventoryRecord): string[] {
  const out: string[] = [];
  const unanswered = ALL_ITEMS.filter((i) => !r.answers[i.id]?.status).length;
  if (unanswered) out.push(`${unanswered} item${unanswered === 1 ? "" : "s"} not checked yet`);
  const extras = r.extras.filter((e) => e.name.trim());
  const extraOpen = extras.filter((e) => !e.status).length;
  if (extraOpen) out.push(`${extraOpen} added item${extraOpen === 1 ? "" : "s"} not checked`);
  const undescribed =
    ALL_ITEMS.filter((i) => r.answers[i.id]?.status === "defect" && !r.answers[i.id]!.remark.trim()).length +
    extras.filter((e) => e.status === "defect" && !e.remark.trim()).length;
  if (undescribed) out.push(`${undescribed} defect${undescribed === 1 ? "" : "s"} not described`);
  if (!r.meters.keys.trim()) out.push("number of keys not filled in");
  return out;
}

/** Every defect in a record, in list order - what admin reviews first. */
export function inventoryDefects(r: InventoryRecord): { area: string; name: string; remark: string }[] {
  const out: { area: string; name: string; remark: string }[] = [];
  for (const area of INVENTORY) {
    for (const it of area.items) {
      const a = r.answers[it.id];
      if (a?.status === "defect") out.push({ area: area.name, name: it.name, remark: a.remark });
    }
    for (const e of r.extras) if (e.areaId === area.id && e.name.trim() && e.status === "defect") out.push({ area: area.name, name: e.name, remark: e.remark });
  }
  return out;
}

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
