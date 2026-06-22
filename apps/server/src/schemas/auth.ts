import { z } from "zod";
import { emailSchema, usernameSchema, passwordSchema } from "./common.js";

export const signupSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signupCompleteSchema = z.object({
  initialRating: z.number().int().min(0).max(4000).optional(),
}).default({});
