CREATE TYPE "InstructorReviewStatus" AS ENUM (
  'PENDING_PAYMENT', 'ACCEPTED', 'IN_PROGRESS', 'REFUND_PENDING', 'ANSWERED', 'CANCELLED', 'REFUNDED'
);

CREATE TABLE "instructor_review_products" (
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "revision" UUID NOT NULL,
  "settings" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  PRIMARY KEY ("workspace_id", "group_id"),
  FOREIGN KEY ("workspace_id", "group_id") REFERENCES "groups" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "instructor_reviews" (
  "id" UUID PRIMARY KEY,
  "workspace_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "group_membership_id" UUID NOT NULL,
  "buyer_user_id" UUID NOT NULL,
  "assignment_id" UUID NOT NULL,
  "topic_id" UUID,
  "instructor_user_id" UUID,
  "payment_configuration_id" UUID NOT NULL,
  "product_revision" UUID NOT NULL,
  "request_key" UUID NOT NULL,
  "source" VARCHAR(32) NOT NULL,
  "status" "InstructorReviewStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "title" TEXT NOT NULL,
  "plan_revision" INTEGER NOT NULL CHECK ("plan_revision" > 0),
  "focus" VARCHAR(500) NOT NULL,
  "excerpt" TEXT NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "amount_yen" INTEGER NOT NULL CHECK ("amount_yen" > 0),
  "response_hours" INTEGER NOT NULL CHECK ("response_hours" > 0),
  "cancellation_terms" VARCHAR(500) NOT NULL,
  "live_mode" BOOLEAN NOT NULL,
  "provider_checkout_session_id" VARCHAR(200) UNIQUE,
  "provider_payment_intent_id" VARCHAR(200) UNIQUE,
  "checkout_url" VARCHAR(2048),
  "paid_at" TIMESTAMPTZ(6),
  "due_at" TIMESTAMPTZ(6),
  "answer" TEXT,
  "answered_at" TIMESTAMPTZ(6),
  "notified_at" TIMESTAMPTZ(6),
  "content_redacted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  FOREIGN KEY ("workspace_id", "group_id", "enrollment_id", "group_membership_id") REFERENCES "program_enrollments" ("workspace_id", "group_id", "id", "group_membership_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "buyer_user_id") REFERENCES "group_memberships" ("workspace_id", "group_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("workspace_id", "payment_configuration_id") REFERENCES "organization_payment_configurations" ("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "instructor_review_request_key" ON "instructor_reviews" ("workspace_id", "group_id", "buyer_user_id", "request_key");
CREATE INDEX "instructor_review_service_status" ON "instructor_reviews" ("workspace_id", "group_id", "status");
CREATE INDEX "instructor_review_buyer_enrollment" ON "instructor_reviews" ("workspace_id", "group_id", "buyer_user_id", "enrollment_id");
CREATE INDEX "instructor_review_assigned_status" ON "instructor_reviews" ("workspace_id", "group_id", "instructor_user_id", "status");
CREATE UNIQUE INDEX "instructor_review_one_open_per_assignment" ON "instructor_reviews" ("assignment_id")
WHERE "status" IN ('PENDING_PAYMENT', 'ACCEPTED', 'IN_PROGRESS', 'REFUND_PENDING');

ALTER TABLE "instructor_review_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instructor_reviews" ENABLE ROW LEVEL SECURITY;
