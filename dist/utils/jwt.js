import jwt from "jsonwebtoken";
const ACCESS_TOKEN_EXPIRES_IN = "30m";
export function generateAccessToken(params) {
    return jwt.sign({
        sub: params.authId,
        profileId: params.profileId,
        userType: params.userType,
    }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}
export function verifyAccessToken(token) {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return {
        authId: payload.sub,
        profileId: payload.profileId,
        userType: payload.userType,
    };
}
//# sourceMappingURL=jwt.js.map