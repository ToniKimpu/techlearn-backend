import type { JwtUserPayload } from "./jwt.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: JwtUserPayload;
    }
  }
}

export {};
