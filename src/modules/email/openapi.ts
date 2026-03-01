import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses } from "../../openapi/helpers.js";

registry.registerPath({
  method: "get",
  path: "/email/health",
  tags: ["Email"],
  summary: "Email queue health",
  description: "Admin only. Returns BullMQ email queue job counts.",
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: "Queue status",
      content: {
        "application/json": {
          schema: z.object({
            queueName: z.string().openapi({ example: "email" }),
            jobCounts: z.object({
              waiting: z.number().openapi({ example: 0 }),
              active: z.number().openapi({ example: 0 }),
              completed: z.number().openapi({ example: 12 }),
              failed: z.number().openapi({ example: 1 }),
              delayed: z.number().openapi({ example: 0 }),
            }),
          }),
        },
      },
    },
    ...errorResponses(401, 403),
  },
});
