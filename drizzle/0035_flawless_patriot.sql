CREATE TABLE IF NOT EXISTS "animation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_stage" text,
	"input_image_url" text,
	"animation_type" text NOT NULL,
	"elevation_preset" text NOT NULL,
	"direction_count" integer DEFAULT 4 NOT NULL,
	"fal_request_ids" json,
	"direction_videos" json,
	"spritesheet_url" text,
	"frame_count" integer,
	"tile_width" integer,
	"tile_height" integer,
	"token_cost" integer NOT NULL,
	"bonus_token_cost" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rotation_job" ALTER COLUMN "elevation" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "rotation_job_new" ALTER COLUMN "elevation" SET DEFAULT 0;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "animation_job" ADD CONSTRAINT "animation_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
