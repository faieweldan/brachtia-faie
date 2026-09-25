import { describe, expect, test } from "bun:test";
import {
  residentDocsFor,
  residentDocLabel,
  missingResidentDocs,
  RESIDENT_DOCS,
} from "../src/lib/resident-documents";

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

describe("what still has to be uploaded before the form can be sent", () => {
  const missing = (status: string, up: Record<string, string>) =>
    missingResidentDocs(status, up).map((d) => d.key);

  test("nothing uploaded means all three are outstanding", () => {
    expect(missing("employed", {})).toEqual(["photo", "employment", "id"]);
  });
  test("a student is never held up by an employment letter", () => {
    expect(missing("student", { photo: "a.jpg", offer: "b.pdf", id: "c.jpg" })).toEqual([]);
  });
  test("and somebody working is never held up by a university letter", () => {
    expect(missing("employed", { photo: "a.jpg", employment: "b.pdf", id: "c.jpg" })).toEqual([]);
  });
  test("a student's offer letter does not stand in for an employment one", () => {
    // they answered Student, uploaded, then changed to Employed
    expect(missing("employed", { photo: "a.jpg", offer: "b.pdf", id: "c.jpg" })).toEqual([
      "employment",
    ]);
  });
  test("one left says which one", () => {
    expect(missing("student", { photo: "a.jpg", id: "c.jpg" })).toEqual(["offer"]);
  });
});
