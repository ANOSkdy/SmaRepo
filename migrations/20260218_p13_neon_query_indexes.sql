-- P13: targeted performance indexes for calendar/reports/attendance/cron paths

CREATE INDEX IF NOT EXISTS idx_logs_date_type_user_ts_expr ON public.logs (
  (COALESCE(to_jsonb(logs)->>'date', '')),
  (COALESCE(to_jsonb(logs)->>'type', '')),
  (COALESCE(to_jsonb(logs)->>'userId', COALESCE(to_jsonb(logs)->'user'->>0, to_jsonb(logs)->>'user', ''))),
  (COALESCE(to_jsonb(logs)->>'timestamp', ''))
);

CREATE INDEX IF NOT EXISTS idx_sessions_date_start_id_expr ON public.sessions (
  (COALESCE(to_jsonb(sessions)->>'date', '')),
  (COALESCE(to_jsonb(sessions)->>'start', '')),
  (COALESCE(to_jsonb(sessions)->>'id', ''))
);
