ALTER TABLE "social_image_generation_requests"
  DROP CONSTRAINT "social_image_requests_template_check";

ALTER TABLE "social_image_generation_requests"
  ADD CONSTRAINT "social_image_requests_template_check"
  CHECK (
    "template_key" IN (
      'EDITORIAL_COVER',
      'EDITORIAL_POINT',
      'EDITORIAL_SUMMARY',
      'PERSON_HEADLINE',
      'PROBLEM_CHECKLIST',
      'THREE_POINTS',
      'EMPATHY_QUOTE',
      'CTA'
    )
  );
