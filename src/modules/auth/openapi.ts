import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses } from "../../openapi/helpers.js";
import { registerBody, loginBody } from "./schemas.js";

const TokenResponse = z.object({
  message: z.string(),
  accessToken: z.string(),
  user: z.object({
    id: z.string().openapi({ example: "d6e3f2b1-5678-4def-abcd-fedcba654321" }),
    name: z.string().openapi({ example: "Jane Doe" }),
    email: z.string().openapi({ example: "jane@example.com" }),
    role: z.string().openapi({ example: "student" }),
  }),
});

const RefreshedTokenResponse = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
  }),
});

const MessageOnly = z.object({ message: z.string() });

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Register a new user",
  description:
    "Creates a student account. Returns accessToken in body. Sets refreshToken as HttpOnly cookie.",
  request: {
    body: { content: { "application/json": { schema: registerBody } } },
  },
  responses: {
    201: {
      description: "Registered and logged in",
      content: { "application/json": { schema: TokenResponse } },
    },
    ...errorResponses(400, 409, 429),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Log in",
  description:
    "Authenticates with email/password. Returns accessToken in body. Sets refreshToken as HttpOnly cookie.",
  request: {
    body: { content: { "application/json": { schema: loginBody } } },
  },
  responses: {
    200: {
      description: "Login successful",
      content: { "application/json": { schema: TokenResponse } },
    },
    ...errorResponses(401, 429),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Log out (single device)",
  description:
    "Reads refreshToken from HttpOnly cookie and invalidates the session. No request body needed.",
  responses: {
    200: {
      description: "Logged out",
      content: { "application/json": { schema: MessageOnly } },
    },
    ...errorResponses(400),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout-all",
  tags: ["Auth"],
  summary: "Log out from all devices",
  description: "Clears all sessions for the authenticated user.",
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: "Logged out from all devices",
      content: { "application/json": { schema: MessageOnly } },
    },
    ...errorResponses(401),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh-token",
  tags: ["Auth"],
  summary: "Rotate refresh token",
  description:
    "Reads refreshToken from HttpOnly cookie, issues a new access token and rotates the refresh token cookie. No request body needed.",
  responses: {
    200: {
      description: "New access token",
      content: { "application/json": { schema: RefreshedTokenResponse } },
    },
    ...errorResponses(401),
  },
});
