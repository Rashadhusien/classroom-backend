import { NextFunction, Request, Response } from "express";
import aj from "../config/arject";
import { ArcjetNodeRequest, slidingWindow } from "@arcjet/node";
const securityMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (process.env.NODE_ENV === "test") return next();

  try {
    const role: RateLimitRole = req.user?.role || "guest";
    let limit: number;
    let message: string;

    switch (role) {
      case "admin":
        limit = 20;
        message = "Admin Rate Limit Exceeded (20 req/min). Slow down";
        break;
      case "teacher":
      case "student":
        limit = 10;
        message = "Teacher Rate Limit Exceeded (10 req/min), please wait.";
        break;
      case "guest":
        limit = 5;
        message =
          "Guest Rate Limit Exceeded (5 req/min), please sign up for higher limits.";
        break;
    }

    const client = aj.withRule(
      slidingWindow({
        mode: "LIVE",
        interval: "1m",
        max: limit,
      }),
    );
    const arcjetRequest: ArcjetNodeRequest = {
      headers: req.headers,
      method: req.method,
      url: req.originalUrl ?? req.url,
      socket: {
        remoteAddress: req.socket.remoteAddress ?? req.ip ?? "0.0.0.0",
      },
    };

    const decision = await client.protect(arcjetRequest);

    if (decision.isDenied() && decision.reason.isBot()) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Automated requests are not allowed on this platform",
      });
    }
    if (decision.isDenied() && decision.reason.isShield()) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Request blocked by security policy",
      });
    }
    if (decision.isDenied() && decision.reason.isRateLimit()) {
      return res.status(403).json({
        error: "Too many requests",
        message,
      });
    }

    next();
  } catch (e) {
    console.log("Arcjet middleware error: ", e);
    res.status(500).json({
      error: "Internal Error",
      message: "Something went wrong with security middleware",
    });
  }
};

export default securityMiddleware;
