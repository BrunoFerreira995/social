ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_no_self_target";--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_no_self_target" CHECK ("reports"."target_user_id" IS NULL OR "reports"."reporter_id" <> "reports"."target_user_id");
