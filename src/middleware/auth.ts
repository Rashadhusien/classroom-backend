import { auth } from "../lib/auth.js";
import { Request, Response, NextFunction } from "express";

export const betterAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Debug logging for production
    console.log("Auth middleware - Headers:", {
      cookie: req.headers.cookie ? "present" : "missing",
      origin: req.headers.origin,
      referer: req.headers.referer,
      userAgent: req.headers["user-agent"]?.substring(0, 50),
    });

    const session = await auth.api.getSession({
      headers: req.headers,
    });

    console.log("Auth middleware - Session result:", {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.id,
    });

    if (!session?.user) {
      return res.status(401).json({
        error: "Authentication required",
        debug: {
          hasSession: !!session,
          hasUser: !!session?.user,
        },
      });
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role as "admin" | "teacher" | "student",
    };

    next();
  } catch (error) {
    console.error("Better Auth error:", error);
    return res.status(401).json({
      error: "Invalid session",
      debug: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};
