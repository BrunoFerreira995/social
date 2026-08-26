ALTER TABLE "blocks" ADD CONSTRAINT "blocks_no_self_block" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_id");--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_no_self_follow" CHECK ("follows"."follower_id" <> "follows"."following_id");--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_status_check" CHECK ("follows"."status" in ('pending', 'accepted'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('open', 'resolved', 'rejected'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_exactly_one_target" CHECK (num_nonnulls("reports"."target_user_id", "reports"."target_post_id") = 1);--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_no_self_target" CHECK ("reports"."reporter_id" <> coalesce("reports"."target_user_id", "reports"."reporter_id"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin'));