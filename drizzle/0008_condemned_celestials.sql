CREATE TABLE "asset_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"visible_id" text NOT NULL,
	"user_id" text NOT NULL,
	"asset_type" text NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"width" integer DEFAULT 512 NOT NULL,
	"height" integer DEFAULT 512 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"runpod_job_id" text,
	"result_urls" json,
	"pbr_urls" json,
	"seed" integer,
	"token_cost" integer NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "asset_generation_visible_id_unique" UNIQUE("visible_id")
);
--> statement-breakpoint
ALTER TABLE "asset_generation" ADD CONSTRAINT "asset_generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;