import crypto from "crypto";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_EXPIRES_IN = "30m";

export function generateAccessToken(params: {
  authId: string;
  profileId: string;
  userType: string;
}) {
  return jwt.sign(
    {
      sub: params.authId, // Auth ID (UUID)
      profileId: params.profileId,
      userType: params.userType,
    },
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

export function generateRefreshToken() {
  return crypto.randomBytes(40).toString("hex");
}
