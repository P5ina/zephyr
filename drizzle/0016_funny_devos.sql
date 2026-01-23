ALTER TABLE "rotation_job" ADD COLUMN "input_image_url" text;--> statement-breakpoint
ALTER TABLE "rotation_job" DROP COLUMN "mode";--> statement-breakpoint
ALTER TABLE "rotation_job" DROP COLUMN "pixel_resolution";--> statement-breakpoint
ALTER TABLE "rotation_job" DROP COLUMN "color_count";