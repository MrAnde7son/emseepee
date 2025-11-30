import { logger } from "../logger.js";
import { getDatabaseConfig, isDatabaseInitialized, executeQueryOne, executeUpdate } from "../db/connection.js";
import type { OAuthMetadata } from "./metadataDiscovery.js";
import https from "https";
import http from "http";
import { Agent as HttpsAgent } from "https";

// Lazy singleton for an insecure HTTPS agent (used only when explicitly allowed)
let insecureAgent: HttpsAgent | null = null;
function getInsecureAgent(): HttpsAgent {
  if (!insecureAgent) {
    insecureAgent = new HttpsAgent({ rejectUnauthorized: false });
  }
  return insecureAgent;
}

/**
 * Fetch using Node's https/http modules with support for insecure TLS
 */
async function fetchWithCustomTLS(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number; allowInsecureTLS?: boolean } = {}
): Promise<{ status: number; statusText: string; body: string; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;
    
    const requestOptions: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: {
        "User-Agent": "hakuna-mcp-gateway/1.0",
        ...options.headers,
      },
    };

    // Use insecure agent if allowed
    if (isHttps && options.allowInsecureTLS) {
      requestOptions.agent = getInsecureAgent();
    }

    const timeout = options.timeout || 10000;
    let timeoutId: NodeJS.Timeout | null = null;

    const req = client.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });
      
      res.on("end", () => {
        if (timeoutId) clearTimeout(timeoutId);
        const body = Buffer.concat(chunks).toString();
        const headers: Record<string, string> = {};
        
        // Handle headers (support both headersDistinct and headers for compatibility)
        if (res.headersDistinct) {
          Object.keys(res.headersDistinct).forEach((key) => {
            const values = res.headersDistinct![key];
            headers[key] = Array.isArray(values) ? values.join(", ") : values || "";
          });
        } else if (res.headers) {
          Object.keys(res.headers).forEach((key) => {
            const value = res.headers[key];
            headers[key] = Array.isArray(value) ? value.join(", ") : value || "";
          });
        }
        
        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || "",
          body,
          headers,
        });
      });
    });

    req.on("error", (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });

    timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms while fetching ${url}`));
    }, timeout);

    // Write body if present
    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

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
  // Both PostgreSQL and SQLite use the same 9 parameters for the VALUES clause
  // The ON CONFLICT clause uses EXCLUDED/excluded keywords, not parameters
  const params = [mcpId, tenantParam, payload.clientId, payload.clientSecret ?? null, payload.registrationClientUri ?? null, payload.registrationAccessToken ?? null, payload.redirectUri ?? null, payload.issuer ?? null, metadataString];

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

    // Check if insecure TLS is allowed
    const allowInsecureTLS = process.env.OAUTH_ALLOW_INSECURE_TLS === "true" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
    
    logger.info(`[OAUTH] Registering dynamic client for ${mcpId} at ${oauthMetadata.registration_endpoint}`);
    
    const response = await fetchWithCustomTLS(oauthMetadata.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeout: 10000,
      allowInsecureTLS,
    });

    if (response.status < 200 || response.status >= 300) {
      logger.warn(`[OAUTH] Dynamic registration failed for ${mcpId}: ${response.status} ${response.statusText}`);
      logger.info(`[OAUTH] Response body: ${response.body.substring(0, 500)}`);
      return null;
    }

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(response.body) as Record<string, unknown>;
    } catch (parseError) {
      logger.error(`[OAUTH] Failed to parse JSON response from registration endpoint: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      logger.info(`[OAUTH] Response body: ${response.body.substring(0, 500)}`);
      return null;
    }
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
