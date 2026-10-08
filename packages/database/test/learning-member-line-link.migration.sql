-- Run only in a disposable database after the original service-line-link migration.
-- Apply 20261008140000_learning_member_line_link before running this test.
BEGIN;
INSERT INTO service_line_link_attempts
  (state_hash, actor_user_id, bunshin_id, configuration_id, service_slug, nonce, verifier, expires_at)
VALUES
  (repeat('a',64), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', 'test-service', 'nonce', 'verifier', now()+interval '10 minutes'),
  (repeat('b',64), '00000000-0000-4000-8000-000000000001', NULL, '00000000-0000-4000-8000-000000000003', 'test-service', 'nonce', 'verifier', now()+interval '10 minutes');
DO $$
DECLARE claimed integer;
BEGIN
  IF (SELECT count(*) FROM service_line_link_attempts) <> 2 THEN
    RAISE EXCEPTION 'Old and member attempts must coexist';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname='service_line_link_attempts') THEN
    RAISE EXCEPTION 'RLS must remain enabled';
  END IF;
  UPDATE service_line_link_attempts SET consumed_at=now(), nonce='', verifier=''
    WHERE state_hash=repeat('b',64) AND consumed_at IS NULL AND expires_at>now();
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed <> 1 THEN RAISE EXCEPTION 'First claim failed'; END IF;
  UPDATE service_line_link_attempts SET consumed_at=now()
    WHERE state_hash=repeat('b',64) AND consumed_at IS NULL AND expires_at>now();
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed <> 0 THEN RAISE EXCEPTION 'Replay was accepted'; END IF;
END $$;
ROLLBACK;
