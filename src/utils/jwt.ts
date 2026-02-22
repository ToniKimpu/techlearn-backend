import jwt from "jsonwebtoken";
import type { JwtUserPayload } from "../types/jwt.js";

const ACCESS_TOKEN_EXPIRES_IN = "30m";

export function generateAccessToken(params: JwtUserPayload) {
  return jwt.sign(
    {
      sub: params.authId,
      profileId: params.profileId,
      userType: params.userType,
    },
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

export function verifyAccessToken(token: string): JwtUserPayload {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;

  return {
    authId: payload.sub as string,
    profileId: payload.profileId as string,
    userType: payload.userType as string,
  };
}
