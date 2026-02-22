import { relations } from "drizzle-orm/relations";
import { departments, subjects, classes, user, account, session, enrollments } from "./schema";

export const subjectsRelations = relations(subjects, ({one, many}) => ({
	department: one(departments, {
		fields: [subjects.departmentId],
		references: [departments.id]
	}),
	classes: many(classes),
}));

export const departmentsRelations = relations(departments, ({many}) => ({
	subjects: many(subjects),
}));

export const classesRelations = relations(classes, ({one, many}) => ({
	subject: one(subjects, {
		fields: [classes.subjectId],
		references: [subjects.id]
	}),
	user: one(user, {
		fields: [classes.teacherId],
		references: [user.id]
	}),
	enrollments: many(enrollments),
}));

export const userRelations = relations(user, ({many}) => ({
	classes: many(classes),
	accounts: many(account),
	sessions: many(session),
	enrollments: many(enrollments),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const enrollmentsRelations = relations(enrollments, ({one}) => ({
	user: one(user, {
		fields: [enrollments.studentId],
		references: [user.id]
	}),
	class: one(classes, {
		fields: [enrollments.classId],
		references: [classes.id]
	}),
}));