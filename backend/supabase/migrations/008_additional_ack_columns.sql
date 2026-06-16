-- ============================================================
-- 008_additional_ack_columns.sql
--
-- Adds additional acknowledgment template config columns to campaigns.
-- ============================================================

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS acknowledgment_sms_template_id  text,
  ADD COLUMN IF NOT EXISTS acknowledgment_whatsapp_template_id  text;

COMMENT ON COLUMN public.campaigns.acknowledgment_sms_template_id IS
  'DataAlchemy orchestrator template_id used for the candidate acknowledgment SMS.';
COMMENT ON COLUMN public.campaigns.acknowledgment_whatsapp_template_id IS
  'DataAlchemy orchestrator template_id used for the candidate acknowledgment WhatsApp message.';
