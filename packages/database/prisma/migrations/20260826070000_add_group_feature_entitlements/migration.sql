CREATE TYPE "FeatureDefinitionStatus" AS ENUM ('ACTIVE', 'RETIRED');
CREATE TYPE "GroupFeatureAccessStatus" AS ENUM ('ENABLED', 'DISABLED');
CREATE TYPE "GroupFeatureAuditAction" AS ENUM ('GROUP_POLICY_SET', 'MEMBER_ASSIGNMENT_SET');

CREATE TABLE "feature_definitions" (
  "key" VARCHAR(120) NOT NULL,
  "parent_key" VARCHAR(120),
  "name" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "status" "FeatureDefinitionStatus" NOT NULL DEFAULT 'ACTIVE',
  "config_schema" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "feature_definitions_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "group_feature_policies" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "feature_key" VARCHAR(120) NOT NULL,
  "status" "GroupFeatureAccessStatus" NOT NULL DEFAULT 'DISABLED',
  "daily_limit" INTEGER,
  "monthly_limit" INTEGER,
  "config" JSONB NOT NULL DEFAULT '{}',
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "set_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_feature_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_feature_policies_limits_check" CHECK (("daily_limit" IS NULL OR "daily_limit" > 0) AND ("monthly_limit" IS NULL OR "monthly_limit" > 0)),
  CONSTRAINT "group_feature_policies_period_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
);

CREATE TABLE "group_member_feature_assignments" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "feature_key" VARCHAR(120) NOT NULL,
  "status" "GroupFeatureAccessStatus" NOT NULL DEFAULT 'DISABLED',
  "daily_limit" INTEGER,
  "monthly_limit" INTEGER,
  "config" JSONB NOT NULL DEFAULT '{}',
  "starts_at" TIMESTAMPTZ(6),
  "ends_at" TIMESTAMPTZ(6),
  "assigned_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "group_member_feature_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_member_feature_assignments_limits_check" CHECK (("daily_limit" IS NULL OR "daily_limit" > 0) AND ("monthly_limit" IS NULL OR "monthly_limit" > 0)),
  CONSTRAINT "group_member_feature_assignments_period_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
);

CREATE TABLE "group_feature_audit_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "group_membership_id" UUID,
  "feature_key" VARCHAR(120) NOT NULL,
  "action" "GroupFeatureAuditAction" NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "performed_by_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_feature_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_feature_policies_group_id_feature_key_key" ON "group_feature_policies"("group_id", "feature_key");
CREATE INDEX "group_feature_policies_workspace_id_group_id_status_idx" ON "group_feature_policies"("workspace_id", "group_id", "status");
CREATE UNIQUE INDEX "group_member_feature_assignments_group_membership_id_feature_key_key" ON "group_member_feature_assignments"("group_membership_id", "feature_key");
CREATE INDEX "group_member_feature_assignments_workspace_id_group_id_status_idx" ON "group_member_feature_assignments"("workspace_id", "group_id", "status");
CREATE INDEX "feature_definitions_parent_key_status_idx" ON "feature_definitions"("parent_key", "status");
CREATE INDEX "group_feature_audit_logs_workspace_id_group_id_occurred_at_idx" ON "group_feature_audit_logs"("workspace_id", "group_id", "occurred_at");
CREATE INDEX "group_feature_audit_logs_group_membership_id_occurred_at_idx" ON "group_feature_audit_logs"("group_membership_id", "occurred_at");

ALTER TABLE "feature_definitions" ADD CONSTRAINT "feature_definitions_parent_key_fkey" FOREIGN KEY ("parent_key") REFERENCES "feature_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_feature_policies" ADD CONSTRAINT "group_feature_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_feature_policies" ADD CONSTRAINT "group_feature_policies_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_feature_policies" ADD CONSTRAINT "group_feature_policies_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "feature_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_feature_policies" ADD CONSTRAINT "group_feature_policies_set_by_user_id_fkey" FOREIGN KEY ("set_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_member_feature_assignments" ADD CONSTRAINT "group_member_feature_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_member_feature_assignments" ADD CONSTRAINT "group_member_feature_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_member_feature_assignments" ADD CONSTRAINT "group_member_feature_assignments_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_member_feature_assignments" ADD CONSTRAINT "group_member_feature_assignments_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "feature_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_member_feature_assignments" ADD CONSTRAINT "group_member_feature_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_feature_audit_logs" ADD CONSTRAINT "group_feature_audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_feature_audit_logs" ADD CONSTRAINT "group_feature_audit_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_feature_audit_logs" ADD CONSTRAINT "group_feature_audit_logs_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "group_feature_audit_logs" ADD CONSTRAINT "group_feature_audit_logs_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "feature_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_feature_audit_logs" ADD CONSTRAINT "group_feature_audit_logs_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "feature_definitions" ("key", "name", "description", "updated_at") VALUES
  ('SOCIAL', 'SNS企画', 'SNS企画と投稿支援の親機能', CURRENT_TIMESTAMP),
  ('BLOG', 'ブログ', 'ブログ作成と公開支援の親機能', CURRENT_TIMESTAMP),
  ('GROUP', 'グループ運用', 'グループの商品・企画運用の親機能', CURRENT_TIMESTAMP),
  ('LINE', 'LINE', 'LINE通知と導線の親機能', CURRENT_TIMESTAMP);

INSERT INTO "feature_definitions" ("key", "parent_key", "name", "description", "updated_at") VALUES
  ('SOCIAL.IMAGE_GENERATION', 'SOCIAL', 'SNS画像生成', 'SNS投稿用画像を生成する', CURRENT_TIMESTAMP),
  ('SOCIAL.TREND_RESEARCH', 'SOCIAL', 'トレンド調査', 'SNSの話題と企画候補を調査する', CURRENT_TIMESTAMP),
  ('BLOG.ARTICLE_GENERATION', 'BLOG', 'ブログ記事生成', 'ブログ記事の下書きを生成する', CURRENT_TIMESTAMP),
  ('BLOG.IMAGE_GENERATION', 'BLOG', 'ブログ画像生成', 'ブログ用画像を生成する', CURRENT_TIMESTAMP),
  ('BLOG.PUBLISHING', 'BLOG', 'ブログ公開', '承認済み記事を外部ブログへ公開する', CURRENT_TIMESTAMP),
  ('GROUP.PRODUCT_PACK', 'GROUP', '公式商品パック', 'グループの公式商品情報を利用する', CURRENT_TIMESTAMP),
  ('GROUP.CAMPAIGN', 'GROUP', '参加募集', 'グループの企画募集へ参加する', CURRENT_TIMESTAMP),
  ('GROUP.EXTERNAL_TRACKING_LINK', 'GROUP', '専用URL', '参加者専用の外部成果計測URLを利用する', CURRENT_TIMESTAMP),
  ('LINE.DAILY_NOTIFICATION', 'LINE', '毎日のLINE通知', '今日の企画をLINEで受け取る', CURRENT_TIMESTAMP);
