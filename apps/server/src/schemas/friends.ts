import { z } from "zod";
import { positiveIntSchema } from "./common.js";

export const friendRequestSchema = z.object({
  userId: positiveIntSchema,
});

export const friendRespondSchema = z.object({
  friendshipId: positiveIntSchema,
  accept: z.boolean(),
});

export const blockSchema = z.object({
  userId: positiveIntSchema,
});
