import type { PoolClient } from 'pg';

export interface AuditInput {
  actorUserId?: string | null;
  storeId?: string | null;
  vendorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  requestId?: string | null;
  ipHash?: string | null;
}

export async function writeAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(`
    INSERT INTO audit_logs (
      actor_user_id, store_id, vendor_id, action, entity_type, entity_id,
      before_data, after_data, request_id, ip_hash
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [
    input.actorUserId ?? null,
    input.storeId ?? null,
    input.vendorId ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.beforeData ? JSON.stringify(input.beforeData) : null,
    input.afterData ? JSON.stringify(input.afterData) : null,
    input.requestId ?? null,
    input.ipHash ?? null
  ]);
}
