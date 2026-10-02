import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { cookieNames } from '../auth/cookies.js';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

const customerCookie = env.NODE_ENV === 'production' ? '__Host-db_customer' : 'db_customer';

export type CustomerIdentity = {
  userId: string | null;
  anonymousId: string | null;
};

function validUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

async function activeUserId(request: FastifyRequest): Promise<string | null> {
  if (!request.cookies[cookieNames.access]) return null;
  try {
    await request.jwtVerify({ onlyCookie: true });
    const result = await pool.query(`
      SELECT 1 FROM refresh_sessions rs
      JOIN users u ON u.id=rs.user_id
      WHERE rs.id=$1 AND rs.user_id=$2 AND rs.revoked_at IS NULL
        AND rs.rotated_at IS NULL AND rs.expires_at>now()
        AND u.status='active' AND u.deleted_at IS NULL
    `, [request.user.sessionId, request.user.sub]);
    return result.rows[0] ? request.user.sub : null;
  } catch {
    return null;
  }
}

export async function customerRateLimitKey(request: FastifyRequest): Promise<string> {
  const userId = await activeUserId(request);
  if (userId) return `customer:user:${userId}`;

  const rawCookie = request.cookies[customerCookie];
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
  if (unsigned?.valid && validUuid(unsigned.value)) {
    return `customer:guest:${unsigned.value}`;
  }

  return `customer:ip:${request.ip}`;
}

export async function resolveCustomerIdentity(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<CustomerIdentity> {
  const userId = await activeUserId(request);
  if (userId) return { userId, anonymousId: null };

  const rawCookie = request.cookies[customerCookie];
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
  const anonymousId = unsigned?.valid && validUuid(unsigned.value) ? unsigned.value : randomUUID();

  if (!unsigned?.valid || unsigned.value !== anonymousId) {
    reply.setCookie(customerCookie, anonymousId, {
      path: '/',
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 31_536_000
    });
  }

  return { userId: null, anonymousId };
}

export function clearCustomerIdentity(reply: FastifyReply): void {
  reply.clearCookie(customerCookie, {
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production'
  });
}

export function identityWhere(identity: CustomerIdentity, userColumn = 'user_id', anonymousColumn = 'anonymous_id'): {
  clause: string;
  value: string;
} {
  return identity.userId
    ? { clause: `${userColumn}=$1`, value: identity.userId }
    : { clause: `${anonymousColumn}=$1`, value: identity.anonymousId! };
}
