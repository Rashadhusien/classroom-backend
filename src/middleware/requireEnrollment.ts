import { NextFunction, Request, Response } from "express";
import { db } from "../db/index.js";
import { enrollments, classes } from "../db/schema/app.js";
import { eq, and } from "drizzle-orm";

export const requireEnrollment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const classId = req.query.classId || req.params.classId || req.params.id;

    if (!classId) {
      return res.status(400).json({ error: "Class ID is required" });
    }

    const parsedClassId = Number(classId);
    if (!Number.isFinite(parsedClassId)) {
      return res.status(400).json({ error: "Invalid class ID" });
    }

    const { id: userId, role } = req.user;

    if (role === "admin") {
      req.classId = parsedClassId;
      return next();
    }

    if (role === "teacher") {
      const [classRecord] = await db
        .select({ teacherId: classes.teacherId })
        .from(classes)
        .where(eq(classes.id, parsedClassId));

      if (classRecord?.teacherId === userId) {
        req.classId = parsedClassId;
        return next();
      }

      return res.status(403).json({ error: "Not your class" });
    }

    if (role === "student") {
      const [enrollment] = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, parsedClassId),
            eq(enrollments.studentId, userId),
          ),
        );

      if (enrollment) {
        req.classId = parsedClassId;
        return next();
      }

      return res.status(403).json({ error: "You are not enrolled" });
    }

    return res.status(403).json({ error: "Access denied" });
  } catch (error) {
    console.error("Enrollment check error:", error);
    return res.status(500).json({ error: "Failed to verify enrollment" });
  }
};
