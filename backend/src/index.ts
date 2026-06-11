import express, { Router } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { ZodError } from 'zod'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import rateLimit from 'express-rate-limit'
import campaignsRouter from './routes/campaigns.js'
import formsRouter from './routes/forms.js'
import templatesRouter from './routes/templates.js'
import applyRouter from './routes/apply.js'
import trackingLinksRouter from './routes/trackingLinks.js'
import { requireAuth } from './middleware/requireAuth.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const app = express()
const port = Number(process.env.PORT ?? 3001)
const clientOrigins = process.env.CLIENT_ORIGIN
  ?.split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: clientOrigins && clientOrigins.length > 0 ? clientOrigins : true,
  }),
)
app.use(express.json({ limit: '1mb' }))

// ── Public routes (no auth required) ─────────────────────────────────────────

// Rate limiter for form submission: max 5 per IP per 15 minutes
const submitRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip
    return (
      ip === '::1' ||
      ip === '127.0.0.1' ||
      ip === '::ffff:127.0.0.1' ||
      process.env.NODE_ENV === 'test'
    )
  },
  message: { message: 'Too many submissions from this device. Please wait 15 minutes before trying again.' },
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

// Candidate apply — form load (GET) + submit (POST) — no login required.
// These are mounted via a public router BEFORE the auth-guarded /api block.
const publicRouter = Router()
publicRouter.get('/forms/:id', (req, res, next) => formsRouter(req, res, next))
publicRouter.post('/forms/:id/submit', submitRateLimiter, (req, res, next) => formsRouter(req, res, next))

// Candidate application status — no login required
publicRouter.get('/apply/status/:mobile', (req, res, next) => applyRouter(req, res, next))

// Tracking link click counter — public, called from candidate apply page (fire-and-forget)
publicRouter.post('/tracking-links/:linkId/click', (req, res, next) => trackingLinksRouter(req, res, next))

app.use('/api', publicRouter)

// ── Protected routes (recruiter — valid Supabase JWT required) ────────────────

app.use('/api/campaigns', requireAuth, campaignsRouter)
app.use('/api/templates', requireAuth, templatesRouter)

// Tracking links — protected CRUD (create, list, deactivate) for recruiters
// Note: the public click route is mounted above in publicRouter
app.use('/api', requireAuth, trackingLinksRouter)

// All remaining /api/forms routes (list, create, edit, fields) + submissions
app.use('/api', requireAuth, formsRouter)

// ── Global error handler ──────────────────────────────────────────────────────

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API error:', error)

  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error'
  const status = message.includes('not found') ? 404 : 500
  res.status(status).json({
    message,
  })
})

app.listen(port, () => {
  console.log(`Campaign API listening on port ${port}`)
})
