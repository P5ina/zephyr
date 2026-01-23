ALTER TABLE "asset_generation" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_generation" ADD COLUMN "current_stage" text;--> statement-breakpoint
ALTER TABLE "texture_generation" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "texture_generation" ADD COLUMN "current_stage" text;