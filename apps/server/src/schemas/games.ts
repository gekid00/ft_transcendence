import { z } from "zod";

export const aiGameSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  timePerPlayerSeconds: z.number().int().refine(
    (v) => [180, 600, 3600].includes(v),
    "Must be 180, 600, or 3600"
  ).default(180),
});

export const gameIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid game id"),
});
