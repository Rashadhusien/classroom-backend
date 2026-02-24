import { auth } from "../lib/auth"; // wherever you configured better-auth
import { Request, Response, NextFunction } from "express";

export const betterAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role as "admin" | "teacher" | "student",
    };

    next();
  } catch (error) {
    console.error("Better Auth error:", error);
    return res.status(401).json({ error: "Invalid session" });
  }
};

// Extend Express type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "admin" | "teacher" | "student";
      };
      classId?: number;
    }
  }
}
