ALTER TABLE "asset_generation" ADD COLUMN "runpod_job_id" text;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD COLUMN "runpod_job_id" text;--> statement-breakpoint
ALTER TABLE "texture_generation" ADD COLUMN "runpod_job_id" text;
