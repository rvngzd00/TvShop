import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { actorOf, assertStoreScope, assertVendorScope } from '../core/scope.js';
import { badRequest, forbidden, notFound } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';

const extensions = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/avif', '.avif'],
  ['application/pdf', '.pdf'], ['video/mp4', '.mp4'], ['video/webm', '.webm']
]);

function detectedMimeType(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 4).toString('hex') === '1a45dfa3') return 'video/webm';
  if (buffer.subarray(4, 8).toString() === 'ftyp') {
    const brands = buffer.subarray(8, 36).toString('ascii');
    return /avif|avis/.test(brands) ? 'image/avif' : 'video/mp4';
  }
  return null;
}

function normalizedDeclaredMime(value: string): string {
  const mime = value.toLowerCase().split(';', 1)[0]?.trim() || '';
  return mime === 'image/jpg' || mime === 'image/pjpeg' ? 'image/jpeg' : mime;
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.requirePermission('media.read') }, async (request) => {
    const actor = actorOf(request);
    const params: unknown[] = [];
    const where = ['1=1'];
    if (actor.vendorIds.length) {
      params.push(actor.vendorIds);
      where.push(`vendor_id=ANY($${params.length}::uuid[])`);
    } else if (!actor.isSuperAdmin) {
      params.push(actor.storeIds);
      where.push(`store_id=ANY($${params.length}::uuid[])`);
    }
    const result = await pool.query(`SELECT * FROM media_assets WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`, params);
    return { data: result.rows };
  });

  app.post('/', { preHandler: app.requirePermission('media.upload') }, async (request, reply) => {
    const part = await request.file();
    if (!part) throw badRequest('FILE_REQUIRED', 'Fayl tələb olunur');
    // Multipart fields that follow the file are not guaranteed to be populated
    // until the file stream has been consumed. Read the stream first so uploads
    // behave identically regardless of browser/FormData field ordering.
    const buffer = await part.toBuffer();
    const fields = part.fields as Record<string, { value?: unknown }>;
    const input = z.object({
      storeId: z.uuid(), vendorId: z.uuid().optional(), altText: z.string().trim().max(300).default(''), title: z.string().trim().max(300).default('')
    }).parse({
      storeId: fields['storeId']?.value,
      vendorId: fields['vendorId']?.value || undefined,
      altText: fields['altText']?.value ?? '',
      title: fields['title']?.value ?? ''
    });
    const actor = actorOf(request);
    assertStoreScope(actor, input.storeId);
    if (input.vendorId) {
      const vendor = await pool.query('SELECT store_id FROM vendors WHERE id=$1 AND deleted_at IS NULL', [input.vendorId]);
      if (!vendor.rows[0] || vendor.rows[0].store_id !== input.storeId) throw notFound('Satıcı');
      if (actor.vendorIds.length) assertVendorScope(actor, input.vendorId);
    }
    if (actor.vendorIds.length && !input.vendorId) throw badRequest('VENDOR_REQUIRED', 'Satıcı faylı vendor scope ilə yüklənməlidir');

    const detectedMime = detectedMimeType(buffer);
    if (!detectedMime || !extensions.has(detectedMime)) throw badRequest('FILE_TYPE_REJECTED', 'Fayl JPG, PNG, WEBP, AVIF, PDF, MP4 və ya WEBM formatında olmalıdır');
    const declaredMime = normalizedDeclaredMime(part.mimetype);
    if (declaredMime && declaredMime !== 'application/octet-stream' && extensions.has(declaredMime) && declaredMime !== detectedMime) {
      throw badRequest('FILE_SIGNATURE_INVALID', 'Fayl məzmunu seçilən formatla uyğun deyil');
    }
    if (detectedMime.startsWith('image/') && !input.altText) throw badRequest('ALT_REQUIRED', 'Şəkil üçün alt mətni SEO və əlçatanlıq baxımından tələb olunur');

    const extension = extensions.get(detectedMime)!;
    const key = `${input.storeId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${extension}`;
    const directory = resolve(env.UPLOAD_DIR, input.storeId, new Date().toISOString().slice(0, 7));
    const target = resolve(env.UPLOAD_DIR, key);
    await mkdir(directory, { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' });
    try {
      const data = await withTransaction(async (client) => {
        const result = await client.query(`
          INSERT INTO media_assets(store_id,vendor_id,uploaded_by,storage_key,public_url,mime_type,byte_size,alt_text,title,metadata)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
        `, [input.storeId, input.vendorId ?? null, actor.userId, key, `/uploads/${key}`, detectedMime, buffer.length, input.altText, input.title, JSON.stringify({ originalName: part.filename, sourceExtension: extname(part.filename) })]);
        await writeAudit(client, { actorUserId: actor.userId, storeId: input.storeId, vendorId: input.vendorId ?? null, action: 'media.upload', entityType: 'media_asset', entityId: result.rows[0].id, afterData: { storageKey: key, mimeType: detectedMime, byteSize: buffer.length }, requestId: request.id });
        return result.rows[0];
      });
      return reply.code(201).send({ data });
    } catch (error) {
      await unlink(target).catch(() => undefined);
      throw error;
    }
  });

  app.patch('/:id', { preHandler: app.requirePermission('media.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const input = z.object({ altText: z.string().trim().max(300), title: z.string().trim().max(300) }).partial().parse(request.body);
    const actor = actorOf(request);
    const current = await pool.query('SELECT * FROM media_assets WHERE id=$1', [id]);
    const row = current.rows[0];
    if (!row) throw notFound('Media');
    assertStoreScope(actor, row.store_id);
    if (actor.vendorIds.length) {
      if (!row.vendor_id) throw notFound('Media');
      assertVendorScope(actor, row.vendor_id);
    }
    const result = await pool.query('UPDATE media_assets SET alt_text=coalesce($2,alt_text),title=coalesce($3,title) WHERE id=$1 RETURNING *', [id, input.altText ?? null, input.title ?? null]);
    return { data: result.rows[0] };
  });

  app.delete('/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const actor = actorOf(request);
    const current = await pool.query('SELECT * FROM media_assets WHERE id=$1', [id]);
    const row = current.rows[0];
    if (!row) throw notFound('Media');
    const canManage = actor.permissions.has('media.manage');
    const canRemoveOwnUpload = actor.permissions.has('media.upload') && row.uploaded_by === actor.userId;
    if (!canManage && !canRemoveOwnUpload) throw forbidden('Bu media faylını silmək icazəniz yoxdur');
    assertStoreScope(actor, row.store_id);
    if (actor.vendorIds.length) {
      if (!row.vendor_id) throw notFound('Media');
      assertVendorScope(actor, row.vendor_id);
    }
    const usage = await pool.query<{ count: number }>(`
      SELECT (SELECT count(*) FROM product_media WHERE media_asset_id=$1)
        +(SELECT count(*) FROM products WHERE video_asset_id=$1)
        +(SELECT count(*) FROM categories WHERE image_asset_id=$1)
        +(SELECT count(*) FROM brands WHERE logo_asset_id=$1)
        +(SELECT count(*) FROM posts WHERE featured_asset_id=$1)
        +(SELECT count(*) FROM rewards WHERE image_asset_id=$1)
        +(SELECT count(*) FROM journal_issues WHERE cover_asset_id=$1 OR pdf_asset_id=$1)
        +(SELECT count(*) FROM classified_media WHERE media_asset_id=$1) AS count
    `, [id]);
    if (Number(usage.rows[0]?.count)) throw badRequest('MEDIA_IN_USE', 'İstifadədə olan fayl silinə bilməz');
    await pool.query('DELETE FROM media_assets WHERE id=$1', [id]);
    await unlink(resolve(env.UPLOAD_DIR, row.storage_key)).catch(() => undefined);
    return reply.code(204).send();
  });
}
