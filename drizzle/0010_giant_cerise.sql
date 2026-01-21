CREATE TABLE "texture_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"basecolor_url" text,
	"normal_url" text,
	"roughness_url" text,
	"metallic_url" text,
	"height_url" text,
	"seed" integer,
	"token_cost" integer NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DROP TABLE "generation" CASCADE;--> statement-breakpoint
DROP TABLE "lora" CASCADE;--> statement-breakpoint
DROP TABLE "training_image" CASCADE;--> statement-breakpoint
DROP TABLE "training_job" CASCADE;--> statement-breakpoint
ALTER TABLE "texture_generation" ADD CONSTRAINT "texture_generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;