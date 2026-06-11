-- ============================================================
-- Migration 006: Tracking Links — Source Channel Attribution
-- ============================================================
-- Goals:
--   1. Create tracking_links table as a first-class entity.
--   2. Each row represents one channel link for one campaign
--      (optionally scoped to a recruiter).
--   3. total_clicks is incremented atomically by the public
--      /api/tracking-links/:id/click endpoint.
--   4. source_link_id on candidate_applications references this
--      table so attribution is fully relational.
-- ============================================================

-- ------------------------------------------------------------
-- 1) tracking_links table
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tracking_links (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  channel       TEXT        NOT NULL,           -- 'whatsapp' | 'linkedin' | 'facebook' | 'instagram' | 'job_portal'
  recruiter_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,  -- optional per-recruiter scope
  short_url     TEXT,                           -- reserved for future short-link service
  utm_source    TEXT,                           -- e.g. 'wa', 'li', 'fb'
  utm_medium    TEXT,                           -- e.g. 'social', 'job_portal'
  utm_campaign  TEXT,                           -- campaign name slug
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  total_clicks  INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tracking_links IS
  'Persisted outreach tracking links — one per campaign × channel (× optional recruiter). Tracks total clicks for attribution reporting.';

-- ------------------------------------------------------------
-- 2) Indexes
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_tracking_links_campaign
  ON public.tracking_links (campaign_id);

CREATE INDEX IF NOT EXISTS idx_tracking_links_channel
  ON public.tracking_links (channel);

CREATE INDEX IF NOT EXISTS idx_tracking_links_active
  ON public.tracking_links (is_active)
  WHERE is_active = TRUE;

-- Unique active link per campaign + channel + recruiter.
-- Use a sentinel UUID for null recruiter_id so the uniqueness covers the
-- "no recruiter scoping" case (standard UNIQUE does not treat NULL = NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_links_campaign_channel_recruiter
  ON public.tracking_links (
    campaign_id,
    channel,
    COALESCE(recruiter_id, '00000000-0000-0000-0000-000000000000'::UUID)
  )
  WHERE is_active = TRUE;

-- ------------------------------------------------------------
-- 3) Auto-update updated_at trigger
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_tracking_links_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracking_links_updated_at ON public.tracking_links;
CREATE TRIGGER trg_tracking_links_updated_at
  BEFORE UPDATE ON public.tracking_links
  FOR EACH ROW EXECUTE FUNCTION public.fn_tracking_links_updated_at();

-- ------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------

ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;

-- Recruiter: read own campaign's tracking links
DROP POLICY IF EXISTS "recruiter_read_tracking_links" ON public.tracking_links;
CREATE POLICY "recruiter_read_tracking_links"
  ON public.tracking_links
  FOR SELECT
  TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE owner_id = auth.uid()
    )
  );

-- Recruiter: write (insert / update / delete) own campaign's tracking links
DROP POLICY IF EXISTS "recruiter_write_tracking_links" ON public.tracking_links;
CREATE POLICY "recruiter_write_tracking_links"
  ON public.tracking_links
  FOR ALL
  TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM public.campaigns WHERE owner_id = auth.uid()
    )
  );

-- Anonymous candidates: read active links only (needed to validate ?track= param)
DROP POLICY IF EXISTS "anon_read_active_tracking_links" ON public.tracking_links;
CREATE POLICY "anon_read_active_tracking_links"
  ON public.tracking_links
  FOR SELECT
  TO anon
  USING (is_active = TRUE);

-- Anonymous candidates: update total_clicks (click counter endpoint)
-- The backend uses the service_role key which bypasses RLS, so this
-- policy is a safety net for future direct-from-client usage.
DROP POLICY IF EXISTS "anon_increment_click" ON public.tracking_links;
CREATE POLICY "anon_increment_click"
  ON public.tracking_links
  FOR UPDATE
  TO anon
  USING (is_active = TRUE)
  WITH CHECK (is_active = TRUE);

-- ------------------------------------------------------------
-- 5) FK on candidate_applications.source_link_id
-- ------------------------------------------------------------
-- The column already exists from prior schema; we just add the
-- foreign key constraint if it's not already there.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints tc
    JOIN   information_schema.key_column_usage   kcu
           ON  tc.constraint_name = kcu.constraint_name
    WHERE  tc.table_name       = 'candidate_applications'
      AND  tc.constraint_type  = 'FOREIGN KEY'
      AND  kcu.column_name     = 'source_link_id'
  ) THEN
    ALTER TABLE public.candidate_applications
      ADD CONSTRAINT fk_candidate_applications_source_link
      FOREIGN KEY (source_link_id)
      REFERENCES public.tracking_links(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 6) RPC Function to atomically increment clicks
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_tracking_link_clicks(p_link_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.tracking_links
  SET total_clicks = total_clicks + 1,
      updated_at = NOW()
  WHERE id = p_link_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Done
-- ------------------------------------------------------------
-- Run this in the Supabase SQL editor: Dashboard → SQL Editor → New query.
-- The service_role key used by the Express backend bypasses RLS entirely.

