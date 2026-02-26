import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes, lectures } from "../db/schema/app.js";

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

    // For POST requests to lecture-content, get classId from lectureId
    if (req.path.includes("lecture-content") && req.method === "POST") {
      const lectureId = req.body.lectureId;

      if (!lectureId) {
        return res.status(400).json({ error: "Lecture ID is required" });
      }

      // Get the lecture to find the classId
      const [lectureRecord] = await db
        .select({ classId: lectures.classId })
        .from(lectures)
        .where(eq(lectures.id, Number(lectureId)));

      if (!lectureRecord) {
        return res.status(404).json({ error: "Lecture not found" });
      }

      req.classId = lectureRecord.classId;
    } else {
      // For other requests, classId comes from body, query, or params
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

      req.classId = parsedClassId;
    }

    // Admins can access any class
    if (role === "admin") {
      return next();
    }

    // Teachers can only access their own classes
    if (role === "teacher") {
      const [classRecord] = await db
        .select({ teacherId: classes.teacherId })
        .from(classes)
        .where(eq(classes.id, req.classId!));

      if (classRecord?.teacherId === userId) {
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
