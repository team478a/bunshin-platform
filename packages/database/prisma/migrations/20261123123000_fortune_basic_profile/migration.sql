ALTER TABLE "fortune_participants" ADD COLUMN "basic_profile_handled_at" TIMESTAMPTZ(6);

CREATE TABLE "fortune_basic_profiles" (
  "participant_id" UUID PRIMARY KEY,
  "nickname" VARCHAR(30),
  "birth_date" DATE,
  "sex" VARCHAR(8),
  "sex_description" VARCHAR(60),
  "consented_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "fortune_basic_profiles_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "fortune_participants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fortune_basic_profiles_sex_check"
    CHECK (("sex" IS NULL OR "sex" IN ('MALE', 'FEMALE', 'OTHER'))
      AND ("sex_description" IS NULL OR "sex" IS NOT DISTINCT FROM 'OTHER'))
);

ALTER TABLE "fortune_basic_profiles" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION "erase_revoked_fortune_basic_profile"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "fortune_basic_profiles"
  USING "fortune_participants"
  WHERE "fortune_basic_profiles"."participant_id" = "fortune_participants"."id"
    AND "fortune_participants"."group_membership_id" = NEW."id";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "erase_revoked_fortune_basic_profile"
AFTER UPDATE OF "status" ON "group_memberships"
FOR EACH ROW WHEN (NEW."status" = 'REVOKED' AND OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "erase_revoked_fortune_basic_profile"();
