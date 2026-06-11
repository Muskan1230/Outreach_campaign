-- ============================================================
-- Migration 006b: Patch tracking_links to match code expectations
-- ============================================================
-- The tracking_links table already existed with a different schema:
--   click_count (INTEGER) instead of total_clicks
--   short_code  (TEXT) instead of short_url
--   full_url    (TEXT) -- extra column
--   channel     (USER-DEFINED enum) instead of TEXT
--   Missing: updated_at
--
-- This patch adds the missing columns so the Express routes work.
-- ============================================================

-- 1) Add total_clicks column (our code writes to this)
ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS total_clicks INTEGER NOT NULL DEFAULT 0;

-- Sync existing click_count data into total_clicks
UPDATE public.tracking_links SET total_clicks = click_count WHERE total_clicks = 0 AND click_count > 0;

-- 2) Add updated_at column
ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3) Add short_url alias column (code references this)
ALTER TABLE public.tracking_links
  ADD COLUMN IF NOT EXISTS short_url TEXT;

-- 4) Make full_url nullable (old schema had it NOT NULL but our code doesn't supply it)
ALTER TABLE public.tracking_links
  ALTER COLUMN full_url DROP NOT NULL;

-- 4) The 'channel' column is a USER-DEFINED enum — check if it accepts text values
--    If so, no change needed. The migration tries to insert TEXT values which should cast.

-- 5) Create/replace the RPC function (may already exist, safe to replace)
CREATE OR REPLACE FUNCTION public.increment_tracking_link_clicks(p_link_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.tracking_links
  SET total_clicks = total_clicks + 1,
      click_count  = click_count + 1,
      updated_at   = NOW()
  WHERE id = p_link_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) Done - channel column uses outreach_channel enum which already has all values.

