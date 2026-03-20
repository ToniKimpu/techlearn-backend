import { z } from "zod";
import { paginationQuery } from "../../schemas/shared.js";

export const updateUserStatusBody = z.object({
  isDeactivated: z.boolean(),
});

export const userIdParam = z.object({
  id: z.uuid("Invalid user ID"),
});

export const listUsersQuery = paginationQuery.extend({
  userType: z.enum(["admin", "teacher", "student"]).optional(),
  isDeactivated: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
