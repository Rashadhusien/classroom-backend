import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getClassDetails = async (classId: number) => {
  const [classDetails] = await db
    .select({
      ...getTableColumns(classes),
      subject: { ...getTableColumns(subjects) },
      department: { ...getTableColumns(departments) },
      teacher: { ...getTableColumns(user) },
      totalEnrollments: sql<number>`count(distinct ${enrollments.id})`,
      totalLectures: sql<number>`count(distinct ${lectures.id})`,
    })
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .leftJoin(user, eq(classes.teacherId, user.id))
    .leftJoin(enrollments, eq(enrollments.classId, classes.id))
    .leftJoin(lectures, eq(lectures.classId, classes.id))
    .where(eq(classes.id, classId))
    .groupBy(classes.id, subjects.id, departments.id, user.id);

  return classDetails;
};

// ─── GET / — paginated list with search & filters ────────────────────────────

router.get("/", async (req, res) => {
  try {
    const {
      search,
      subject,
      teacher,
      status,
      page = 1,
      limit = 10,
    } = req.query;

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.min(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    );
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (search) {
      filterConditions.push(
        or(
          ilike(classes.name, `%${search}%`),
          ilike(classes.inviteCode, `%${search}%`),
        ),
      );
    }

    if (subject) {
      filterConditions.push(
        ilike(subjects.name, `%${String(subject).replace(/[%_]/g, "\\$&")}%`),
      );
    }

    if (teacher) {
      filterConditions.push(
        ilike(user.name, `%${String(teacher).replace(/[%_]/g, "\\$&")}%`),
      );
    }

    if (status) {
      filterConditions.push(eq(classes.status, status as any));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause);

    const totalCount = countResult?.count ?? 0;

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        teacher: { ...getTableColumns(user) },
        totalEnrollments: sql<number>`count(distinct ${enrollments.id})`,
        totalLectures: sql<number>`count(distinct ${lectures.id})`,
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .leftJoin(enrollments, eq(enrollments.classId, classes.id))
      .leftJoin(lectures, eq(lectures.classId, classes.id))
      .where(whereClause)
      .groupBy(classes.id, subjects.id, user.id)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`GET /classes error: ${e}`);
    res.status(500).json({ error: "Failed to get classes" });
  }
});

// ─── GET /:id — class detail with relations & counts ─────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const classDetails = await getClassDetails(classId);

    if (!classDetails) {
      return res.status(404).json({ error: "Class not found" });
    }

    res.status(200).json({ data: classDetails });
  } catch (e) {
    console.error(`GET /classes/:id error: ${e}`);
    res.status(500).json({ error: "Failed to get class" });
  }
});

// ─── GET /:id/enrollments — students enrolled in a class ─────────────────────

router.get("/:id/enrollments", async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const { page = 1, limit = 10 } = req.query;

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);
    const offset = (currentPage - 1) * limitPerPage;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.classId, classId));

    const totalCount = countResult?.count ?? 0;

    const studentList = await db
      .select({
        enrollmentId: enrollments.id,
        student: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          imageCldPubId: user.imageCldPubId,
        },
      })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .where(eq(enrollments.classId, classId))
      .orderBy(desc(enrollments.id))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: studentList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`GET /classes/:id/enrollments error: ${e}`);
    res.status(500).json({ error: "Failed to get class enrollments" });
  }
});

// ─── GET /:id/lectures — published lectures for a class ──────────────────────
// Accepts ?published=true|false to filter. Default returns all for dashboard.

router.get("/:id/lectures", async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const { published, page = 1, limit = 50 } = req.query;

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.min(Math.max(1, +limit), 200);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [eq(lectures.classId, classId)];

    if (published === "true") {
      filterConditions.push(eq(lectures.isPublished, true));
    } else if (published === "false") {
      filterConditions.push(eq(lectures.isPublished, false));
    }

    const whereClause = and(...filterConditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(lectures)
      .where(whereClause);

    const totalCount = countResult?.count ?? 0;

    const lecturesList = await db
      .select({
        ...getTableColumns(lectures),
        totalContents: sql<number>`count(${lectureContents.id})`,
        videoCount: sql<number>`count(case when ${lectureContents.type} = 'video' then 1 end)`,
        imageCount: sql<number>`count(case when ${lectureContents.type} = 'image' then 1 end)`,
        documentCount: sql<number>`count(case when ${lectureContents.type} = 'document' then 1 end)`,
      })
      .from(lectures)
      .leftJoin(lectureContents, eq(lectureContents.lectureId, lectures.id))
      .where(whereClause)
      .groupBy(lectures.id)
      .orderBy(lectures.order, lectures.createdAt)
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: lecturesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`GET /classes/:id/lectures error: ${e}`);
    res.status(500).json({ error: "Failed to get class lectures" });
  }
});

// ─── POST / — create a class ─────────────────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const {
      subjectId,
      teacherId,
      name,
      description,
      capacity,
      status,
      schedules,
      bannerUrl,
      bannerCldPubId,
    } = req.body;

    if (!subjectId || !teacherId || !name) {
      return res
        .status(400)
        .json({ error: "subjectId, teacherId, and name are required" });
    }

    // Generate a short unique invite code
    const inviteCode = Math.random().toString(36).substring(2, 9);

    const [createdClass] = await db
      .insert(classes)
      .values({
        subjectId,
        teacherId,
        name,
        description,
        capacity: capacity ?? 50,
        status: status ?? "active",
        schedules: schedules ?? [],
        inviteCode,
        bannerUrl,
        bannerCldPubId,
      })
      .returning({ id: classes.id });

    if (!createdClass) {
      return res.status(500).json({ error: "Failed to create class" });
    }

    const classDetails = await getClassDetails(createdClass.id);

    res.status(201).json({ data: classDetails });
  } catch (e) {
    console.error(`POST /classes error: ${e}`);
    res.status(500).json({ error: "Failed to create class" });
  }
});

// ─── PUT /:id — update a class ────────────────────────────────────────────────

router.put("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const [existing] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId));

    if (!existing) {
      return res.status(404).json({ error: "Class not found" });
    }

    const {
      subjectId,
      teacherId,
      name,
      description,
      capacity,
      status,
      schedules,
      bannerUrl,
      bannerCldPubId,
      inviteCode,
    } = req.body;

    const [updated] = await db
      .update(classes)
      .set({
        ...(subjectId !== undefined && { subjectId }),
        ...(teacherId !== undefined && { teacherId }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(capacity !== undefined && { capacity }),
        ...(status !== undefined && { status }),
        ...(schedules !== undefined && { schedules }),
        ...(bannerUrl !== undefined && { bannerUrl }),
        ...(bannerCldPubId !== undefined && { bannerCldPubId }),
        ...(inviteCode !== undefined && { inviteCode }),
      })
      .where(eq(classes.id, classId))
      .returning({ id: classes.id });

    if (!updated) {
      return res.status(500).json({ error: "Failed to update class" });
    }

    const classDetails = await getClassDetails(classId);

    res.status(200).json({ data: classDetails });
  } catch (e) {
    console.error(`PUT /classes/:id error: ${e}`);
    res.status(500).json({ error: "Failed to update class" });
  }
});

// ─── DELETE /:id — delete a class ────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const classId = Number(req.params.id);

    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: "Invalid class id" });
    }

    const [existing] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, classId));

    if (!existing) {
      return res.status(404).json({ error: "Class not found" });
    }

    // enrollments and lectures cascade-delete via FK onDelete: cascade
    const [deleted] = await db
      .delete(classes)
      .where(eq(classes.id, classId))
      .returning({ id: classes.id });

    if (!deleted) {
      return res.status(500).json({ error: "Failed to delete class" });
    }

    res.status(200).json({
      message: "Class deleted successfully",
      data: { id: deleted.id },
    });
  } catch (e) {
    console.error(`DELETE /classes/:id error: ${e}`);
    res.status(500).json({ error: "Failed to delete class" });
  }
});

export default router;
