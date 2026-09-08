-- The application reaches these tables through the server-side Prisma connection.
-- RLS without client policies blocks direct PostgREST access by anon/authenticated roles,
-- while the owning postgres role used by migrations and the application keeps working.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      target.schemaname,
      target.tablename
    );
  END LOOP;
END
$$;
