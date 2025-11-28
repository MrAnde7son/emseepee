import { logger } from "../logger.js";
import { getDatabaseConfig, isDatabaseInitialized, executeQueryOne, executeUpdate } from "../db/connection.js";
import type { OAuthMetadata } from "./metadataDiscovery.js";

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  registrationClientUri?: string;
  registrationAccessToken?: string;
  rawMetadata?: Record<string, unknown>;
  redirectUri?: string;
}

function normalizeTenantId(tenantId?: string | null): string | null {
  if (tenantId === undefined || tenantId === null || tenantId === "") {
    return null;
  }
  return tenantId;
}

async function getExistingClient(
  tenantId: string | null,
  mcpId: string
): Promise<RegisteredClient | null> {
  if (!isDatabaseInitialized()) {
    return null;
  }

  const config = getDatabaseConfig();
  const tenantParam = normalizeTenantId(tenantId);
  const query = config.type === "postgres"
    ? `SELECT client_id, client_secret, registration_client_uri, registration_access_token, issuer, redirect_uri, metadata
        FROM mcp_oauth_clients
        WHERE mcp_id = $1 AND tenant_id IS NOT DISTINCT FROM $2`
    : `SELECT client_id, client_secret, registration_client_uri, registration_access_token, issuer, redirect_uri, metadata
        FROM mcp_oauth_clients
        WHERE mcp_id = ? AND ((tenant_id IS NULL AND ? IS NULL) OR tenant_id = ?)`;
  const params = config.type === "postgres" ? [mcpId, tenantParam] : [mcpId, tenantParam, tenantParam];

  const row = await executeQueryOne<{
    client_id: string;
    client_secret?: string;
    registration_client_uri?: string;
    registration_access_token?: string;
    metadata?: Record<string, unknown> | string;
    issuer?: string;
    redirect_uri?: string;
  }>(query, params);

  if (!row) {
    return null;
  }

  const parsedMetadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;

  return {
    clientId: row.client_id,
    clientSecret: row.client_secret,
    registrationClientUri: row.registration_client_uri,
    registrationAccessToken: row.registration_access_token,
    rawMetadata: parsedMetadata ?? undefined,
    redirectUri: row.redirect_uri,
  };
}

async function saveClient(
  tenantId: string | null,
  mcpId: string,
  payload: RegisteredClient & { issuer?: string }
): Promise<void> {
  if (!isDatabaseInitialized()) {
    logger.warn("[OAUTH] Database not initialized; cannot persist dynamic client registration");
    return;
  }

  const config = getDatabaseConfig();
  const tenantParam = normalizeTenantId(tenantId);
  const metadataString = JSON.stringify(payload.rawMetadata ?? {});
  const params = config.type === "postgres"
    ? [mcpId, tenantParam, payload.clientId, payload.clientSecret ?? null, payload.registrationClientUri ?? null, payload.registrationAccessToken ?? null, payload.redirectUri ?? null, payload.issuer ?? null, metadataString]
    : [mcpId, tenantParam, payload.clientId, payload.clientSecret ?? null, payload.registrationClientUri ?? null, payload.registrationAccessToken ?? null, payload.redirectUri ?? null, payload.issuer ?? null, metadataString, mcpId, tenantParam, tenantParam];

  const query = config.type === "postgres"
    ? `INSERT INTO mcp_oauth_clients (mcp_id, tenant_id, client_id, client_secret, registration_client_uri, registration_access_token, redirect_uri, issuer, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (mcp_id, tenant_id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         registration_client_uri = EXCLUDED.registration_client_uri,
         registration_access_token = EXCLUDED.registration_access_token,
         redirect_uri = EXCLUDED.redirect_uri,
         issuer = EXCLUDED.issuer,
         metadata = EXCLUDED.metadata,
         updated_at = CURRENT_TIMESTAMP`
    : `INSERT INTO mcp_oauth_clients (mcp_id, tenant_id, client_id, client_secret, registration_client_uri, registration_access_token, redirect_uri, issuer, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mcp_id, tenant_id) DO UPDATE SET
         client_id = excluded.client_id,
         client_secret = excluded.client_secret,
         registration_client_uri = excluded.registration_client_uri,
         registration_access_token = excluded.registration_access_token,
         redirect_uri = excluded.redirect_uri,
         issuer = excluded.issuer,
         metadata = excluded.metadata,
         updated_at = CURRENT_TIMESTAMP`;

  await executeUpdate(query, params);
}

export async function getOrRegisterClientForMcp(
  tenantId: string | null,
  mcpId: string,
  oauthMetadata: OAuthMetadata,
  redirectUri: string
): Promise<RegisteredClient | null> {
  const existing = await getExistingClient(tenantId, mcpId);
  if (existing) {
    return existing;
  }

  if (!oauthMetadata.registration_endpoint) {
    logger.info(`[OAUTH] No registration endpoint for ${mcpId}; skipping dynamic registration`);
    return null;
  }

  try {
    const payload = {
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      application_type: "web",
      client_name: "Hakuna Gateway",
    };

    const response = await fetch(oauthMetadata.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn(`[OAUTH] Dynamic registration failed for ${mcpId}: ${response.status} ${text}`);
      return null;
    }

    const result = await response.json() as Record<string, unknown>;
    const clientId = result.client_id as string | undefined;
    if (!clientId) {
      logger.warn(`[OAUTH] Dynamic registration missing client_id for ${mcpId}`);
      return null;
    }

    const registered: RegisteredClient = {
      clientId,
      clientSecret: result.client_secret as string | undefined,
      registrationClientUri: result.registration_client_uri as string | undefined,
      registrationAccessToken: result.registration_access_token as string | undefined,
      rawMetadata: result,
      redirectUri,
    };

    await saveClient(tenantId, mcpId, { ...registered, issuer: oauthMetadata.issuer });
    logger.info(`[OAUTH] Registered dynamic client for ${mcpId}`);
    return registered;
  } catch (error) {
    logger.warn(`[OAUTH] Dynamic registration error for ${mcpId}:`, error);
    return null;
  }
}
