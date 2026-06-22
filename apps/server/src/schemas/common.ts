import { z } from "zod";

export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .max(255, "Email must be ≤ 255 chars")
  .email("Invalid email format");

export const usernameSchema = z
  .string()
  .min(1, "Username is required")
  .max(30, "Username must be ≤ 30 chars")
  .regex(/^[a-zA-Z0-9_]{3,30}$/, "Username must be 3-30 chars (letters, numbers, underscore)");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 chars")
  .max(128, "Password must be ≤ 128 chars");

export const positiveIntSchema = z
  .number()
  .int("Must be an integer")
  .positive("Must be a positive number");

export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid id"),
});

export const limitQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/, "Invalid limit").optional(),
});

export const offsetQuerySchema = z.object({
  offset: z.string().regex(/^\d+$/, "Invalid offset").optional(),
});
