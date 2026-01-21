ALTER TABLE "rotation_job" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD COLUMN "current_stage" text;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD COLUMN "started_at" timestamp with time zone;