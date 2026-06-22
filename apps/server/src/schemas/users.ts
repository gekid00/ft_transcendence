import { z } from "zod";
import { emailSchema, usernameSchema, passwordSchema } from "./common.js";

const BIO_MAX_LEN = 160;
const ALLOWED_PAWN_SKINS = ["default", "sunset", "royal", "forest"] as const;
const ALLOWED_GRID_SKINS = ["liquid-glass", "frosted-obsidian"] as const;

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  bio: z.string().max(BIO_MAX_LEN, `Bio must be ≤ ${BIO_MAX_LEN} chars`).optional(),
  pawnSkin: z.enum(ALLOWED_PAWN_SKINS).optional(),
  gridSkin: z.enum(ALLOWED_GRID_SKINS).optional(),
});

export const updateEmailSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newEmail: emailSchema,
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export const userSearchSchema = z.object({
  q: z.string().max(50, "Search query must be ≤ 50 chars").optional(),
});

export const usernameCheckSchema = z.object({
  q: z.string().max(30, "Username must be ≤ 30 chars").optional(),
});

export const userGamesSchema = z.object({
  limit: z.string().regex(/^\d+$/, "Invalid limit").optional(),
  offset: z.string().regex(/^\d+$/, "Invalid offset").optional(),
});

export const userStatsSchema = z.object({
  is_ai: z.enum(["true", "false"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});
