import { pgTable, unique, integer, varchar, timestamp, foreignKey, index, text, jsonb, boolean, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const classStatus = pgEnum("class_status", ['active', 'inactive', 'archived'])
export const role = pgEnum("role", ['student', 'teacher', 'admin'])


export const departments = pgTable("departments", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "departments_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("departments_code_unique").on(table.code),
]);

export const subjects = pgTable("subjects", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "subjects_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	departmentId: integer("department_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	code: varchar({ length: 50 }).notNull(),
	description: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.departmentId],
			foreignColumns: [departments.id],
			name: "subjects_department_id_departments_id_fk"
		}).onDelete("restrict"),
	unique("subjects_code_unique").on(table.code),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
]);

export const classes = pgTable("classes", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "classes_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	subjectId: integer("subject_id").notNull(),
	teacherId: text("teacher_id").notNull(),
	inviteCode: text("invite_code").notNull(),
	name: varchar({ length: 255 }).notNull(),
	bannerCldPubId: text("banner_cld_pub_id"),
	bannerUrl: text("banner_url"),
	description: text(),
	capacity: integer().default(50).notNull(),
	status: classStatus().default('active').notNull(),
	schedules: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("classes_subject_id_idx").using("btree", table.subjectId.asc().nullsLast().op("int4_ops")),
	index("classes_teacher_id_idx").using("btree", table.teacherId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.subjectId],
			foreignColumns: [subjects.id],
			name: "classes_subject_id_subjects_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.teacherId],
			foreignColumns: [user.id],
			name: "classes_teacher_id_user_id_fk"
		}).onDelete("restrict"),
	unique("classes_invite_code_unique").on(table.inviteCode),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").notNull(),
	image: text(),
	role: role().default('student').notNull(),
	imageCldPubId: text("image_cld_pub_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("account_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
}, (table) => [
	index("session_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const enrollments = pgTable("enrollments", {
	studentId: text("student_id").notNull(),
	classId: integer("class_id").notNull(),
}, (table) => [
	index("enrollments_class_id_idx").using("btree", table.classId.asc().nullsLast().op("int4_ops")),
	index("enrollments_student_id_idx").using("btree", table.studentId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.studentId],
			foreignColumns: [user.id],
			name: "enrollments_student_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.classId],
			foreignColumns: [classes.id],
			name: "enrollments_class_id_classes_id_fk"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.studentId, table.classId], name: "enrollments_student_id_class_id_pk"}),
]);
