import crypto from "crypto";

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

export function getSessionExpiry(days = 30) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
