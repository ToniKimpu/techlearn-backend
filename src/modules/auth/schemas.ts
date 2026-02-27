import { z } from "zod";

export const registerBody = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1, "Name is required"),
});

export const loginBody = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenBody = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});

export const logoutBody = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});
