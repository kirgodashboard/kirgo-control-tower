-- Add retry tracking columns to sync_runs
ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS retry_count   INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_run_id INT     REFERENCES sync_runs(id),
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- RPC: get_sync_health — per-job execution health for the sync reliability dashboard
CREATE OR REPLACE FUNCTION get_sync_health()
RETURNS TABLE (
  job_id           int,
  integration_key  text,
  entity_type      text,
  is_active        boolean,
  schedule_label   text,
  edge_fn_name     text,
  last_run_at      timestamptz,
  last_success_at  timestamptz,
  last_failed_at   timestamptz,
  last_error       text,
  runs_24h         bigint,
  success_24h      bigint,
  failed_24h       bigint,
  records_last_run bigint,
  watermark_value  text,
  lag_hours        numeric,
  health_status    text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH run_stats AS (
  SELECT
    sr.sync_job_id,
    MAX(sr.started_at)                                                          AS last_run_at,
    MAX(sr.completed_at) FILTER (WHERE sr.status = 'success')                   AS last_success_at,
    MAX(sr.completed_at) FILTER (WHERE sr.status = 'failed')                    AS last_failed_at,
    (ARRAY_AGG(sr.error_summary ORDER BY sr.started_at DESC)
       FILTER (WHERE sr.status = 'failed' AND sr.error_summary IS NOT NULL))[1] AS last_error,
    COUNT(*)             FILTER (WHERE sr.started_at > NOW() - INTERVAL '24h')  AS runs_24h,
    COUNT(*)             FILTER (WHERE sr.status = 'success'
                                   AND sr.started_at > NOW() - INTERVAL '24h')  AS success_24h,
    COUNT(*)             FILTER (WHERE sr.status = 'failed'
                                   AND sr.started_at > NOW() - INTERVAL '24h')  AS failed_24h,
    (ARRAY_AGG(sr.records_inserted ORDER BY sr.completed_at DESC NULLS LAST)
       FILTER (WHERE sr.status = 'success'))[1]                                 AS records_last_run
  FROM sync_runs sr
  GROUP BY sr.sync_job_id
)
SELECT
  sj.id                                                               AS job_id,
  sj.integration_key,
  sj.entity_type,
  sj.is_active,
  sj.schedule_label,
  sj.edge_fn_name,
  rs.last_run_at,
  rs.last_success_at,
  rs.last_failed_at,
  rs.last_error,
  COALESCE(rs.runs_24h,    0)                                         AS runs_24h,
  COALESCE(rs.success_24h, 0)                                         AS success_24h,
  COALESCE(rs.failed_24h,  0)                                         AS failed_24h,
  COALESCE(rs.records_last_run, 0)                                    AS records_last_run,
  sj.watermark_value,
  ROUND(EXTRACT(EPOCH FROM (NOW() - rs.last_success_at)) / 3600, 1)  AS lag_hours,
  CASE
    WHEN NOT sj.is_active                                                    THEN 'unknown'
    WHEN rs.last_success_at IS NULL                                          THEN 'red'
    WHEN rs.last_failed_at > rs.last_success_at                              THEN 'red'
    WHEN EXTRACT(EPOCH FROM (NOW() - rs.last_success_at)) / 3600 > 48       THEN 'red'
    WHEN EXTRACT(EPOCH FROM (NOW() - rs.last_success_at)) / 3600 > 12       THEN 'amber'
    ELSE 'green'
  END                                                                  AS health_status
FROM sync_jobs sj
LEFT JOIN run_stats rs ON rs.sync_job_id = sj.id
ORDER BY sj.integration_key, sj.entity_type;
$$;

GRANT EXECUTE ON FUNCTION get_sync_health() TO anon, authenticated;
