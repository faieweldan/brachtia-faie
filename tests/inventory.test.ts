import { describe, expect, test } from "bun:test";

import { ALL_ITEMS, emptyRecord, inventoryDefects, inventoryProblems, inventoryWindow } from "../src/lib/inventory";

const allPresent = () => {
  const r = emptyRecord();
  for (const i of ALL_ITEMS) r.answers[i.id] = { status: "present", remark: "" };
  r.meters.keys = "2";
  return r;
};

describe("Schedule C - what stops submitting", () => {
  test("nothing answered: every item, and the keys", () => {
    expect(inventoryProblems(emptyRecord())).toEqual([`${ALL_ITEMS.length} items not checked yet`, "number of keys not filled in"]);
  });
  test("every item present and the keys counted: ready", () => {
    expect(inventoryProblems(allPresent())).toEqual([]);
  });
  test("a defect needs its description", () => {
    const r = allPresent();
    r.answers["room-aircon"] = { status: "defect", remark: " " };
    expect(inventoryProblems(r)).toEqual(["1 defect not described"]);
    r.answers["room-aircon"] = { status: "defect", remark: "Remote missing back cover" };
    expect(inventoryProblems(r)).toEqual([]);
  });
  test("an added item, once named, is checked like the rest", () => {
    const r = allPresent();
    r.extras.push({ id: "x1", areaId: "room", name: "Iron", qty: "1", status: "", remark: "" });
    expect(inventoryProblems(r)).toEqual(["1 added item not checked"]);
    r.extras[0]!.status = "defect";
    expect(inventoryProblems(r)).toEqual(["1 defect not described"]);
  });
  test("an added row left without a name is ignored", () => {
    const r = allPresent();
    r.extras.push({ id: "x2", areaId: "room", name: " ", qty: "1", status: "", remark: "" });
    expect(inventoryProblems(r)).toEqual([]);
  });
  test("the defects, in list order, for admin to review", () => {
    const r = allPresent();
    r.answers["room-aircon"] = { status: "defect", remark: "Drips" };
    r.extras.push({ id: "x3", areaId: "foyer", name: "Shoe rack", qty: "1", status: "defect", remark: "Wobbly" });
    expect(inventoryDefects(r).map((d) => d.name)).toEqual(["Shoe rack", "Air Conditioner + Remote"]);
  });
});

describe("Schedule C - when it can be filled in", () => {
  const w = inventoryWindow("2026-10-21", "13:00")!;
  test("opens at the start of the check-in day, Malaysia time", () => {
    expect(w.opens.toISOString()).toBe("2026-10-20T16:00:00.000Z");
  });
  test("closes 48 hours after the check-in time", () => {
    expect(w.closes.toISOString()).toBe("2026-10-23T05:00:00.000Z");
  });
  test("no check-in date: no window", () => {
    expect(inventoryWindow("", "")).toBeNull();
  });
});
