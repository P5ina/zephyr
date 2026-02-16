CREATE TABLE "concept_art_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"style" text,
	"image_size" text DEFAULT 'square_hd' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_stage" text,
	"fal_request_id" text,
	"image_url" text,
	"seed" bigint,
	"token_cost" integer NOT NULL,
	"bonus_token_cost" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "concept_art_generation" ADD CONSTRAINT "concept_art_generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;