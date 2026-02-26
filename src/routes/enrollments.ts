import express from "express";
import { and, eq, getTableColumns } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  classes,
  departments,
  enrollments,
  subjects,
  user,
} from "../db/schema/index.js";
import { betterAuthMiddleware } from "../middleware/auth.js";
import { requireTeacherOrAdmin } from "../middleware/requireTeacher.js";

const router = express.Router();

const getEnrollmentDetails = async (enrollmentId: number) => {
  const [enrollment] = await db
    .select({
      ...getTableColumns(enrollments),
      class: {
        ...getTableColumns(classes),
      },
      subject: {
        ...getTableColumns(subjects),
      },
      department: {
        ...getTableColumns(departments),
      },
      teacher: {
        ...getTableColumns(user),
      },
    })
    .from(enrollments)
    .leftJoin(classes, eq(enrollments.classId, classes.id))
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .leftJoin(user, eq(classes.teacherId, user.id))
    .where(eq(enrollments.classId, enrollmentId));

  return enrollment;
};

// Create enrollment
router.post(
  "/",
  betterAuthMiddleware,
  requireTeacherOrAdmin,
  async (req, res) => {
    try {
      const { classId, studentId } = req.body;

      if (!classId || !studentId) {
        return res
          .status(400)
          .json({ error: "classId and studentId are required" });
      }

      const [classRecord] = await db
        .select()
        .from(classes)
        .where(eq(classes.id, classId));

      if (!classRecord)
        return res.status(404).json({ error: "Class not found" });

      const [student] = await db
        .select()
        .from(user)
        .where(eq(user.id, studentId));

      if (!student) return res.status(404).json({ error: "Student not found" });

      const [existingEnrollment] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, classId),
            eq(enrollments.studentId, studentId),
          ),
        );

      if (existingEnrollment)
        return res
          .status(409)
          .json({ error: "Student already enrolled in class" });

      const [createdEnrollment] = await db
        .insert(enrollments)
        .values({ classId, studentId })
        .returning();

      if (!createdEnrollment)
        return res.status(500).json({ error: "Failed to create enrollment" });

      const enrollment = await getEnrollmentDetails(classId);

      res.status(201).json({ data: enrollment });
    } catch (error) {
      console.error("POST /enrollments error:", error);
      res.status(500).json({ error: "Failed to create enrollment" });
    }
  },
);

// Join class by invite code
router.post("/join", async (req, res) => {
  try {
    const { inviteCode, studentId } = req.body;

    if (!inviteCode || !studentId) {
      return res
        .status(400)
        .json({ error: "inviteCode and studentId are required" });
    }

    const [classRecord] = await db
      .select()
      .from(classes)
      .where(eq(classes.inviteCode, inviteCode));

    if (!classRecord) return res.status(404).json({ error: "Class not found" });

    const [student] = await db
      .select()
      .from(user)
      .where(eq(user.id, studentId));

    if (!student) return res.status(404).json({ error: "Student not found" });

    const [existingEnrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.classId, classRecord.id),
          eq(enrollments.studentId, studentId),
        ),
      );

    if (existingEnrollment)
      return res
        .status(409)
        .json({ error: "Student already enrolled in class" });

    const [createdEnrollment] = await db
      .insert(enrollments)
      .values({ classId: classRecord.id, studentId })
      .returning();

    if (!createdEnrollment)
      return res.status(500).json({ error: "Failed to join class" });

    const enrollment = await getEnrollmentDetails(classRecord.id);

    res.status(201).json({ data: enrollment });
  } catch (error) {
    console.error("POST /enrollments/join error:", error);
    res.status(500).json({ error: "Failed to join class" });
  }
});

// Get all enrollments (admin only)
router.get("/", async (req, res) => {
  try {
    // Use separate queries to avoid alias conflicts
    const enrollmentsData = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        classId: enrollments.classId,
      })
      .from(enrollments);

    // Get all related data separately and combine
    const enrichedEnrollments = await Promise.all(
      enrollmentsData.map(async (enrollment) => {
        const [student] = await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            image: user.image,
          })
          .from(user)
          .where(eq(user.id, enrollment.studentId));

        const [classRecord] = await db
          .select()
          .from(classes)
          .where(eq(classes.id, enrollment.classId));

        let subject = null;
        let department = null;
        let teacher = null;

        if (classRecord) {
          [subject] = await db
            .select()
            .from(subjects)
            .where(eq(subjects.id, classRecord.subjectId));
        }

        if (subject) {
          [department] = await db
            .select()
            .from(departments)
            .where(eq(departments.id, subject.departmentId));
        }

        if (classRecord) {
          [teacher] = await db
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              image: user.image,
            })
            .from(user)
            .where(eq(user.id, classRecord.teacherId));
        }

        return {
          ...enrollment,
          student,
          class: classRecord,
          subject,
          department,
          teacher,
        };
      }),
    );

    res.status(200).json({ data: enrichedEnrollments });
  } catch (error) {
    console.error("GET /enrollments error:", error);
    res.status(500).json({ error: "Failed to fetch enrollments" });
  }
});

// Get current user's enrollments (student only)
router.get("/me", async (req, res) => {
  try {
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ error: "studentId is required" });
    }

    // Use separate queries to avoid alias conflicts
    const enrollmentsData = await db
      .select({
        id: enrollments.id,
        studentId: enrollments.studentId,
        classId: enrollments.classId,
      })
      .from(enrollments)
      .where(eq(enrollments.studentId, studentId as string));

    // Get all related data separately and combine
    const enrichedEnrollments = await Promise.all(
      enrollmentsData.map(async (enrollment) => {
        const [student] = await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            image: user.image,
          })
          .from(user)
          .where(eq(user.id, enrollment.studentId));

        const [classRecord] = await db
          .select()
          .from(classes)
          .where(eq(classes.id, enrollment.classId));

        let subject = null;
        let department = null;
        let teacher = null;

        if (classRecord) {
          [subject] = await db
            .select()
            .from(subjects)
            .where(eq(subjects.id, classRecord.subjectId));
        }

        if (subject) {
          [department] = await db
            .select()
            .from(departments)
            .where(eq(departments.id, subject.departmentId));
        }

        if (classRecord) {
          [teacher] = await db
            .select({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              image: user.image,
            })
            .from(user)
            .where(eq(user.id, classRecord.teacherId));
        }

        return {
          ...enrollment,
          student,
          class: classRecord,
          subject,
          department,
          teacher,
        };
      }),
    );

    res.status(200).json({ data: enrichedEnrollments });
  } catch (error) {
    console.error("GET /enrollments/me error:", error);
    res.status(500).json({ error: "Failed to fetch student enrollments" });
  }
});

// Delete enrollment
router.delete(
  "/:id",
  betterAuthMiddleware,
  requireTeacherOrAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const enrollmentId = parseInt(id as string);

      if (isNaN(enrollmentId)) {
        return res.status(400).json({ error: "Invalid enrollment ID" });
      }

      const [existingEnrollment] = await db
        .select()
        .from(enrollments)
        .where(eq(enrollments.id, enrollmentId));

      if (!existingEnrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      const [deletedEnrollment] = await db
        .delete(enrollments)
        .where(eq(enrollments.id, enrollmentId))
        .returning({ id: enrollments.id });

      if (!deletedEnrollment) {
        return res.status(500).json({ error: "Failed to delete enrollment" });
      }

      res.status(200).json({
        message: "Enrollment deleted successfully",
        data: { id: deletedEnrollment.id },
      });
    } catch (error) {
      console.error("DELETE /enrollments/:id error:", error);
      res.status(500).json({ error: "Failed to delete enrollment" });
    }
  },
);

export default router;
