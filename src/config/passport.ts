import argon2 from "argon2";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { prisma } from "../database/prisma.js";

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const auth = await prisma.authUser.findUnique({
        where: { email },
        include: { profile: true },
      });

      if (!auth) {
        return done(null, false, { message: "Incorrect email" });
      }

      const match = await argon2.verify(auth.passwordHash!, password);
      if (!match) {
        return done(null, false, { message: "Incorrect password" });
      }

      if (!auth.profile) {
        return done(null, false, { message: "User profile missing" });
      }

      return done(null, auth);
    } catch (err) {
      return done(err);
    }
  })
);

export default passport;
