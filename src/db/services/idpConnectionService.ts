import { executeQuery, executeUpdate } from "../connection.js";
import type { IdpConnection, IdpType } from "../../integrations/idp/types.js";

function mapRow(row: Record<string, unknown>): IdpConnection {
  return {
    id: Number(row.id),
    tenantId: String(row.tenant_id),
    type: row.type as IdpType,
    issuer: String(row.issuer),
    clientId: String(row.client_id),
    clientSecret: row.client_secret as string | undefined,
    metadata: (typeof row.metadata === "string"
      ? JSON.parse(row.metadata)
      : (row.metadata as Record<string, unknown> | null)) || {},
  };
}

export async function getIdpConnectionsByTenant(tenantId: string): Promise<IdpConnection[]> {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT * FROM idp_connections WHERE tenant_id = $1 ORDER BY id DESC`,
    [tenantId]
  );
  return rows.map(mapRow);
}

export async function getIdpConnectionByTenantAndType(
  tenantId: string,
  type: IdpType
): Promise<IdpConnection | null> {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT * FROM idp_connections WHERE tenant_id = $1 AND type = $2 LIMIT 1`,
    [tenantId, type]
  );
  if (rows.length === 0) {
    return null;
  }
  return mapRow(rows[0]);
}

export async function createOrUpdateIdpConnection(params: {
  tenantId: string;
  type: IdpType;
  issuer: string;
  clientId: string;
  clientSecret?: string;
  metadata?: Record<string, unknown>;
}): Promise<IdpConnection> {
  const { tenantId, type, issuer, clientId, clientSecret, metadata = {} } = params;

  await executeUpdate(
    `INSERT INTO idp_connections (tenant_id, type, issuer, client_id, client_secret, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, type) DO UPDATE SET
       issuer = excluded.issuer,
       client_id = excluded.client_id,
       client_secret = excluded.client_secret,
       metadata = excluded.metadata,
       updated_at = CURRENT_TIMESTAMP`,
    [tenantId, type, issuer, clientId, clientSecret, JSON.stringify(metadata)]
  );

  const connection = await getIdpConnectionByTenantAndType(tenantId, type);
  if (!connection) {
    throw new Error("Failed to upsert IdP connection");
  }
  return connection;
}

export async function deleteIdpConnection(id: number, tenantId: string): Promise<void> {
  await executeUpdate(`DELETE FROM idp_connections WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}
