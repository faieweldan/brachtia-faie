import { describe, expect, test } from "bun:test";

import { ALL_ITEMS, emptyRecord, inventoryProblems, inventoryWindow } from "../src/lib/inventory";

const allPresent = () => {
  const r = emptyRecord();
  for (const i of ALL_ITEMS) r.answers[i.id] = { status: "present", remark: "" };
  return r;
};

describe("Schedule C - what stops signing", () => {
  test("nothing answered: every item is still to check", () => {
    expect(inventoryProblems(emptyRecord())).toEqual([`${ALL_ITEMS.length} items not checked yet`]);
  });
  test("every item present: ready", () => {
    expect(inventoryProblems(allPresent())).toEqual([]);
  });
  test("a defect needs its description", () => {
    const r = allPresent();
    r.answers["room-aircon"] = { status: "defect", remark: " " };
    expect(inventoryProblems(r)).toEqual(["1 defect not described"]);
    r.answers["room-aircon"] = { status: "defect", remark: "Remote missing back cover" };
    expect(inventoryProblems(r)).toEqual([]);
  });
  test("an Other line is optional, but once named it is checked", () => {
    const r = allPresent();
    r.others[0] = { name: "Iron", status: "", remark: "" };
    expect(inventoryProblems(r)).toEqual(['1 "Other" item not checked']);
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
