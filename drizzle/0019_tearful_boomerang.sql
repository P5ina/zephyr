ALTER TABLE "asset_generation" ADD COLUMN "bonus_token_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD COLUMN "bonus_token_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "texture_generation" ADD COLUMN "bonus_token_cost" integer DEFAULT 0 NOT NULL;