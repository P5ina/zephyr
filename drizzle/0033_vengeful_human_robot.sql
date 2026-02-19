ALTER TABLE "rotation_job" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD COLUMN "guest_session_id" text;--> statement-breakpoint
ALTER TABLE "rotation_job" ADD CONSTRAINT "rotation_job_guest_session_id_guest_session_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_session"("id") ON DELETE no action ON UPDATE no action;