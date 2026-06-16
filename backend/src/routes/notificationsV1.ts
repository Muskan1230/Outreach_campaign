/**
 * notificationsV1.ts
 *
 * Versioned notification routes that proxy to the DataAlchemy orchestrator.
 *
 * Endpoints exposed (all protected by recruiter JWT via requireAuth):
 *
 *   POST /api/v1/tenant/templates
 *     → Endpoint 1: Create a raw notification template
 *
 *   POST /api/v1/notifications/send
 *     → Endpoint 7: Send a single notification using a saved template
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import {
  createOrchestratorTemplate,
  sendOrchestratorNotification,
} from '../lib/notificationOrchestrator.js'

const router = Router()

function handleError(error: unknown, next: NextFunction) {
  // Surface orchestrator-specific HTTP status when available
  const orchError = error as { status?: number; data?: unknown } & Error
  if (orchError.status) {
    return next(
      Object.assign(new Error(orchError.message), {
        status: orchError.status,
        data: orchError.data,
      }),
    )
  }
  return next(error)
}

// ── Endpoint 1: POST /api/v1/tenant/templates ─────────────────────────────────

const brandingSchema = z
  .object({
    company_name: z.string().trim().optional(),
    theme_color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{3,6}$/, 'theme_color must be a valid hex colour (e.g. #2563eb)')
      .optional(),
    contact_email: z.string().email('contact_email must be a valid email').optional(),
    website: z.string().url('website must be a valid URL').optional(),
  })
  .nullable()
  .optional()

const createTemplateSchema = z.object({
  // Required fields
  name: z.string().trim().min(1, 'Template name is required'),
  channel: z.string().trim().min(1, 'Channel is required'),
  language: z.string().trim().min(2, 'Language code is required (e.g. "en")'),
  body: z.string().trim().min(1, 'Template body is required'),

  // Required for email channel, optional for others
  subject: z.string().trim().optional(),

  // Optional enrichment fields
  base_template_id: z.string().trim().nullable().optional(),
  provider_template_ref: z.string().trim().nullable().optional(),
  provider_template_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  description: z.string().trim().nullable().optional(),
  branding: brandingSchema,
})

/**
 * POST /api/v1/tenant/templates
 *
 * Create and save a notification template in the orchestrator.
 *
 * Sample request body:
 * {
 *   "name": "candidate_interview_email",
 *   "channel": "email",
 *   "language": "en",
 *   "subject": "Your interview is scheduled",
 *   "body": "Hi {{name}}, your interview is on {{interview_date}} at {{interview_time}}."
 * }
 */
router.post('/tenant/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[POST /api/v1/tenant/templates] body:', JSON.stringify(req.body, null, 2))

    const payload = createTemplateSchema.parse(req.body)
    const result = await createOrchestratorTemplate(payload as Record<string, unknown>)

    console.log('[POST /api/v1/tenant/templates] orchestrator response:', JSON.stringify(result))
    return res.status(201).json(result)
  } catch (error) {
    console.error(
      '[POST /api/v1/tenant/templates] error:',
      error instanceof Error ? error.message : error,
    )
    return handleError(error, next)
  }
})

// ── Endpoint 7: POST /api/v1/notifications/send ───────────────────────────────

const recipientSchema = z.object({
  user_id: z.string().trim().min(1, 'recipient.user_id is required'),
  email: z.string().email('recipient.email must be a valid email address').optional(),
  phone: z.string().trim().optional(),
})

const notificationPayloadSchema = z.object({
  type: z.string().trim().min(1, 'notification.type is required'),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  channels: z
    .array(z.string().trim().min(1))
    .min(1, 'notification.channels must contain at least one channel'),
  template_id: z.string().trim().min(1, 'notification.template_id is required'),
  data: z.record(z.string(), z.unknown()).optional().default({}),
})

const sendNotificationSchema = z.object({
  recipient: recipientSchema,
  notification: notificationPayloadSchema,
})

/**
 * POST /api/v1/notifications/send
 *
 * Send one notification to one recipient using a saved orchestrator template.
 *
 * Sample request body:
 * {
 *   "recipient": {
 *     "user_id": "candidate_001",
 *     "email": "arjun.rao@example.com"
 *   },
 *   "notification": {
 *     "type": "interview_email",
 *     "priority": "high",
 *     "channels": ["email"],
 *     "template_id": "demo_corp_candidate_i_email_abcd1234",
 *     "data": {
 *       "name": "Arjun",
 *       "interview_date": "2026-05-21",
 *       "interview_time": "11:00 AM"
 *     }
 *   }
 * }
 */
router.post('/notifications/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[POST /api/v1/notifications/send] body:', JSON.stringify(req.body, null, 2))

    const payload = sendNotificationSchema.parse(req.body)
    const result = await sendOrchestratorNotification(payload as Record<string, unknown>)

    console.log('[POST /api/v1/notifications/send] orchestrator response:', JSON.stringify(result))
    return res.status(200).json(result)
  } catch (error) {
    console.error(
      '[POST /api/v1/notifications/send] error:',
      error instanceof Error ? error.message : error,
    )
    return handleError(error, next)
  }
})

export default router
