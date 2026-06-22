import { z } from "zod";

export const chatHistorySchema = z.object({
  userId: z.string().regex(/^\d+$/, "Invalid userId"),
});

export const chatPaginationSchema = z.object({
  limit: z.string().regex(/^\d+$/, "Invalid limit").optional(),
  offset: z.string().regex(/^\d+$/, "Invalid offset").optional(),
});
