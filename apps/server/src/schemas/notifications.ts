import { z } from "zod";

export const notificationIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid notification id"),
});
