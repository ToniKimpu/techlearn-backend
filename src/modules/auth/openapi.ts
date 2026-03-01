import { z } from "zod";
import { registry } from "../../openapi/setup.js";
import { errorResponses } from "../../openapi/helpers.js";
import { registerBody, loginBody, refreshTokenBody, logoutBody } from "./schemas.js";

const TokenResponse = z.object({
  message: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    authId: z.string().openapi({ example: "c5f2d1a0-1234-4abc-9def-abcdef123456" }),
    profileId: z.string().openapi({ example: "d6e3f2b1-5678-4def-abcd-fedcba654321" }),
    userType: z.string().openapi({ example: "student" }),
  }),
});

const RefreshedTokenResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

const MessageOnly = z.object({ message: z.string() });

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Register a new user",
  description: "Creates a student account and returns access/refresh tokens.",
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
  description: "Authenticates with email/password and returns tokens.",
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
  description: "Invalidates the given refresh token.",
  request: {
    body: { content: { "application/json": { schema: logoutBody } } },
  },
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
  description: "Exchanges a valid refresh token for a new access/refresh token pair.",
  request: {
    body: { content: { "application/json": { schema: refreshTokenBody } } },
  },
  responses: {
    200: {
      description: "New token pair",
      content: { "application/json": { schema: RefreshedTokenResponse } },
    },
    ...errorResponses(400, 401),
  },
});
