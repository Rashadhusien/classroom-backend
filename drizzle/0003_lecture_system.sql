-- Create content type enum for lecture contents
CREATE TYPE "public"."content_type" AS ENUM('video', 'image', 'document');

-- Create lecture_contents table for storing lecture content items
CREATE TABLE "lecture_contents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lecture_contents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lecture_id" integer NOT NULL,
	"type" "content_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"cld_pub_id" text,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create lectures table for organizing class content
CREATE TABLE "lectures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lectures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"class_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "lecture_contents" ADD CONSTRAINT "lecture_contents_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;

-- Create indexes for performance
CREATE INDEX "lecture_contents_lecture_id_idx" ON "lecture_contents" USING btree ("lecture_id");
CREATE INDEX "lecture_contents_lecture_id_order_idx" ON "lecture_contents" USING btree ("lecture_id","order");
CREATE INDEX "lectures_class_id_idx" ON "lectures" USING btree ("class_id");
CREATE INDEX "lectures_class_id_order_idx" ON "lectures" USING btree ("class_id","order");
