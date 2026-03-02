import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses } from "../../openapi/helpers.js";

registry.registerPath({
  method: "post",
  path: "/upload",
  tags: ["Upload"],
  summary: "Upload a file",
  description: "Upload an image (JPEG, PNG, WebP, GIF). Max 5 MB.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().openapi({ format: "binary", description: "Image file (max 5 MB)" }),
            bucket: z.string().openapi({ description: "Storage bucket name", example: "avatars" }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "File uploaded",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
            data: z.object({
              path: z.string().openapi({ example: "avatars/abc123.jpg" }),
              url: z
                .string()
                .openapi({ example: "https://storage.example.com/avatars/abc123.jpg" }),
            }),
          }),
        },
      },
    },
    ...errorResponses(400, 401),
  },
});

registry.registerPath({
  method: "delete",
  path: "/upload",
  tags: ["Upload"],
  summary: "Delete a file",
  description: "Delete a previously uploaded file from storage by its URL.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            url: z.string().openapi({
              description: "Full URL of the file to delete",
              example: "https://storage.example.com/storage/v1/object/public/avatars/abc123.jpg",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "File deleted",
      content: {
        "application/json": {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    ...errorResponses(400, 401),
  },
});
