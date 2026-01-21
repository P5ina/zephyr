ALTER TABLE "rotation_job" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "rotation_job" DROP COLUMN "input_image_url";