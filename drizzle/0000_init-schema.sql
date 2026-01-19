CREATE TABLE "generation" (
	"id" text PRIMARY KEY NOT NULL,
	"visible_id" text NOT NULL,
	"prompt" text NOT NULL,
	"image_url" text NOT NULL,
	"lora_ids" json DEFAULT '[]'::json,
	"seed" integer,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_visible_id_unique" UNIQUE("visible_id")
);
--> statement-breakpoint
CREATE TABLE "lora" (
	"id" text PRIMARY KEY NOT NULL,
	"visible_id" text NOT NULL,
	"name" text NOT NULL,
	"fal_url" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lora_visible_id_unique" UNIQUE("visible_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"avatar_url" text,
	"github_id" integer,
	"google_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "user_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "generation" ADD CONSTRAINT "generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lora" ADD CONSTRAINT "lora_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;