import { dirname, join, resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { AppError } from './core/errors.js';
import { authContextPlugin } from './auth/context.js';
import { cookieNames } from './auth/cookies.js';
import { authRoutes } from './auth/routes.js';
import { healthRoutes } from './routes/health.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { vendorRoutes } from './routes/vendors.js';
import { userRoutes } from './routes/users.js';
import { catalogRoutes } from './routes/catalog.js';
import { orderRoutes } from './routes/orders.js';
import { contentRoutes } from './routes/content.js';
import { marketingRoutes } from './routes/marketing.js';
import { publicRoutes } from './routes/public.js';
import { mediaRoutes } from './routes/media.js';
import { checkoutRoutes } from './routes/checkout.js';
import { customerRoutes } from './routes/customer.js';
import { settingsRoutes } from './routes/settings.js';
import { loyaltyRoutes } from './routes/loyalty.js';
import { notificationRoutes } from './routes/notifications.js';
import { publishingRoutes } from './routes/publishing.js';
import { publicSiteEditorRoutes, siteEditorRoutes } from './routes/site-editor.js';
import { publicTvRoutes, tvRoutes } from './routes/tv.js';
import { notFoundPage, webRoutes } from './web/routes.js';

const here = dirname(fileURLToPath(import.meta.url));
const adminPanelRoles = new Set(['super_admin', 'admin', 'editor', 'seo', 'moderator']);
const vendorPanelRoles = new Set(['vendor_owner', 'vendor_staff']);

function allowedRequestOrigins(): ReadonlySet<string> {
  const primary = new URL(env.PUBLIC_ORIGIN).origin;
  const origins = new Set([primary]);

  for (const value of env.ALLOWED_ORIGINS.split(',')) {
    const candidate = value.trim();
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      throw new Error(`ALLOWED_ORIGINS contains an invalid URL: ${candidate}`);
    }
  }

  // The public storefront can be reached with or without www while Caddy
  // redirects www to the canonical hostname. Keep both valid during redirect
  // propagation so authenticated mutations do not fail for real visitors.
  if (primary === 'https://gundelikbaki.az') origins.add('https://www.gundelikbaki.az');
  if (primary === 'https://www.gundelikbaki.az') origins.add('https://gundelikbaki.az');
  return origins;
}

export async function buildApp(): Promise<FastifyInstance> {
  await mkdir(resolve(env.UPLOAD_DIR), { recursive: true });
  const logger = {
    level: env.LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie', 'password', '*.password'],
      censor: '[REDACTED]'
    },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {})
  };

  const app = Fastify({
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.MAX_UPLOAD_BYTES,
    requestIdHeader: 'x-request-id',
    logger
  }) as FastifyInstance;

  const allowedOrigins = allowedRequestOrigins();
  await app.register(cookie, { secret: env.COOKIE_SECRET, hook: 'onRequest' });
  await app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true
  });
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", 'https:'],
        frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://www.tiktok.com', 'https://www.instagram.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"]
      }
    }
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // The exported Home 6 theme requests hundreds of local assets on first load.
    // Static files and the inert WordPress compatibility endpoint must never
    // consume the API rate-limit budget.
    allowList: (request) => !request.url.startsWith('/api/') || request.url.startsWith('/api/wp-compat')
  });
  await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 10 } });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: cookieNames.access, signed: false }
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'TVShop CMS API', version: '1.0.0' },
      servers: [{ url: env.PUBLIC_ORIGIN }]
    }
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });
  await app.register(authContextPlugin);

  // Legacy WooCommerce scripts from the static export post URL-encoded data.
  // Parse it locally so those harmless compatibility calls do not fail with 415.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;

    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      throw new AppError(403, 'ORIGIN_REJECTED', 'Sorğunun origin-i qəbul edilmir');
    }

    const publicMutation = request.url.startsWith('/api/v1/auth/login')
      || request.url.startsWith('/api/v1/auth/vendor-login')
      || request.url.startsWith('/api/v1/auth/register')
      || request.url.startsWith('/api/v1/auth/vendor-register')
      || request.url.startsWith('/api/v1/auth/refresh')
      || request.url.startsWith('/api/v1/auth/forgot-password')
      || request.url.startsWith('/api/v1/auth/reset-password')
      || request.url.startsWith('/api/v1/auth/accept-invite')
      || request.url.startsWith('/api/wp-compat');
    if (!publicMutation && request.cookies[cookieNames.access]) {
      const cookieToken = request.cookies[cookieNames.csrf];
      const headerToken = request.headers['x-csrf-token'];
      if (!cookieToken || typeof headerToken !== 'string' || cookieToken !== headerToken) {
        throw new AppError(403, 'CSRF_REJECTED', 'CSRF token uyğun deyil');
      }
    }
  });

  // Register the shared error handler before encapsulated route plugins so every
  // API module returns the same stable error envelope.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Göndərilən məlumat yanlışdır', details: error.issues },
        requestId: request.id
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        requestId: request.id
      });
    }
    const candidate = error as Error & { code?: string; statusCode?: number; cause?: { code?: string } };
    if (candidate.code === '23505' || candidate.cause?.code === '23505') {
      return reply.code(409).send({ error: { code: 'DUPLICATE', message: 'Bu məlumat artıq mövcuddur' }, requestId: request.id });
    }
    if (candidate.statusCode && candidate.statusCode < 500) {
      return reply.code(candidate.statusCode).send({
        error: { code: candidate.code ?? 'REQUEST_ERROR', message: candidate.message },
        requestId: request.id
      });
    }
    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Daxili server xətası' }, requestId: request.id });
  });

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(vendorRoutes, { prefix: '/api/v1/vendors' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(catalogRoutes, { prefix: '/api/v1/catalog' });
  await app.register(orderRoutes, { prefix: '/api/v1/orders' });
  await app.register(contentRoutes, { prefix: '/api/v1/content' });
  await app.register(marketingRoutes, { prefix: '/api/v1/marketing' });
  await app.register(mediaRoutes, { prefix: '/api/v1/media' });
  await app.register(publicRoutes, { prefix: '/api/v1/public' });
  await app.register(publicTvRoutes, { prefix: '/api/v1/public' });
  await app.register(publicSiteEditorRoutes, { prefix: '/api/v1/public/site-editor' });
  await app.register(siteEditorRoutes, { prefix: '/api/v1/editor' });
  await app.register(checkoutRoutes, { prefix: '/api/v1/checkout' });
  await app.register(customerRoutes, { prefix: '/api/v1/customer' });
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });
  await app.register(loyaltyRoutes, { prefix: '/api/v1/loyalty' });
  await app.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await app.register(publishingRoutes, { prefix: '/api/v1/publishing' });
  await app.register(tvRoutes, { prefix: '/api/v1/tv' });
  await app.register(webRoutes);

  app.route({
    method: ['GET', 'POST'],
    url: '/api/wp-compat',
    handler: async () => ({ success: true, data: [], fragments: {} })
  });

  app.get('/q/:code', async (request, reply) => {
    const code = encodeURIComponent((request.params as { code: string }).code);
    return reply.redirect(`/api/v1/marketing/scan/${code}`);
  });
  app.get('/sitemap.xml', async (_request, reply) => reply.redirect('/api/v1/public/sitemap.xml'));

  const panelHtml = await readFile(join(here, '../admin/index.html'), 'utf8');
  const actorForPanelRequest = async (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) => {
    if (!request.cookies[cookieNames.access]) return null;
    try {
      await app.authenticate(request, reply);
      return request.actor;
    } catch {
      // An expired or otherwise invalid browser session must see the login view,
      // never a partially rendered management interface.
      return null;
    }
  };

  app.get('/satici-paneli', async (_request, reply) => reply.redirect('/satici-paneli/'));
  app.get('/satici-paneli/', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie');
    const actor = await actorForPanelRequest(request, reply);
    if (actor && !actor.roles.some((role) => vendorPanelRoles.has(role))) {
      const destination = actor.roles.some((role) => adminPanelRoles.has(role)) ? '/admin/' : '/hesabim/';
      return reply.redirect(destination, 303);
    }
    return reply.type('text/html; charset=utf-8').send(panelHtml);
  });

  app.get('/admin', async (_request, reply) => reply.redirect('/admin/', 308));
  app.get('/admin/index.html', async (_request, reply) => reply.redirect('/admin/', 308));
  app.get('/admin/', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('Vary', 'Cookie');
    const actor = await actorForPanelRequest(request, reply);
    if (actor) {
      if (actor.roles.some((role) => vendorPanelRoles.has(role))) {
        return reply.redirect('/satici-paneli/', 303);
      }
      if (!actor.roles.some((role) => adminPanelRoles.has(role))) {
        return reply.redirect('/hesabim/', 303);
      }
    }
    return reply.type('text/html; charset=utf-8').send(panelHtml);
  });
  await app.register(fastifyStatic, {
    root: join(here, '../admin'),
    prefix: '/admin/',
    decorateReply: false,
    index: ['index.html']
  });
  await app.register(fastifyStatic, {
    root: resolve(env.UPLOAD_DIR),
    prefix: '/uploads/',
    decorateReply: false,
    wildcard: false
  });
  await app.register(fastifyStatic, {
    root: join(here, '../../frontend'),
    prefix: '/',
    wildcard: false,
    index: ['index.html']
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'API əməliyyatı tapılmadı' },
        requestId: request.id
      });
    }
    const pathname = new URL(request.url, env.PUBLIC_ORIGIN).pathname;
    return reply
      .code(404)
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(notFoundPage(pathname));
  });

  return app;
}
