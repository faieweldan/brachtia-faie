import { describe, expect, test } from "bun:test";
import { cleanPhone, waDigits } from "@/lib/reference-data";

describe("cleanPhone", () => {
  test("takes the trunk 0 off after the country code", () => {
    expect(cleanPhone("+60 0189658709")).toBe("+60 189658709");
  });
  test("reads a number with no code as Malaysian", () => {
    expect(cleanPhone("012-330 6815")).toBe("+60 123306815");
    expect(cleanPhone("60123306815")).toBe("+60 123306815");
  });
  test("leaves another country's number alone", () => {
    expect(cleanPhone("+65 91234567")).toBe("+65 91234567");
  });
  test("blank stays blank", () => {
    expect(cleanPhone("")).toBe("");
  });
});

describe("waDigits", () => {
  test("a stored +60 0... number still opens the right WhatsApp chat", () => {
    expect(waDigits("+60 0189658709")).toBe("60189658709");
    expect(waDigits("012-330 6815")).toBe("60123306815");
  });
});
