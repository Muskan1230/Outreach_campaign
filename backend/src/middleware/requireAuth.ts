import { supabase } from '../lib/supabase.js'
import type { Request, Response, NextFunction } from 'express'

// Extend the Express Request type so downstream handlers can access req.user
export interface AuthenticatedRequest extends Request {
  user: {
    id: string
    email?: string
    role?: string
  }
}

/**
 * requireAuth — Express middleware that verifies a Supabase JWT.
 *
 * Expects: `Authorization: Bearer <access_token>` header.
 * On success: attaches `req.user` (id, email) and calls `next()`.
 * On failure: responds 401.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ message: 'Unauthorized — invalid or expired token' })
    return
  }

  // Attach user to request for downstream handlers
  ;(req as AuthenticatedRequest).user = {
    id: user.id,
    email: user.email,
    role: user.role,
  }

  next()
}
