// Row-level Zod schema validation + date-fns DOB checks.
// github.com/colinhacks/zod  — TypeScript-first schema validation (36k★)
// github.com/date-fns/date-fns — date utility library (35k★)

import { z } from "zod";
import { isValid, parseISO, isFuture, differenceInYears } from "date-fns";

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
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) return { valid: false, flag: "invalid-date-format" };
  if (isFuture(parsed)) return { valid: false, flag: "dob-in-future" };
  const age = differenceInYears(new Date(), parsed);
  if (age > 130) return { valid: false, flag: "implausible-age" };
  return { valid: true, age };
}
