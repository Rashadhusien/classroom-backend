import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes } from "../db/schema/app.js";

export const requireTeacherOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id: userId, role } = req.user;

    // Allow admins and teachers
    if (role === "admin" || role === "teacher") {
      return next();
    }

    // Students are not allowed to perform these actions
    return res.status(403).json({
      error: "Access denied. Only teachers and admins can perform this action.",
    });
  } catch (error) {
    console.error("Teacher role check error:", error);
    return res.status(500).json({ error: "Failed to verify permissions" });
  }
};

export const requireClassTeacherOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id: userId, role } = req.user;
    // For POST requests, classId comes from body; for GET requests, it comes from query/params
    const classId =
      req.body.classId ||
      req.query.classId ||
      req.params.classId ||
      req.params.id;

    if (!classId) {
      return res.status(400).json({ error: "Class ID is required" });
    }

    const parsedClassId = Number(classId);
    if (!Number.isFinite(parsedClassId)) {
      return res.status(400).json({ error: "Invalid class ID" });
    }

    // Admins can access any class
    if (role === "admin") {
      req.classId = parsedClassId;
      return next();
    }

    // Teachers can only access their own classes
    if (role === "teacher") {
      const [classRecord] = await db
        .select({ teacherId: classes.teacherId })
        .from(classes)
        .where(eq(classes.id, parsedClassId));

      if (classRecord?.teacherId === userId) {
        req.classId = parsedClassId;
        return next();
      }

      return res.status(403).json({
        error: "Access denied. You can only modify your own classes.",
      });
    }

    // Students are not allowed to modify classes
    return res.status(403).json({
      error: "Access denied. Only teachers and admins can modify classes.",
    });
  } catch (error) {
    console.error("Class teacher check error:", error);
    return res.status(500).json({ error: "Failed to verify permissions" });
  }
};
