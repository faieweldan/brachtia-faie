import { describe, expect, test } from "bun:test";

import { ALL_ITEMS, emptyRecord, inventoryDefects, inventoryProblems, inventoryWindow } from "../src/lib/inventory";

const allPresent = () => {
  const r = emptyRecord();
  for (const i of ALL_ITEMS) r.answers[i.id] = { status: "present", remark: "", ...(i.details ? { detail: i.details[0]! } : {}) };
  return r;
};

describe("Schedule C - what stops submitting", () => {
  test("nothing answered: every item is still to check", () => {
    expect(inventoryProblems(emptyRecord())).toEqual([`${ALL_ITEMS.length} items not checked yet`]);
  });
  test("the keys and cards are items of their own (form of 1 Oct 2026)", () => {
    expect(ALL_ITEMS.map((i) => i.name)).toContain("Main Grill Key");
    expect(ALL_ITEMS.map((i) => i.name)).toContain("Car Sticker");
  });
  test("a brand or type is needed where the form has one - not when the item is not there", () => {
    const r = allPresent();
    r.answers["kitchen-refrigerator"] = { status: "present", remark: "" };
    expect(inventoryProblems(r)).toEqual(["1 detail not chosen"]);
    r.answers["kitchen-refrigerator"] = { status: "present", remark: "", detail: "Other" };
    expect(inventoryProblems(r)).toEqual(["1 detail not chosen"]);
    r.answers["kitchen-refrigerator"] = { status: "present", remark: "", detail: "Hisense" };
    expect(inventoryProblems(r)).toEqual([]);
    r.answers["kitchen-refrigerator"] = { status: "not_provided", remark: "" };
    expect(inventoryProblems(r)).toEqual([]);
  });
  test("every item present: ready", () => {
    expect(inventoryProblems(allPresent())).toEqual([]);
  });
  test("a defect needs its description", () => {
    const r = allPresent();
    r.answers["room-curtains"] = { status: "defect", remark: " ", photos: ["p.jpg"] };
    expect(inventoryProblems(r)).toEqual(["1 defect not described"]);
    r.answers["room-curtains"] = { status: "defect", remark: "Remote missing back cover", photos: ["p.jpg"] };
    expect(inventoryProblems(r)).toEqual([]);
  });
  test("a defect needs a photo - the form asks for supporting image(s)", () => {
    const r = allPresent();
    r.answers["room-curtains"] = { status: "defect", remark: "Remote missing back cover" };
    expect(inventoryProblems(r)).toEqual(["1 defect without a photo"]);
    r.answers["room-curtains"] = { status: "defect", remark: "Remote missing back cover", photos: ["p.jpg"] };
    expect(inventoryProblems(r)).toEqual([]);
  });
  test("an added item, once named, is checked like the rest", () => {
    const r = allPresent();
    r.extras.push({ id: "x1", areaId: "room", name: "Iron", qty: "1", status: "", remark: "" });
    expect(inventoryProblems(r)).toEqual(["1 added item not checked"]);
    r.extras[0]!.status = "defect";
    expect(inventoryProblems(r)).toEqual(["1 defect not described", "1 defect without a photo"]);
  });
  test("an added row left without a name is ignored", () => {
    const r = allPresent();
    r.extras.push({ id: "x2", areaId: "room", name: " ", qty: "1", status: "", remark: "" });
    expect(inventoryProblems(r)).toEqual([]);
  });
  test("the defects, in list order, for admin to review", () => {
    const r = allPresent();
    r.answers["room-curtains"] = { status: "defect", remark: "Drips" };
    r.extras.push({ id: "x3", areaId: "foyer", name: "Shoe rack", qty: "1", status: "defect", remark: "Wobbly" });
    expect(inventoryDefects(r).map((d) => d.name)).toEqual(["Shoe rack", "Curtains"]);
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
