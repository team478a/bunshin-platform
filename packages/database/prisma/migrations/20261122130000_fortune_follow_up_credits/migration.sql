ALTER TABLE fortune_service_settings
  ADD COLUMN follow_up_credit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN follow_up_credit_cost integer NOT NULL DEFAULT 1 CHECK (follow_up_credit_cost BETWEEN 1 AND 100000),
  ADD COLUMN follow_up_credit_limit integer NOT NULL DEFAULT 1 CHECK (follow_up_credit_limit BETWEEN 1 AND 5),
  ADD COLUMN credit_display_name varchar(40) CHECK (length(trim(credit_display_name)) > 0);

ALTER TABLE fortune_reading_follow_ups
  DROP CONSTRAINT fortune_reading_follow_ups_turn_check,
  ADD CONSTRAINT fortune_reading_follow_ups_turn_check CHECK (turn >= 1),
  ADD COLUMN credit_cost integer CHECK (credit_cost BETWEEN 1 AND 100000);

ALTER TABLE service_credit_ledger
  ADD COLUMN lot_allocations jsonb CHECK (
    lot_allocations IS NULL OR (type = 'CONSUME' AND jsonb_typeof(lot_allocations) = 'object')
  );
