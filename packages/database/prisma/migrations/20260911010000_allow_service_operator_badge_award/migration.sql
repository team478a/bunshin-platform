-- A service owner/admin may operate a one-person service and award a service badge
-- to themselves. Application authorization and the badge audit log remain mandatory.
ALTER TABLE "badge_award_candidates"
  DROP CONSTRAINT IF EXISTS "badge_candidate_separate_reviewer_check";
