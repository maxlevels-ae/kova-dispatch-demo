import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import jwt from 'jsonwebtoken';
import { auth } from './config';

/**
 * Guard an API route. Returns { session } on success or
 * { error: Response } to return directly.
 *
 * @param {string[]} [roles] - Allowed roles. Omit for any authenticated user.
 */
export async function requireAuth(roles) {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (roles && roles.length > 0 && !roles.includes(session.user.role)) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  // Recheck active status and role for privileged requests; stale JWTs cannot retain admin access.
  if (roles?.includes('admin')) {
    try {
      await connectDB();
      const current = await User.findById(session.user.id).select('role isActive').lean();
      if (!current?.isActive || current.role !== 'admin') return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
    } catch { return { error: Response.json({ error: 'Authorization unavailable' }, { status: 503 }) }; }
  }
  return { session };
}

/**
 * Sign a short-lived JWT used to authenticate Socket.IO connections.
 * server.js verifies it with the same secret.
 */
export function signSocketToken(user, extraClaims = {}) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set');
  }
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      name: user.name || '',
      ...extraClaims,
    },
    secret,
    { expiresIn: '12h' }
  );
}
