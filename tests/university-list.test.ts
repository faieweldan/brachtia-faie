import { describe, expect, test } from "bun:test";

import { UNIVERSITIES } from "../src/data/form-options";
import { UNIVERSITY_OPTIONS, normUniversity } from "../src/lib/reference-data";

describe("one university list (Dani, 12 Oct 2026)", () => {
  test("the profile list is the form's list", () => {
    const form = UNIVERSITIES.filter((u) => u.value !== "Other").map((u) => u.value);
    expect(UNIVERSITY_OPTIONS.filter((o) => o.value !== "OTHER").map((o) => o.value)).toEqual(form);
  });
  test("older codes become the form's", () => {
    expect(normUniversity("UOC").value).toBe("UoC");
    expect(normUniversity("uoc").value).toBe("UoC");
    expect(normUniversity("CTU").value).toBe("CU");
    expect(normUniversity("City University").value).toBe("CU");
    expect(normUniversity("HWUM").value).toBe("HWUM");
  });
});
