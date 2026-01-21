ALTER TABLE "rotation_job" ADD COLUMN "mode" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD COLUMN "pixel_resolution" integer;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD COLUMN "color_count" integer;