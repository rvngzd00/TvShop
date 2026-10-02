import type { FastifyRequest } from 'fastify';
import { forbidden } from './errors.js';
import type { ActorContext } from '../types/fastify.js';

export function actorOf(request: FastifyRequest): ActorContext {
  if (!request.actor) throw forbidden('Autentifikasi tələb olunur');
  return request.actor;
}

export function assertStoreScope(actor: ActorContext, storeId: string): void {
  if (!actor.isSuperAdmin && !actor.storeIds.includes(storeId)) throw forbidden('Store icazəsi yoxdur');
}

export function assertVendorScope(actor: ActorContext, vendorId: string): void {
  if (!actor.isSuperAdmin && !actor.vendorIds.includes(vendorId)) throw forbidden('Satıcı icazəsi yoxdur');
}

export function vendorScope(actor: ActorContext, startIndex: number): { sql: string; params: string[] } {
  if (actor.isSuperAdmin || actor.vendorIds.length === 0 && actor.permissions.has('vendors.manage')) {
    return { sql: '', params: [] };
  }
  return { sql: ` AND vendor_id = ANY($${startIndex}::uuid[])`, params: actor.vendorIds };
}
