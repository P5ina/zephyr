ALTER TABLE "concept_art_generation" ADD COLUMN "mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_art_generation" ADD COLUMN "composition_image_url" text;--> statement-breakpoint
ALTER TABLE "concept_art_generation" ADD COLUMN "style_image_url" text;--> statement-breakpoint
ALTER TABLE "concept_art_generation" ADD COLUMN "control_method" text;--> statement-breakpoint
ALTER TABLE "concept_art_generation" ADD COLUMN "control_strength" integer;--> statement-breakpoint
ALTER TABLE "concept_art_generation" ADD COLUMN "style_strength" integer;