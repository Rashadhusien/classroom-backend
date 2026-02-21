import { auth } from "./lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: typeof auth.$Infer.Session.user;
      session?: typeof auth.$Infer.Session.session;
    }
  }
}

export type UserRoles = "admin" | "teacher" | "student";

export type RateLimitRole = UserRoles | "guest";
