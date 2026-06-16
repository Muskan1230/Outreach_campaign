/**
 * upload.ts — File upload endpoint for candidate application forms.
 *
 * POST /forms/:formId/fields/upload
 *   - Accepts multipart/form-data with a single "file" field.
 *   - Optionally accepts a "field_id" text field for path namespacing.
 *   - Validates MIME type and file size (max 10 MB).
 *   - Streams the file to the Supabase Storage bucket "candidate-documents"
 *     using the service-role client (bypasses bucket RLS).
 *   - Returns JSON: { storage_path, file_name, mime_type, file_size }
 *
 * This route is mounted on the PUBLIC router (no auth required) so that
 * anonymous candidates can upload their documents before form submission.
 */

import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { supabase } from '../lib/supabase.js'

const router = Router()

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

/** Allowed MIME types for candidate documents. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',                                                    // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
])

/** Human-readable list for error messages. */
const ALLOWED_EXTENSIONS = '.pdf, .jpg, .jpeg, .png, .doc, .docx'

// ── Multer (memory storage — streams directly to Supabase) ────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, callback) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(null, true)
    } else {
      callback(
        new Error(
          `File type "${file.mimetype}" is not allowed. Accepted types: ${ALLOWED_EXTENSIONS}.`,
        ),
      )
    }
  },
})

// ── Helper: derive a clean storage path ──────────────────────────────────────

function buildStoragePath(formId: string, fieldId: string, originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() ?? 'bin'
  const timestamp = Date.now()
  // Sanitize field_id and form_id so they are safe to embed in a path
  const safeForm = formId.replace(/[^a-zA-Z0-9-_]/g, '')
  const safeField = fieldId.replace(/[^a-zA-Z0-9-_]/g, '')
  return `applications/${safeForm}/${safeField}_${timestamp}.${ext}`
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
  '/forms/:formId/fields/upload',
  (req: Request, res: Response, next: NextFunction) => {
    // Run multer as middleware; surface multer errors as HTTP 400
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: `File is too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
          })
        }
        return res.status(400).json({ message: `Upload error: ${err.message}` })
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message })
      }
      next()
    })
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const formId = req.params.formId as string
      const file = req.file

      if (!file) {
        return res.status(400).json({ message: 'No file was provided. Please attach a file with field name "file".' })
      }

      // Double-check MIME type (belt-and-suspenders after multer filter)
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return res.status(400).json({
          message: `File type "${file.mimetype}" is not allowed. Accepted types: ${ALLOWED_EXTENSIONS}.`,
        })
      }

      // Optional field_id for namespacing; fall back to "doc"
      const fieldId = (typeof req.body?.field_id === 'string' && req.body.field_id.trim())
        ? req.body.field_id.trim()
        : 'doc'

      const storagePath = buildStoragePath(formId, fieldId, file.originalname)

      // Upload to Supabase Storage using the service-role client (bypasses RLS)
      const { error: uploadError } = await supabase.storage
        .from('candidate-documents')
        .upload(storagePath, file.buffer, {
          upsert: false,
          contentType: file.mimetype,
        })

      if (uploadError) {
        console.error('[upload] Supabase Storage upload failed:', uploadError.message)
        return res.status(502).json({
          message: `File storage failed: ${uploadError.message}`,
        })
      }

      console.log(`[upload] Stored ${file.originalname} → ${storagePath} (${file.size} bytes)`)

      return res.status(200).json({
        storage_path: storagePath,
        file_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
      })
    } catch (error) {
      return next(error)
    }
  },
)

export default router
