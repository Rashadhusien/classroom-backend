import express from "express";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  classes,
  departments,
  enrollments,
  lectureContents,
  lectures,
  subjects,
} from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";

const router = express.Router();

// ─── GET /overview — counts for all core entities ────────────────────────────

router.get("/overview", async (req, res) => {
  try {
    const [
      usersCount,
      studentsCount,
      teachersCount,
      adminsCount,
      departmentsCount,
      subjectsCount,
      classesCount,
      activeClassesCount,
      enrollmentsCount,
      lecturesCount,
      publishedLecturesCount,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(user),
      db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.role, "student")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.role, "teacher")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.role, "admin")),
      db.select({ count: sql<number>`count(*)` }).from(departments),
      db.select({ count: sql<number>`count(*)` }).from(subjects),
      db.select({ count: sql<number>`count(*)` }).from(classes),
      db
        .select({ count: sql<number>`count(*)` })
        .from(classes)
        .where(eq(classes.status, "active")),
      db.select({ count: sql<number>`count(*)` }).from(enrollments),
      db.select({ count: sql<number>`count(*)` }).from(lectures),
      db
        .select({ count: sql<number>`count(*)` })
        .from(lectures)
        .where(eq(lectures.isPublished, true)),
    ]);

    res.status(200).json({
      data: {
        users: {
          total: usersCount[0]?.count ?? 0,
          students: studentsCount[0]?.count ?? 0,
          teachers: teachersCount[0]?.count ?? 0,
          admins: adminsCount[0]?.count ?? 0,
        },
        departments: departmentsCount[0]?.count ?? 0,
        subjects: subjectsCount[0]?.count ?? 0,
        classes: {
          total: classesCount[0]?.count ?? 0,
          active: activeClassesCount[0]?.count ?? 0,
        },
        enrollments: enrollmentsCount[0]?.count ?? 0,
        lectures: {
          total: lecturesCount[0]?.count ?? 0,
          published: publishedLecturesCount[0]?.count ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("GET /stats/overview error:", error);
    res.status(500).json({ error: "Failed to fetch overview stats" });
  }
});

// ─── GET /latest — recent activity for dashboard home ────────────────────────

router.get("/latest", async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const limitPerPage = Math.min(Math.max(1, +limit), 50);

    const [latestClasses, latestTeachers, latestEnrollments, latestLectures] =
      await Promise.all([
        // Latest classes with subject and teacher
        db
          .select({
            ...getTableColumns(classes),
            subject: { ...getTableColumns(subjects) },
            teacher: { ...getTableColumns(user) },
          })
          .from(classes)
          .leftJoin(subjects, eq(classes.subjectId, subjects.id))
          .leftJoin(user, eq(classes.teacherId, user.id))
          .orderBy(desc(classes.createdAt))
          .limit(limitPerPage),

        // Latest teacher accounts
        db
          .select()
          .from(user)
          .where(eq(user.role, "teacher"))
          .orderBy(desc(user.createdAt))
          .limit(limitPerPage),

        // Latest enrollments with student and class info
        db
          .select({
            id: enrollments.id,
            studentId: enrollments.studentId,
            classId: enrollments.classId,
            student: {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
            },
            class: {
              id: classes.id,
              name: classes.name,
              inviteCode: classes.inviteCode,
            },
          })
          .from(enrollments)
          .leftJoin(user, eq(enrollments.studentId, user.id))
          .leftJoin(classes, eq(enrollments.classId, classes.id))
          .orderBy(desc(enrollments.id))
          .limit(limitPerPage),

        // Latest published lectures with class info
        db
          .select({
            ...getTableColumns(lectures),
            class: {
              id: classes.id,
              name: classes.name,
            },
            totalContents: sql<number>`count(${lectureContents.id})`,
          })
          .from(lectures)
          .leftJoin(classes, eq(lectures.classId, classes.id))
          .leftJoin(lectureContents, eq(lectureContents.lectureId, lectures.id))
          .where(eq(lectures.isPublished, true))
          .groupBy(lectures.id, classes.id)
          .orderBy(desc(lectures.createdAt))
          .limit(limitPerPage),
      ]);

    res.status(200).json({
      data: {
        latestClasses,
        latestTeachers,
        latestEnrollments,
        latestLectures,
      },
    });
  } catch (error) {
    console.error("GET /stats/latest error:", error);
    res.status(500).json({ error: "Failed to fetch latest stats" });
  }
});

// ─── GET /charts — aggregated data for dashboard charts ──────────────────────

router.get("/charts", async (req, res) => {
  try {
    const [
      usersByRole,
      subjectsByDepartment,
      classesBySubject,
      enrollmentsByClass,
      lecturesByClass,
      contentByType,
    ] = await Promise.all([
      // Users grouped by role
      db
        .select({
          role: user.role,
          total: sql<number>`count(*)`,
        })
        .from(user)
        .groupBy(user.role),

      // Subject count per department
      db
        .select({
          departmentId: departments.id,
          departmentName: departments.name,
          departmentCode: departments.code,
          totalSubjects: sql<number>`count(${subjects.id})`,
        })
        .from(departments)
        .leftJoin(subjects, eq(subjects.departmentId, departments.id))
        .groupBy(departments.id),

      // Class count per subject
      db
        .select({
          subjectId: subjects.id,
          subjectName: subjects.name,
          subjectCode: subjects.code,
          totalClasses: sql<number>`count(${classes.id})`,
        })
        .from(subjects)
        .leftJoin(classes, eq(classes.subjectId, subjects.id))
        .groupBy(subjects.id),

      // Enrollment count per class (top 10 most enrolled)
      db
        .select({
          classId: classes.id,
          className: classes.name,
          capacity: classes.capacity,
          totalEnrollments: sql<number>`count(${enrollments.id})`,
        })
        .from(classes)
        .leftJoin(enrollments, eq(enrollments.classId, classes.id))
        .groupBy(classes.id)
        .orderBy(sql`count(${enrollments.id}) desc`)
        .limit(10),

      // Lecture count per class
      db
        .select({
          classId: classes.id,
          className: classes.name,
          totalLectures: sql<number>`count(${lectures.id})`,
          publishedLectures: sql<number>`count(case when ${lectures.isPublished} = true then 1 end)`,
        })
        .from(classes)
        .leftJoin(lectures, eq(lectures.classId, classes.id))
        .groupBy(classes.id)
        .orderBy(sql`count(${lectures.id}) desc`)
        .limit(10),

      // Content items grouped by type (across all lectures)
      db
        .select({
          type: lectureContents.type,
          total: sql<number>`count(*)`,
        })
        .from(lectureContents)
        .groupBy(lectureContents.type),
    ]);

    res.status(200).json({
      data: {
        usersByRole,
        subjectsByDepartment,
        classesBySubject,
        enrollmentsByClass,
        lecturesByClass,
        contentByType,
      },
    });
  } catch (error) {
    console.error("GET /stats/charts error:", error);
    res.status(500).json({ error: "Failed to fetch chart stats" });
  }
});

export default router;
