import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'

const router = Router()

const listQuerySchema = z.object({
  unreadOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .default('false'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

function handleError(error: unknown, next: NextFunction) {
  return next(error)
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest
    const { unreadOnly, limit } = listQuerySchema.parse(req.query)

    let query = supabase
      .from('recruiter_notifications')
      .select('*')
      .eq('recruiter_id', authReq.user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly === 'true') {
      query = query.eq('is_read', false)
    }

    const [{ data, error }, { count: unreadCount, error: unreadCountError }] = await Promise.all([
      query,
      supabase
        .from('recruiter_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recruiter_id', authReq.user.id)
        .eq('is_read', false),
    ])

    if (error) throw error
    if (unreadCountError) throw unreadCountError

    return res.json({
      data: data ?? [],
      unread_count: unreadCount ?? 0,
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest

    const { count, error } = await supabase
      .from('recruiter_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recruiter_id', authReq.user.id)
      .eq('is_read', false)

    if (error) throw error

    return res.json({ unread_count: count ?? 0 })
  } catch (error) {
    return handleError(error, next)
  }
})

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest
    const notificationId = z.string().uuid().parse(req.params.id)

    const { data, error } = await supabase
      .from('recruiter_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', notificationId)
      .eq('recruiter_id', authReq.user.id)
      .select('*')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Notification not found' })
      }
      throw error
    }

    return res.json(data)
  } catch (error) {
    return handleError(error, next)
  }
})

router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest

    const { error } = await supabase
      .from('recruiter_notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('recruiter_id', authReq.user.id)
      .eq('is_read', false)

    if (error) throw error

    return res.json({ message: 'Notifications marked as read' })
  } catch (error) {
    return handleError(error, next)
  }
})

export default router
