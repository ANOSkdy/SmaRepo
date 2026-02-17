-- P8: Neon Postgres schema hardening (safe/idempotent)
-- Scope: extensions/constraints/indexes/FKs only; no data backfill.

DO $$
BEGIN
  -- Enable PostGIS only when spatial features are already in use (sites.lat/lon present).
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sites'
      AND column_name IN ('lat', 'lon')
    GROUP BY table_schema, table_name
    HAVING COUNT(DISTINCT column_name) = 2
  ) THEN
    CREATE EXTENSION IF NOT EXISTS postgis;
  END IF;
END
$$;

-- Sites: optional spatial column/index when lat/lon are available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sites'
      AND column_name IN ('lat', 'lon')
    GROUP BY table_schema, table_name
    HAVING COUNT(DISTINCT column_name) = 2
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sites'
      AND column_name = 'geom'
  ) THEN
    EXECUTE '
      ALTER TABLE public.sites
      ADD COLUMN geom geometry(Point, 4326)
      GENERATED ALWAYS AS (
        CASE
          WHEN lon IS NULL OR lat IS NULL THEN NULL
          ELSE ST_SetSRID(ST_MakePoint(lon, lat), 4326)
        END
      ) STORED
    ';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sites' AND column_name = 'geom'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sites_geom_gist ON public.sites USING GIST (geom)';
  END IF;
END
$$;

-- Constraints (NOT VALID to avoid breaking existing production data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sites' AND column_name = 'lat'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sites_lat_range_chk'
      AND conrelid = 'public.sites'::regclass
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_lat_range_chk
      CHECK (lat IS NULL OR (lat BETWEEN -90 AND 90)) NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sites' AND column_name = 'lon'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sites_lon_range_chk'
      AND conrelid = 'public.sites'::regclass
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_lon_range_chk
      CHECK (lon IS NULL OR (lon BETWEEN -180 AND 180)) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'duration_min'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_duration_min_nonneg_chk'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_duration_min_nonneg_chk
      CHECK (duration_min IS NULL OR duration_min >= 0) NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'decision_method'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_decision_method_chk'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_decision_method_chk
      CHECK (decision_method IN ('nearest', 'none')) NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_status_chk'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_status_chk
      CHECK (status IN ('open', 'closed')) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'logs' AND column_name = 'duration_min'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'logs_duration_min_nonneg_chk'
      AND conrelid = 'public.logs'::regclass
  ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_duration_min_nonneg_chk
      CHECK (duration_min IS NULL OR duration_min >= 0) NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'logs' AND column_name = 'decision_method'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'logs_decision_method_chk'
      AND conrelid = 'public.logs'::regclass
  ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_decision_method_chk
      CHECK (decision_method IN ('nearest', 'none')) NOT VALID;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'logs' AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'logs_status_chk'
      AND conrelid = 'public.logs'::regclass
  ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_status_chk
      CHECK (status IN ('open', 'closed')) NOT VALID;
  END IF;
END
$$;

-- Foreign keys (NOT VALID for production safety)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='logs' AND column_name='user_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'logs_user_id_fkey'
         AND conrelid = 'public.logs'::regclass
     ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) NOT VALID;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='logs' AND column_name='machine_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' AND column_name='id')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'logs_machine_id_fkey'
         AND conrelid = 'public.logs'::regclass
     ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_machine_id_fkey
      FOREIGN KEY (machine_id) REFERENCES public.machines(id) NOT VALID;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='logs' AND column_name='decided_site_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sites' AND column_name='id')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'logs_decided_site_id_fkey'
         AND conrelid = 'public.logs'::regclass
     ) THEN
    ALTER TABLE public.logs
      ADD CONSTRAINT logs_decided_site_id_fkey
      FOREIGN KEY (decided_site_id) REFERENCES public.sites(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='user_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'sessions_user_id_fkey'
         AND conrelid = 'public.sessions'::regclass
     ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) NOT VALID;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='machine_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' AND column_name='id')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'sessions_machine_id_fkey'
         AND conrelid = 'public.sessions'::regclass
     ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_machine_id_fkey
      FOREIGN KEY (machine_id) REFERENCES public.machines(id) NOT VALID;
  END IF;
END
$$;

-- Uniqueness / idempotency keys when present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='unique_key') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_unique_key_unique ON public.sessions(unique_key)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='logs' AND column_name='unique_key') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_unique_key_unique ON public.logs(unique_key)';
  END IF;
END
$$;

-- Masters indexes (expression-based, matching current to_jsonb query patterns)
CREATE INDEX IF NOT EXISTS idx_sites_active_site_id_expr ON public.sites (
  (CASE WHEN lower(COALESCE(to_jsonb(sites)->>'active', '')) IN ('1','true','t','yes','on') THEN TRUE ELSE FALSE END),
  (COALESCE(NULLIF(to_jsonb(sites)->>'site_id', ''), NULLIF(to_jsonb(sites)->>'siteId', ''), to_jsonb(sites)->>'id'))
);

CREATE INDEX IF NOT EXISTS idx_machines_active_machine_id_expr ON public.machines (
  (CASE WHEN lower(COALESCE(to_jsonb(machines)->>'active', '')) IN ('1','true','t','yes','on') THEN TRUE ELSE FALSE END),
  (COALESCE(NULLIF(to_jsonb(machines)->>'machineId', ''), NULLIF(to_jsonb(machines)->>'machineid', ''), NULLIF(to_jsonb(machines)->>'machine_id', ''), to_jsonb(machines)->>'id'))
);

CREATE INDEX IF NOT EXISTS idx_work_types_active_sort_work_expr ON public.work_types (
  (CASE WHEN lower(COALESCE(to_jsonb(work_types)->>'active', '')) IN ('1','true','t','yes','on') THEN TRUE ELSE FALSE END),
  (COALESCE(
    CASE WHEN NULLIF(to_jsonb(work_types)->>'sortOrder','') ~ '^-?\d+$' THEN (to_jsonb(work_types)->>'sortOrder')::int END,
    CASE WHEN NULLIF(to_jsonb(work_types)->>'sort_order','') ~ '^-?\d+$' THEN (to_jsonb(work_types)->>'sort_order')::int END,
    2147483647
  )),
  (COALESCE(NULLIF(to_jsonb(work_types)->>'workId', ''), NULLIF(to_jsonb(work_types)->>'work_id', ''), to_jsonb(work_types)->>'id'))
);

-- Logs / sessions query acceleration aligned with existing route/service filters
CREATE INDEX IF NOT EXISTS idx_logs_date_expr ON public.logs ((COALESCE(to_jsonb(logs)->>'date', '')));
CREATE INDEX IF NOT EXISTS idx_logs_user_date_expr ON public.logs (
  (COALESCE(to_jsonb(logs)->>'user_id', to_jsonb(logs)->>'userId', COALESCE(to_jsonb(logs)->'user'->>0, to_jsonb(logs)->>'user', ''))),
  (COALESCE(to_jsonb(logs)->>'date', ''))
);
CREATE INDEX IF NOT EXISTS idx_logs_site_date_expr ON public.logs (
  (COALESCE(to_jsonb(logs)->>'site_id', to_jsonb(logs)->>'siteId', to_jsonb(logs)->>'decided_site_id', to_jsonb(logs)->>'decidedSiteId', '')),
  (COALESCE(to_jsonb(logs)->>'date', ''))
);
CREATE INDEX IF NOT EXISTS idx_logs_machine_date_expr ON public.logs (
  (COALESCE(to_jsonb(logs)->>'machine_id', to_jsonb(logs)->>'machineId', to_jsonb(logs)->>'machineid', COALESCE(to_jsonb(logs)->'machine'->>0, to_jsonb(logs)->>'machine', ''))),
  (COALESCE(to_jsonb(logs)->>'date', ''))
);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp_expr ON public.logs ((COALESCE(to_jsonb(logs)->>'timestamp', to_jsonb(logs)->>'timestamp_utc', '')));

CREATE INDEX IF NOT EXISTS idx_sessions_date_expr ON public.sessions ((COALESCE(to_jsonb(sessions)->>'date', '')));
CREATE INDEX IF NOT EXISTS idx_sessions_user_date_expr ON public.sessions (
  (COALESCE(to_jsonb(sessions)->>'user_id', to_jsonb(sessions)->>'userId', COALESCE(to_jsonb(sessions)->'user'->>0, to_jsonb(sessions)->>'user', ''))),
  (COALESCE(to_jsonb(sessions)->>'date', ''))
);
