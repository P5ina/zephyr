CREATE TABLE "training_image" (
	"id" text PRIMARY KEY NOT NULL,
	"training_job_id" text NOT NULL,
	"image_url" text NOT NULL,
	"filename" text NOT NULL,
	"auto_caption" text,
	"user_caption" text,
	"caption_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_job" (
	"id" text PRIMARY KEY NOT NULL,
	"visible_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"training_type" text DEFAULT 'balanced' NOT NULL,
	"steps" integer DEFAULT 1000 NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"progress" integer DEFAULT 0,
	"fal_request_id" text,
	"result_lora_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "training_job_visible_id_unique" UNIQUE("visible_id")
);
--> statement-breakpoint
ALTER TABLE "training_image" ADD CONSTRAINT "training_image_training_job_id_training_job_id_fk" FOREIGN KEY ("training_job_id") REFERENCES "public"."training_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_job" ADD CONSTRAINT "training_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_job" ADD CONSTRAINT "training_job_result_lora_id_lora_id_fk" FOREIGN KEY ("result_lora_id") REFERENCES "public"."lora"("id") ON DELETE no action ON UPDATE no action;