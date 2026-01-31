CREATE TABLE "rotation_job_new" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_stage" text,
	"fal_request_id" text,
	"input_image_url" text,
	"elevation" integer DEFAULT 20 NOT NULL,
	"rotation_front" text,
	"rotation_right" text,
	"rotation_back" text,
	"rotation_left" text,
	"token_cost" integer NOT NULL,
	"bonus_token_cost" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rotation_job_new" ADD CONSTRAINT "rotation_job_new_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;