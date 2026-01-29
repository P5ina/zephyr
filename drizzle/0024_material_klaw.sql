CREATE TABLE "guest_session" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_address" text NOT NULL,
	"generations_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"converted_to_user_id" text
);
--> statement-breakpoint
ALTER TABLE "asset_generation" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_generation" ADD COLUMN "guest_session_id" text;--> statement-breakpoint
ALTER TABLE "guest_session" ADD CONSTRAINT "guest_session_converted_to_user_id_user_id_fk" FOREIGN KEY ("converted_to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_generation" ADD CONSTRAINT "asset_generation_guest_session_id_guest_session_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_session"("id") ON DELETE no action ON UPDATE no action;