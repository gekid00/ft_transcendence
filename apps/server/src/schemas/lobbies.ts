import { z } from "zod";

export const createLobbySchema = z.object({
  isPublic: z.boolean().default(true),
  mode: z.enum(["connect4", "connect5"]).default("connect4"),
  timePerPlayerSeconds: z.number().int().refine(
    (v) => [180, 600, 3600].includes(v),
    "Must be 180, 600, or 3600"
  ).default(180),
});

export const joinLobbySchema = z.object({
  code: z.string().optional(),
});

export const lobbyListSchema = z.object({
  mode: z.enum(["connect4", "connect5"]).optional(),
  status: z.enum(["waiting", "in_progress", "closed"]).optional(),
  time: z.string().regex(/^\d+$/, "Invalid time").optional(),
});

export const lobbyIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid lobby id"),
});
