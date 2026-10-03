import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const port = Number.parseInt(process.env.PORT || '4173', 10);
const apiOrigin = new URL(process.env.API_ORIGIN || 'http://127.0.0.1:3000');
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function proxyApi(request, response) {
  const target = new URL(request.url, apiOrigin);
  const requestUpstream = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = requestUpstream(target, {
    method: request.method,
    headers: { ...request.headers, host: target.host }
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', (error) => {
    if (response.headersSent) return response.destroy(error);
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ error: { code: 'API_UNAVAILABLE', message: 'Local backend is unavailable' } }));
  });
  request.pipe(upstream);
}

createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith('/api/')) {
    proxyApi(request, response);
    return;
  }
  if (url.searchParams.has('wc-ajax')) {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ success: true, data: [], fragments: {} }));
    return;
  }
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = normalize(join(root, requested));

  if (!file.startsWith(`${root}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
    console.warn(`404 ${pathname}`);
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const cacheControl = /\/assets\//.test(pathname)
    ? 'public, max-age=604800'
    : 'no-cache';
  response.writeHead(200, {
    'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`TVShop frontend: http://127.0.0.1:${port}`);
  console.log(`API proxy: ${apiOrigin.origin}`);
});
