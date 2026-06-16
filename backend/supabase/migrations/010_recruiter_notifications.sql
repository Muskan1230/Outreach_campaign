-- ============================================================
-- 010_recruiter_notifications.sql
--
-- Adds recruiter alert email template storage to campaigns and a
-- persistent in-app recruiter notifications table for new applications.
-- ============================================================

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS recruiter_alert_email_template_id text;

COMMENT ON COLUMN public.campaigns.recruiter_alert_email_template_id IS
  'DataAlchemy orchestrator template_id used for recruiter alerts on new applications.';

CREATE TABLE IF NOT EXISTS public.recruiter_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid NOT NULL,
  campaign_id uuid,
  application_id uuid,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed', 'in_app_only')),
  email_status text NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped', 'in_app_only')),
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruiter_notifications_recruiter_created_idx
  ON public.recruiter_notifications (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_notifications_recruiter_unread_idx
  ON public.recruiter_notifications (recruiter_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_notifications_campaign_idx
  ON public.recruiter_notifications (campaign_id);

COMMENT ON TABLE public.recruiter_notifications IS
  'In-app notification feed for recruiters, including application alerts mirrored from DataAlchemy email events.';

COMMENT ON COLUMN public.recruiter_notifications.payload IS
  'Supplementary notification data used to render lists and deep links in the recruiter UI.';

