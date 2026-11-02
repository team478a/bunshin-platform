ALTER TABLE social_activity_support_interventions
  ADD COLUMN first_displayed_at TIMESTAMPTZ(6),
  ADD COLUMN first_details_viewed_at TIMESTAMPTZ(6),
  ADD CONSTRAINT social_support_exposure_order_check CHECK (
    (first_displayed_at IS NULL OR first_displayed_at >= offered_at)
    AND (first_details_viewed_at IS NULL OR (first_displayed_at IS NOT NULL AND first_details_viewed_at >= first_displayed_at))
  );
