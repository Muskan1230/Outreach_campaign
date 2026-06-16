-- ============================================================
-- Migration 009: File Upload — Storage Metadata Columns
-- ============================================================
-- Goals:
--   1. Add storage_path, mime_type, file_size columns to documents.
--   2. Ensure RLS policies are in place for anon inserts.
--   3. Document the manual Supabase Storage bucket setup.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Add storage metadata columns to documents
-- ------------------------------------------------------------
-- storage_path : the path inside the Supabase Storage bucket
--                e.g. "applications/<appId>/<fieldId>_1718000000000.pdf"
-- mime_type    : IANA MIME type of the uploaded file
--                e.g. "application/pdf", "image/jpeg"
-- file_size    : file size in bytes

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type    TEXT,
  ADD COLUMN IF NOT EXISTS file_size    BIGINT;

-- Optional: index for quick lookups by storage path
CREATE INDEX IF NOT EXISTS documents_storage_path_idx
  ON public.documents (storage_path)
  WHERE storage_path IS NOT NULL;

-- ------------------------------------------------------------
-- 2) RLS for documents — ensure anon can insert (idempotent)
-- ------------------------------------------------------------
-- These were created in migration 005 but are repeated here
-- as idempotent guards in case this migration runs standalone.

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_document" ON public.documents;
CREATE POLICY "anon_insert_document"
  ON public.documents
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "internal_all_documents" ON public.documents;
CREATE POLICY "internal_all_documents"
  ON public.documents
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- 3) Storage bucket setup — MANUAL STEP REQUIRED
-- ------------------------------------------------------------
-- Supabase Storage buckets cannot be created via SQL migrations.
-- You MUST manually create the bucket in the Supabase Dashboard:
--
--   Dashboard → Storage → New bucket
--   Name:    candidate-documents
--   Public:  NO (private — the Express backend uploads via
--            the service_role key which bypasses RLS)
--
-- Once the bucket exists, all uploads from the backend will
-- stream directly into it using the service-role client.
-- ------------------------------------------------------------

-- Done
