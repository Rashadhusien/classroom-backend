import express from "express";
import { asc, eq, getTableColumns, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { lectureContents, lectures } from "../db/schema/app.js";
import { requireEnrollment } from "../middleware/requireEnrollment.js";

const router = express.Router();

// ─── GET / — list all content items for a lecture ────────────────────────────
// Required query: ?lectureId=:id

router.get("/", async (req, res) => {
  try {
    const { lectureId } = req.query;

    if (!lectureId) {
      return res
        .status(400)
        .json({ error: "lectureId query param is required" });
    }

    const parsedLectureId = Number(lectureId);
    if (!Number.isFinite(parsedLectureId)) {
      return res.status(400).json({ error: "Invalid lectureId" });
    }

    const [lectureRecord] = await db
      .select({ id: lectures.id })
      .from(lectures)
      .where(eq(lectures.id, parsedLectureId));

    if (!lectureRecord) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    const contents = await db
      .select({ ...getTableColumns(lectureContents) })
      .from(lectureContents)
      .where(eq(lectureContents.lectureId, parsedLectureId))
      .orderBy(asc(lectureContents.order), asc(lectureContents.createdAt));

    res.status(200).json({ data: contents });
  } catch (e) {
    console.error(`GET /lecture-contents error: ${e}`);
    res.status(500).json({ error: "Failed to get lecture contents" });
  }
});

// ─── GET /:id — single content item ──────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const contentId = Number(req.params.id);

    if (!Number.isFinite(contentId)) {
      return res.status(400).json({ error: "Invalid content id" });
    }

    const [content] = await db
      .select({ ...getTableColumns(lectureContents) })
      .from(lectureContents)
      .where(eq(lectureContents.id, contentId));

    if (!content) {
      return res.status(404).json({ error: "Content item not found" });
    }

    res.status(200).json({ data: content });
  } catch (e) {
    console.error(`GET /lecture-contents/:id error: ${e}`);
    res.status(500).json({ error: "Failed to get content item" });
  }
});

// ─── POST / — add a content item to a lecture ────────────────────────────────

router.post("/", async (req, res) => {
  try {
    const {
      lectureId,
      type,
      title,
      url,
      cldPubId,
      mimeType,
      sizeBytes,
      order,
    } = req.body;

    if (!lectureId || !type || !title || !url) {
      return res
        .status(400)
        .json({ error: "lectureId, type, title, and url are required" });
    }

    const parsedLectureId = Number(lectureId);
    if (!Number.isFinite(parsedLectureId)) {
      return res.status(400).json({ error: "Invalid lectureId" });
    }

    if (!["video", "image", "document"].includes(type)) {
      return res
        .status(400)
        .json({ error: "type must be video, image, or document" });
    }

    const [lectureRecord] = await db
      .select({ id: lectures.id })
      .from(lectures)
      .where(eq(lectures.id, parsedLectureId));

    if (!lectureRecord) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    // Auto-assign order if not provided: place at end
    let resolvedOrder = order;
    if (resolvedOrder === undefined || resolvedOrder === null) {
      const [maxOrder] = await db
        .select({
          max: sql<number>`coalesce(max(${lectureContents.order}), -1)`,
        })
        .from(lectureContents)
        .where(eq(lectureContents.lectureId, parsedLectureId));
      resolvedOrder = (maxOrder?.max ?? -1) + 1;
    }

    const [created] = await db
      .insert(lectureContents)
      .values({
        lectureId: parsedLectureId,
        type,
        title,
        url,
        cldPubId,
        mimeType,
        sizeBytes,
        order: resolvedOrder,
      })
      .returning({ ...getTableColumns(lectureContents) });

    if (!created) {
      return res.status(500).json({ error: "Failed to create content item" });
    }

    res.status(201).json({ data: created });
  } catch (e) {
    console.error(`POST /lecture-contents error: ${e}`);
    res.status(500).json({ error: "Failed to create content item" });
  }
});

// ─── PUT /:id — update a content item ────────────────────────────────────────

router.put("/:id", async (req, res) => {
  try {
    const contentId = Number(req.params.id);

    if (!Number.isFinite(contentId)) {
      return res.status(400).json({ error: "Invalid content id" });
    }

    const [existing] = await db
      .select({ id: lectureContents.id })
      .from(lectureContents)
      .where(eq(lectureContents.id, contentId));

    if (!existing) {
      return res.status(404).json({ error: "Content item not found" });
    }

    const { title, url, cldPubId, mimeType, sizeBytes, order } = req.body;

    // Note: type is intentionally excluded — changing type would require
    // re-validation of url/cldPubId. Delete and re-create instead.
    const [updated] = await db
      .update(lectureContents)
      .set({
        ...(title !== undefined && { title }),
        ...(url !== undefined && { url }),
        ...(cldPubId !== undefined && { cldPubId }),
        ...(mimeType !== undefined && { mimeType }),
        ...(sizeBytes !== undefined && { sizeBytes }),
        ...(order !== undefined && { order }),
      })
      .where(eq(lectureContents.id, contentId))
      .returning({ ...getTableColumns(lectureContents) });

    if (!updated) {
      return res.status(500).json({ error: "Failed to update content item" });
    }

    res.status(200).json({ data: updated });
  } catch (e) {
    console.error(`PUT /lecture-contents/:id error: ${e}`);
    res.status(500).json({ error: "Failed to update content item" });
  }
});

// ─── PATCH /reorder — bulk update order for multiple items ───────────────────
// Body: { items: [{ id: number, order: number }] }
// Used by the dashboard drag-to-reorder list on the Content Manager page.

router.patch("/reorder", async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "items array is required and must not be empty" });
    }

    // Validate all items have id and order
    for (const item of items) {
      if (typeof item.id !== "number" || typeof item.order !== "number") {
        return res
          .status(400)
          .json({ error: "Each item must have numeric id and order fields" });
      }
    }

    // Run all updates in parallel
    await Promise.all(
      items.map((item: { id: number; order: number }) =>
        db
          .update(lectureContents)
          .set({ order: item.order })
          .where(eq(lectureContents.id, item.id)),
      ),
    );

    res.status(200).json({ message: "Content items reordered successfully" });
  } catch (e) {
    console.error(`PATCH /lecture-contents/reorder error: ${e}`);
    res.status(500).json({ error: "Failed to reorder content items" });
  }
});

// ─── DELETE /:id — delete a content item ─────────────────────────────────────

router.delete("/:id", async (req, res) => {
  try {
    const contentId = Number(req.params.id);

    if (!Number.isFinite(contentId)) {
      return res.status(400).json({ error: "Invalid content id" });
    }

    const [existing] = await db
      .select({
        id: lectureContents.id,
        cldPubId: lectureContents.cldPubId,
        type: lectureContents.type,
      })
      .from(lectureContents)
      .where(eq(lectureContents.id, contentId));

    if (!existing) {
      return res.status(404).json({ error: "Content item not found" });
    }

    const [deleted] = await db
      .delete(lectureContents)
      .where(eq(lectureContents.id, contentId))
      .returning({
        id: lectureContents.id,
        cldPubId: lectureContents.cldPubId,
        type: lectureContents.type,
      });

    if (!deleted) {
      return res.status(500).json({ error: "Failed to delete content item" });
    }

    // Return cldPubId so the caller (dashboard) can clean up Cloudinary
    res.status(200).json({
      message: "Content item deleted successfully",
      data: {
        id: deleted.id,
        cldPubId: deleted.cldPubId, // null for video type
        type: deleted.type,
      },
    });
  } catch (e) {
    console.error(`DELETE /lecture-contents/:id error: ${e}`);
    res.status(500).json({ error: "Failed to delete content item" });
  }
});

export default router;
