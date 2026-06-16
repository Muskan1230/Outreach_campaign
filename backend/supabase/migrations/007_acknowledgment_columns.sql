-- ============================================================
-- 007_acknowledgment_columns.sql
--
-- Adds acknowledgment notification configuration to campaigns,
-- and ack send-status tracking to candidate_applications.
-- ============================================================

-- ── campaigns: acknowledgment config columns ─────────────────

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS acknowledgment_channels    text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS acknowledgment_email_template_id  text;

COMMENT ON COLUMN public.campaigns.acknowledgment_channels IS
  'Channels to send an acknowledgment on after form submission (e.g. ["email", "whatsapp"]).';
COMMENT ON COLUMN public.campaigns.acknowledgment_email_template_id IS
  'DataAlchemy orchestrator template_id used for the candidate acknowledgment email.';

-- ── candidate_applications: ack tracking columns ─────────────

ALTER TABLE public.candidate_applications
  ADD COLUMN IF NOT EXISTS ack_email_status  text
    CHECK (ack_email_status IN ('sent', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS ack_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS source_channel  text;

COMMENT ON COLUMN public.candidate_applications.ack_email_status IS
  'Result of the acknowledgment email attempt: sent | failed | skipped.';
COMMENT ON COLUMN public.candidate_applications.ack_sent_at IS
  'Timestamp when the acknowledgment email was successfully delivered to the orchestrator.';
COMMENT ON COLUMN public.candidate_applications.source_channel IS
  'Attribution channel source (e.g. whatsapp, linkedin, job_portal) resolved from tracking link or client parameter.';
