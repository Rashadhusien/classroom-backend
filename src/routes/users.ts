import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";

const router = express.Router();

// Get all users with optional search filtering and pagination
router.get("/", async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, +page);
    const limitPerPage = Math.max(1, +limit);

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // If search query exists, filter by user name or user email
    if (search) {
      filterConditions.push(
        or(
          ilike(user.name, `%${search}%`),
          ilike(user.email, `%${search}%`),
        ),
      );
    }

    // If role filter exists, match role exactly
    if (role) {
      filterConditions.push(eq(user.role, role as "student" | "teacher" | "admin"));
    }

    // Combine all filters using AND if any exist
    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;
    const usersList = await db
      .select(getTableColumns(user))
      .from(user)
      .where(whereClause)
      .orderBy(desc(user.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: usersList,
      pagination: {
        total: totalCount,
        page: currentPage,
        limit: limitPerPage,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error: any) {
    console.error(`GET /users error: ${error}`);
    res.status(500).json({ error: "Failed to get users" });
  }
});

export default router;
