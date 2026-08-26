CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"media_url" text NOT NULL,
	"thumbnail_url" text,
	"mime_type" varchar(100) NOT NULL,
	"width" integer,
	"height" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "story_views" (
	"story_id" uuid NOT NULL,
	"viewer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_views_story_id_viewer_id_pk" PRIMARY KEY("story_id","viewer_id")
);
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_author_active_idx" ON "stories" USING btree ("author_id","expires_at");--> statement-breakpoint
CREATE INDEX "stories_expiration_idx" ON "stories" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "story_views_viewer_idx" ON "story_views" USING btree ("viewer_id","created_at");