CREATE TABLE "spin_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_session_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_stage" text,
	"fal_request_id" text,
	"input_image_url" text,
	"video_url" text,
	"token_cost" integer DEFAULT 0 NOT NULL,
	"bonus_token_cost" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "spin_job" ADD CONSTRAINT "spin_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spin_job" ADD CONSTRAINT "spin_job_guest_session_id_guest_session_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_session"("id") ON DELETE no action ON UPDATE no action;