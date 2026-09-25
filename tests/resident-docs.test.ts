import { describe, expect, test } from "bun:test";
import { residentDocsFor, residentDocLabel, RESIDENT_DOCS } from "../src/lib/resident-documents";

const keys = (s: string) => residentDocsFor(s).map((d) => d.key);

describe("what a resident is asked to upload", () => {
  test("somebody working is asked for an employment letter, not a university offer", () => {
    // the form had already stopped asking them for a university, then asked
    // them to upload the letter from it
    expect(keys("employed")).toEqual(["photo", "employment", "id"]);
  });
  test("a student is asked for their offer letter, not an employment one", () => {
    expect(keys("student")).toEqual(["photo", "offer", "id"]);
  });
  test("no answer yet falls back to the student set, which is what everyone had", () => {
    expect(keys("")).toEqual(["photo", "offer", "id"]);
    expect(keys("something new")).toEqual(["photo", "offer", "id"]);
  });
  test("the answer is read however it was cased or spaced", () => {
    expect(keys("  Employed ")).toEqual(["photo", "employment", "id"]);
  });
  test("the photo and the ID are asked of everybody", () => {
    for (const status of ["student", "employed"]) {
      expect(keys(status)).toContain("photo");
      expect(keys(status)).toContain("id");
    }
  });
  test("the ID copy is named after their nationality, as the ID field is", () => {
    // nationality is stored as the ISO-3 code, the way the master list has it
    expect(residentDocLabel("id", "MYS")).toBe("MyKad / NRIC copy");
    expect(residentDocLabel("id", "IND")).toBe("Passport copy");
    expect(residentDocLabel("employment", "MYS")).toBe("Employment letter");
  });
  test("every document the form can ask for is one the server will accept", () => {
    for (const status of ["student", "employed", ""]) {
      for (const d of residentDocsFor(status)) {
        expect(RESIDENT_DOCS.some((r) => r.key === d.key)).toBe(true);
      }
    }
  });
});
