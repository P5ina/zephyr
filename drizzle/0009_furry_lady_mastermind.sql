CREATE TABLE "vast_instance" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"http_host" text,
	"http_port" integer,
	"gpu_name" text,
	"cost_per_hour" text,
	"current_job_id" text,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "asset_generation" ADD COLUMN "vast_instance_id" text;--> statement-breakpoint
ALTER TABLE "asset_generation" ADD COLUMN "comfyui_prompt_id" text;--> statement-breakpoint
ALTER TABLE "asset_generation" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_generation" ADD CONSTRAINT "asset_generation_vast_instance_id_vast_instance_id_fk" FOREIGN KEY ("vast_instance_id") REFERENCES "public"."vast_instance"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_generation" DROP COLUMN "runpod_job_id";