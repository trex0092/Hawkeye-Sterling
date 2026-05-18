// Unit tests for web/lib/server/validate.ts
// Run via: bun vitest run (from repo root)

import { describe, it, expect } from "vitest";
import {
  ValidationError,
  validationError,
  assertValid,
  validateString,
  validateEnum,
  validatePositiveInt,
  validateDate,
  validateBoolean,
  validateEmail,
  validateArray,
  validateRecord,
} from "../../../../web/lib/server/validate.js";

describe("ValidationError", () => {
  it("creates with field and code", () => {
    const e = new ValidationError("name", "required", "REQUIRED");
    expect(e.field).toBe("name");
    expect(e.code).toBe("REQUIRED");
    expect(e.message).toBe("required");
    expect(e).toBeInstanceOf(Error);
  });

  it("defaults code to INVALID", () => {
    const e = new ValidationError("x", "bad");
    expect(e.code).toBe("INVALID");
  });
});

describe("validationError", () => {
  it("returns a ValidationError", () => {
    const e = validationError("field", "msg");
    expect(e).toBeInstanceOf(ValidationError);
    expect(e.field).toBe("field");
  });
});

describe("assertValid", () => {
  it("returns the value when non-null", () => {
    expect(assertValid("hello", "field")).toBe("hello");
    expect(assertValid(0, "field")).toBe(0);
  });

  it("throws ValidationError when null", () => {
    expect(() => assertValid(null, "name")).toThrow(ValidationError);
    expect(() => assertValid(null, "name", "must be set")).toThrow("must be set");
  });
});

describe("validateString", () => {
  it("accepts a plain string", () => {
    expect(validateString("hello", {})).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(validateString("  hi  ", {})).toBe("hi");
  });

  it("returns null for non-string", () => {
    expect(validateString(42, {})).toBeNull();
    expect(validateString(null, {})).toBeNull();
    expect(validateString(undefined, {})).toBeNull();
  });

  it("returns null when required and empty", () => {
    expect(validateString("", { required: true })).toBeNull();
    expect(validateString("   ", { required: true })).toBeNull();
  });

  it("returns null for empty string (no meaningful value)", () => {
    expect(validateString("", {})).toBeNull();
    expect(validateString("   ", {})).toBeNull();
  });

  it("enforces minLength", () => {
    expect(validateString("ab", { minLength: 3 })).toBeNull();
    expect(validateString("abc", { minLength: 3 })).toBe("abc");
  });

  it("enforces maxLength", () => {
    expect(validateString("abcdef", { maxLength: 5 })).toBeNull();
    expect(validateString("abcde", { maxLength: 5 })).toBe("abcde");
  });

  it("enforces pattern", () => {
    expect(validateString("hello", { pattern: /^\d+$/ })).toBeNull();
    expect(validateString("123", { pattern: /^\d+$/ })).toBe("123");
  });
});

describe("validateEnum", () => {
  const allowed = ["a", "b", "c"] as const;

  it("accepts valid member", () => {
    expect(validateEnum("a", allowed)).toBe("a");
    expect(validateEnum("c", allowed)).toBe("c");
  });

  it("rejects non-member", () => {
    expect(validateEnum("d", allowed)).toBeNull();
    expect(validateEnum("", allowed)).toBeNull();
    expect(validateEnum(null, allowed)).toBeNull();
  });
});

describe("validatePositiveInt", () => {
  it("accepts positive integers", () => {
    expect(validatePositiveInt(5, {})).toBe(5);
    expect(validatePositiveInt(1, {})).toBe(1);
  });

  it("accepts numeric strings", () => {
    expect(validatePositiveInt("10", {})).toBe(10);
  });

  it("rejects zero and negatives", () => {
    expect(validatePositiveInt(0, {})).toBeNull();
    expect(validatePositiveInt(-1, {})).toBeNull();
  });

  it("rejects non-integers", () => {
    expect(validatePositiveInt(1.5, {})).toBeNull();
    expect(validatePositiveInt("abc", {})).toBeNull();
  });

  it("enforces max", () => {
    expect(validatePositiveInt(101, { max: 100 })).toBeNull();
    expect(validatePositiveInt(100, { max: 100 })).toBe(100);
  });
});

describe("validateDate", () => {
  it("accepts ISO date strings", () => {
    const result = validateDate("2026-05-17");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("accepts ISO datetime strings", () => {
    expect(validateDate("2026-05-17T10:30:00Z")).toBeTruthy();
  });

  it("rejects invalid dates", () => {
    expect(validateDate("not-a-date")).toBeNull();
    expect(validateDate("2026-13-01")).toBeNull();
    expect(validateDate(null)).toBeNull();
    expect(validateDate(42)).toBeNull();
  });
});

describe("validateBoolean", () => {
  it("accepts boolean literals", () => {
    expect(validateBoolean(true)).toBe(true);
    expect(validateBoolean(false)).toBe(false);
  });

  it("accepts string booleans", () => {
    expect(validateBoolean("true")).toBe(true);
    expect(validateBoolean("false")).toBe(false);
  });

  it("rejects other values", () => {
    expect(validateBoolean("yes")).toBeNull();
    expect(validateBoolean(1)).toBeNull();
    expect(validateBoolean(null)).toBeNull();
  });
});

describe("validateEmail", () => {
  it("accepts valid emails", () => {
    expect(validateEmail("user@example.com")).toBe("user@example.com");
    expect(validateEmail("UPPER@DOMAIN.COM")).toBe("upper@domain.com");
  });

  it("rejects invalid emails", () => {
    expect(validateEmail("notanemail")).toBeNull();
    expect(validateEmail("@no-local.com")).toBeNull();
    expect(validateEmail("no-at-sign")).toBeNull();
    expect(validateEmail(null)).toBeNull();
  });
});

describe("validateArray", () => {
  const itemValidator = (x: unknown) => validateString(x, { required: true });

  it("accepts valid arrays", () => {
    expect(validateArray(["a", "b", "c"], itemValidator)).toEqual(["a", "b", "c"]);
  });

  it("returns null for non-arrays", () => {
    expect(validateArray("not-array", itemValidator)).toBeNull();
    expect(validateArray(null, itemValidator)).toBeNull();
  });

  it("returns null if any item is invalid", () => {
    expect(validateArray(["a", 42, "c"], itemValidator)).toBeNull();
  });

  it("enforces minLength", () => {
    expect(validateArray([], itemValidator, { minLength: 1 })).toBeNull();
  });

  it("enforces maxLength", () => {
    expect(validateArray(["a", "b", "c"], itemValidator, { maxLength: 2 })).toBeNull();
    expect(validateArray(["a", "b"], itemValidator, { maxLength: 2 })).toEqual(["a", "b"]);
  });
});

describe("validateRecord", () => {
  it("accepts plain objects", () => {
    const result = validateRecord({ a: 1, b: "x" });
    expect(result).toEqual({ a: 1, b: "x" });
  });

  it("rejects non-objects", () => {
    expect(validateRecord(null)).toBeNull();
    expect(validateRecord("string")).toBeNull();
    expect(validateRecord(42)).toBeNull();
    expect(validateRecord(undefined)).toBeNull();
  });

  it("rejects arrays", () => {
    expect(validateRecord([])).toBeNull();
    expect(validateRecord([1, 2])).toBeNull();
  });

  it("rejects prototype-polluted input", () => {
    const poisoned = Object.create({ injected: true });
    // Should return null or an object without prototype props
    const result = validateRecord(poisoned);
    if (result !== null) {
      expect(result).not.toHaveProperty("injected");
    }
  });
});
