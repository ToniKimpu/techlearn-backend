import jwt from "jsonwebtoken";

export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;

  return {
    authId: payload.sub,
    profileId: payload.profileId,
    userType: payload.userType,
  };
}
