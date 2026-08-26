ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_not_self" CHECK ("comments"."parent_id" is null or "comments"."parent_id" <> "comments"."id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('like', 'comment', 'follow', 'message'));--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_type_check" CHECK ("post_media"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'));--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_dimensions_check" CHECK ("post_media"."width" is null or "post_media"."height" is null or ("post_media"."width" > 0 and "post_media"."height" > 0));
