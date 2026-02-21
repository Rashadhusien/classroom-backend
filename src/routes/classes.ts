import express from "express";
import { db } from "../db/index.js";
import { classes } from "../db/schema/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    // console.log("Received request body:", req.body);

    const {
      name,
      teacherId,
      subjectId,
      capacity,
      description,
      status,
      bannerUrl,
      bannerCldPubId,
    } = req.body;

    // Validate required fields
    if (!name || !teacherId || !subjectId) {
      return res.status(400).json({
        error: "Missing required fields",
        details: {
          name: !!name,
          teacherId: !!teacherId,
          subjectId: !!subjectId,
        },
      });
    }

    const inviteCode = Math.random().toString(36).substring(2, 9);
    console.log("Generated invite code:", inviteCode);

    const insertData = {
      subjectId: Number(subjectId),
      inviteCode,
      name,
      teacherId,
      bannerCldPubId: bannerCldPubId || null,
      bannerUrl: bannerUrl || null,
      capacity: Number(capacity) || 50,
      description: description || null,
      schedules: [],
      status: status || "active",
    };

    console.log("Insert data:", insertData);

    const [createdClass] = await db
      .insert(classes)
      .values(insertData)
      .returning({ id: classes.id });

    if (!createdClass) {
      throw new Error("Failed to create class - no result returned");
    }

    console.log("Created class:", createdClass);
    res.status(201).json({ data: createdClass });
  } catch (error: any) {
    console.error("POST /classes error:", error);
    console.error("Error details:", {
      message: error?.message || "Unknown error",
      stack: error?.stack || "No stack trace",
      body: req.body,
    });

    // Send more detailed error response
    const errorMessage = error?.message || "Failed to create class";
    res.status(500).json({
      error: errorMessage,
      details:
        process.env.NODE_ENV === "development" ? error?.stack : undefined,
    });
  }
});

export default router;
