import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user, session, account } from "./auth.js";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const classStatusEnum = pgEnum("class_status", [
  "active",
  "inactive",
  "archived",
]);

export const contentTypeEnum = pgEnum("content_type", [
  "video",
  "image",
  "document",
]);

// ─── Shared timestamp columns ─────────────────────────────────────────────────

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// ─── Departments ──────────────────────────────────────────────────────────────

export const departments = pgTable("departments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  ...timestamps,
});

// ─── Subjects ─────────────────────────────────────────────────────────────────

export const subjects = pgTable("subjects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  ...timestamps,
});

// ─── Classes ──────────────────────────────────────────────────────────────────

export const classes = pgTable(
  "classes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    inviteCode: text("invite_code").notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    bannerCldPubId: text("banner_cld_pub_id"),
    bannerUrl: text("banner_url"),
    description: text("description"),
    capacity: integer("capacity").default(50).notNull(),
    status: classStatusEnum("status").default("active").notNull(),
    schedules: jsonb("schedules").$type<any[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => [
    index("classes_subject_id_idx").on(table.subjectId),
    index("classes_teacher_id_idx").on(table.teacherId),
  ],
);

// ─── Enrollments ──────────────────────────────────────────────────────────────

export const enrollments = pgTable(
  "enrollments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.studentId, table.classId] }),
    unique("enrollments_student_id_class_id_unique").on(
      table.studentId,
      table.classId,
    ),
    index("enrollments_student_id_idx").on(table.studentId),
    index("enrollments_class_id_idx").on(table.classId),
  ],
);

// ─── Lectures ─────────────────────────────────────────────────────────────────
// One class has many lectures (ordered list).
// Teachers create lectures via the dashboard; students read published ones.

export const lectures = pgTable(
  "lectures",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    // Controls the display order within a class. Lower = appears first.
    order: integer("order").default(0).notNull(),
    // Only published lectures are visible to enrolled students.
    isPublished: boolean("is_published").default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    index("lectures_class_id_idx").on(table.classId),
    index("lectures_class_id_order_idx").on(table.classId, table.order),
  ],
);

// ─── Lecture Contents ─────────────────────────────────────────────────────────
// Each lecture holds an ordered list of content items (videos, images, documents).
// The `type` field drives how the student website renders each item:
//   video    → React Player (YouTube / Vimeo / direct MP4)
//   image    → responsive gallery with lightbox
//   document → inline PDF viewer OR download card for other file types

export const lectureContents = pgTable(
  "lecture_contents",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    lectureId: integer("lecture_id")
      .notNull()
      .references(() => lectures.id, { onDelete: "cascade" }),
    type: contentTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    // Public-facing URL:
    //   video    → YouTube / Vimeo share URL or direct MP4 CDN URL
    //   image    → Cloudinary delivery URL
    //   document → Cloudinary delivery URL (PDF, DOCX, PPTX, XLSX, etc.)
    url: text("url").notNull(),
    // Cloudinary public ID — only populated for image and document types.
    // Needed by the dashboard to delete the asset from Cloudinary on content removal.
    cldPubId: text("cld_pub_id"),
    // MIME type (e.g. "application/pdf", "image/jpeg", "video/mp4").
    // Used by the student site to decide between the PDF viewer and download card.
    mimeType: varchar("mime_type", { length: 100 }),
    // Raw file size in bytes — shown to students as "2.1 MB" before downloading.
    sizeBytes: integer("size_bytes"),
    // Controls the display order within a lecture.
    order: integer("order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("lecture_contents_lecture_id_idx").on(table.lectureId),
    index("lecture_contents_lecture_id_order_idx").on(
      table.lectureId,
      table.order,
    ),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const departmentRelations = relations(departments, ({ many }) => ({
  subjects: many(subjects),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  department: one(departments, {
    fields: [subjects.departmentId],
    references: [departments.id],
  }),
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [classes.subjectId],
    references: [subjects.id],
  }),
  teacher: one(user, {
    fields: [classes.teacherId],
    references: [user.id],
  }),
  enrollments: many(enrollments),
  lectures: many(lectures),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(user, {
    fields: [enrollments.studentId],
    references: [user.id],
  }),
  class: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
  }),
}));

export const lecturesRelations = relations(lectures, ({ one, many }) => ({
  class: one(classes, {
    fields: [lectures.classId],
    references: [classes.id],
  }),
  contents: many(lectureContents),
}));

export const lectureContentsRelations = relations(
  lectureContents,
  ({ one }) => ({
    lecture: one(lectures, {
      fields: [lectureContents.lectureId],
      references: [lectures.id],
    }),
  }),
);

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;

export type Lecture = typeof lectures.$inferSelect;
export type NewLecture = typeof lectures.$inferInsert;

export type LectureContent = typeof lectureContents.$inferSelect;
export type NewLectureContent = typeof lectureContents.$inferInsert;

// ─── Extended User Relations ─────────────────────────────────────────────────────
// Extend userRelations with app-specific relations to avoid circular imports

export const userAppRelations = relations(user, ({ many }) => ({
  // App — teacher side: classes this user teaches
  taughtClasses: many(classes, { relationName: "teacher" }),
  // App — student side: classes this user is enrolled in
  enrollments: many(enrollments),
}));
