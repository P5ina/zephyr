CREATE TABLE "rotation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_image_url" text,
	"rotation_n" text,
	"rotation_ne" text,
	"rotation_e" text,
	"rotation_se" text,
	"rotation_s" text,
	"rotation_sw" text,
	"rotation_w" text,
	"rotation_nw" text,
	"token_cost" integer NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rotation_job" ADD CONSTRAINT "rotation_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;