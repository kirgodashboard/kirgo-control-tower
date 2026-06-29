-- metric_catalog had no RLS policy so anon key got permission denied.
-- The page uses the anon/authenticated role, so grant SELECT.
GRANT SELECT ON public.metric_catalog TO anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'metric_catalog' AND policyname = 'metric_catalog_select'
  ) THEN
    CREATE POLICY metric_catalog_select ON metric_catalog FOR SELECT USING (true);
  END IF;
END $$;
