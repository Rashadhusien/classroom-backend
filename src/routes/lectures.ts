import express from "express";
import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { classes, lectureContents, lectures } from "../db/schema/app.js";
// import { betterAuthMiddleware } from "../middleware/auth.js";
// import { requireEnrollment } from "../middleware/requireEnrollment.js";

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getLectureDetails = async (lectureId: number) => {
  const [lecture] = await db
    .select({
      ...getTableColumns(lectures),
      totalContents: sql<number>`count(${lectureContents.id})`,
      videoCount: sql<number>`count(case when ${lectureContents.type} = 'video' then 1 end)`,
      imageCount: sql<number>`count(case when ${lectureContents.type} = 'image' then 1 end)`,
      documentCount: sql<number>`count(case when ${lectureContents.type} = 'document' then 1 end)`,
    })
    .from(lectures)
    .leftJoin(lectureContents, eq(lectureContents.lectureId, lectures.id))
    .where(eq(lectures.id, lectureId))
    .groupBy(lectures.id);

  return lecture;
};

// ─── GET / — list lectures for a class ───────────────────────────────────────
// Required query: ?classId=:id

router.get("/", async (req, res) => {
  try {
    const { classId, published, page = 1, limit = 50 } = req.query;

    if (!classId) {
      return res.status(400).json({ error: "classId query param is required" });
    }

    const parsedClassId = Number(classId);
    if (!Number.isFinite(parsedClassId)) {
      return res.status(400).json({ error: "Invalid classId" });
    }

    // Verify the class exists
    const [classRecord] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, parsedClassId));

    if (!classRecord) {
      return res.status(404).json({ error: "Class not found" });
    }

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.min(Math.max(1, +limit), 200);
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [eq(lectures.classId, parsedClassId)];

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
      .orderBy(asc(lectures.order), asc(lectures.createdAt))
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
    console.error(`GET /lectures error: ${e}`);
    res.status(500).json({ error: "Failed to get lectures" });
  }
});

// ─── GET /:id — single lecture with all content items ────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const lectureId = Number(req.params.id);

    if (!Number.isFinite(lectureId)) {
      return res.status(400).json({ error: "Invalid lecture id" });
    }

    const lecture = await getLectureDetails(lectureId);

    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    // Fetch all content items ordered by their display order
    const contents = await db
      .select({ ...getTableColumns(lectureContents) })
      .from(lectureContents)
      .where(eq(lectureContents.lectureId, lectureId))
      .orderBy(asc(lectureContents.order), asc(lectureContents.createdAt));

    res.status(200).json({ data: { ...lecture, contents } });
  } catch (e) {
    console.error(`GET /lectures/:id error: ${e}`);
    res.status(500).json({ error: "Failed to get lecture" });
  }
});

// ─── POST / — create a lecture ────────────────────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const { classId, title, description, order, isPublished } = req.body;

    if (!classId || !title) {
      return res.status(400).json({ error: "classId and title are required" });
    }

    const parsedClassId = Number(classId);
    if (!Number.isFinite(parsedClassId)) {
      return res.status(400).json({ error: "Invalid classId" });
    }

    // Verify the class exists
    const [classRecord] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.id, parsedClassId));

    if (!classRecord) {
      return res.status(404).json({ error: "Class not found" });
    }

    // Auto-assign order if not provided: place at end of existing lectures
    let resolvedOrder = order;
    if (resolvedOrder === undefined || resolvedOrder === null) {
      const [maxOrder] = await db
        .select({ max: sql<number>`coalesce(max(${lectures.order}), -1)` })
        .from(lectures)
        .where(eq(lectures.classId, parsedClassId));
      resolvedOrder = (maxOrder?.max ?? -1) + 1;
    }

    const [created] = await db
      .insert(lectures)
      .values({
        classId: parsedClassId,
        title,
        description,
        order: resolvedOrder,
        isPublished: isPublished ?? false,
      })
      .returning({ id: lectures.id });

    if (!created) {
      return res.status(500).json({ error: "Failed to create lecture" });
    }

    const lecture = await getLectureDetails(created.id);

    res.status(201).json({ data: lecture });
  } catch (e) {
    console.error(`POST /lectures error: ${e}`);
    res.status(500).json({ error: "Failed to create lecture" });
  }
});

// ─── PUT /:id — update a lecture ──────────────────────────────────────────────

router.put("/:id", async (req, res) => {
  try {
    const lectureId = Number(req.params.id);

    if (!Number.isFinite(lectureId)) {
      return res.status(400).json({ error: "Invalid lecture id" });
    }

    const [existing] = await db
      .select({ id: lectures.id })
      .from(lectures)
      .where(eq(lectures.id, lectureId));

    if (!existing) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    const { title, description, order, isPublished } = req.body;

    const [updated] = await db
      .update(lectures)
      .set({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
        ...(isPublished !== undefined && { isPublished }),
      })
      .where(eq(lectures.id, lectureId))
      .returning({ id: lectures.id });

    if (!updated) {
      return res.status(500).json({ error: "Failed to update lecture" });
    }

    const lecture = await getLectureDetails(lectureId);

    res.status(200).json({ data: lecture });
  } catch (e) {
    console.error(`PUT /lectures/:id error: ${e}`);
    res.status(500).json({ error: "Failed to update lecture" });
  }
});

// ─── PATCH /:id/publish — toggle published state ──────────────────────────────
// Convenience endpoint used by the dashboard's inline toggle in the lecture list.

router.patch("/:id/publish", async (req, res) => {
  try {
    const lectureId = Number(req.params.id);

    if (!Number.isFinite(lectureId)) {
      return res.status(400).json({ error: "Invalid lecture id" });
    }

    const [existing] = await db
      .select({ id: lectures.id, isPublished: lectures.isPublished })
      .from(lectures)
      .where(eq(lectures.id, lectureId));

    if (!existing) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    const [updated] = await db
      .update(lectures)
      .set({ isPublished: !existing.isPublished })
      .where(eq(lectures.id, lectureId))
      .returning({ id: lectures.id, isPublished: lectures.isPublished });

    res.status(200).json({ data: updated });
  } catch (e) {
    console.error(`PATCH /lectures/:id/publish error: ${e}`);
    res.status(500).json({ error: "Failed to toggle publish state" });
  }
});

// ─── DELETE /:id — delete a lecture (contents cascade) ───────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const lectureId = Number(req.params.id);

    if (!Number.isFinite(lectureId)) {
      return res.status(400).json({ error: "Invalid lecture id" });
    }

    const [existing] = await db
      .select({ id: lectures.id })
      .from(lectures)
      .where(eq(lectures.id, lectureId));

    if (!existing) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    // lecture_contents rows cascade-delete via FK onDelete: cascade
    const [deleted] = await db
      .delete(lectures)
      .where(eq(lectures.id, lectureId))
      .returning({ id: lectures.id });

    if (!deleted) {
      return res.status(500).json({ error: "Failed to delete lecture" });
    }

    res.status(200).json({
      message: "Lecture deleted successfully",
      data: { id: deleted.id },
    });
  } catch (e) {
    console.error(`DELETE /lectures/:id error: ${e}`);
    res.status(500).json({ error: "Failed to delete lecture" });
  }
});

export default router;
