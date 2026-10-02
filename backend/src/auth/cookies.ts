import type { FastifyReply } from 'fastify';
import { env } from '../config/env.js';

export const cookieNames = {
  access: env.NODE_ENV === 'production' ? '__Host-db_access' : 'db_access',
  refresh: env.NODE_ENV === 'production' ? '__Host-db_refresh' : 'db_refresh',
  csrf: env.NODE_ENV === 'production' ? '__Host-db_csrf' : 'db_csrf'
} as const;

const common = {
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/'
};

export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
  csrfToken: string
): void {
  reply.setCookie(cookieNames.access, accessToken, {
    ...common, httpOnly: true, maxAge: 15 * 60
  });
  reply.setCookie(cookieNames.refresh, refreshToken, {
    ...common, httpOnly: true, maxAge: env.REFRESH_TOKEN_DAYS * 86_400
  });
  reply.setCookie(cookieNames.csrf, csrfToken, {
    ...common, httpOnly: false, maxAge: env.REFRESH_TOKEN_DAYS * 86_400
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  for (const name of Object.values(cookieNames)) reply.clearCookie(name, common);
}
