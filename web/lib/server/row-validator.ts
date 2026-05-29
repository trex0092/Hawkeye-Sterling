// Row-level Zod schema validation + DOB checks (native Date API — no extra dependency).
// github.com/colinhacks/zod  — TypeScript-first schema validation (36k★)

import { z } from "zod";

export const BatchRowSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(200, "Name exceeds 200-character limit"),
  aliases: z.array(z.string().max(200)).max(20).optional(),
  entityType: z
    .enum(["individual", "organisation", "vessel", "aircraft", "other"])
    .optional(),
  jurisdiction: z.string().max(100).optional(),
  dob: z.string().max(30).optional(),
  gender: z.enum(["male", "female", "n/a"]).optional(),
  idNumber: z.string().max(100).optional(),
});

export const BatchBodySchema = z.object({
  rows: z
    .array(BatchRowSchema)
    .min(1, "At least one row required")
    .max(500, "Batch size exceeds 500-row limit"),
});

export type ValidatedBatchRow = z.infer<typeof BatchRowSchema>;

export interface DobValidation {
  valid: boolean;
  age?: number;
  flag?: "invalid-date-format" | "dob-in-future" | "implausible-age";
}

export function validateDob(dob: string): DobValidation {
  // Accept ISO 8601 (YYYY-MM-DD) and YYYY only
  const yearOnly = /^\d{4}$/.test(dob.trim());
  const dateStr = yearOnly ? `${dob.trim()}-01-01` : dob.trim();
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return { valid: false, flag: "invalid-date-format" };
  if (parsed > new Date()) return { valid: false, flag: "dob-in-future" };
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) age--;
  if (age > 130) return { valid: false, flag: "implausible-age" };
  return { valid: true, age };
}
