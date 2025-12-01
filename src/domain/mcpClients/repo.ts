import { executeQueryOne, executeUpdate, getDatabaseConfig } from "../../db/connection.js";
import type { MpcClientMetadata } from "./types.js";

function mapRowToMetadata(row: {
  client_id_url: string;
  client_name: string | null;
  client_uri: string | null;
  logo_uri: string | null;
  redirect_uris: unknown;
  raw_json: unknown;
  first_seen_at: string | Date | null;
  last_seen_at: string | Date | null;
  last_fetched_at: string | Date | null;
}): MpcClientMetadata {
  let redirectUris: unknown[] = [];
  if (Array.isArray(row.redirect_uris)) {
    redirectUris = row.redirect_uris;
  } else if (typeof row.redirect_uris === "string") {
    try {
      redirectUris = JSON.parse(row.redirect_uris);
    } catch {
      redirectUris = [];
    }
  }

  let rawJson: unknown = row.raw_json;
  if (typeof row.raw_json === "string") {
    try {
      rawJson = JSON.parse(row.raw_json);
    } catch {
      rawJson = {};
    }
  }

  return {
    clientId: row.client_id_url,
    clientName: row.client_name ?? row.client_id_url,
    clientUri: row.client_uri ?? undefined,
    logoUri: row.logo_uri ?? undefined,
    redirectUris: redirectUris as string[],
    rawJson,
    firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at) : new Date(),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : new Date(),
    lastFetchedAt: row.last_fetched_at ? new Date(row.last_fetched_at) : new Date(),
  };
}

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

export const mcpClientRepo = {
  async findById(clientIdUrl: string): Promise<MpcClientMetadata | null> {
    const config = getDatabaseConfig();
    const query = config.type === "postgres"
      ? `SELECT client_id_url, client_name, client_uri, logo_uri, redirect_uris, raw_json, first_seen_at, last_seen_at, last_fetched_at
         FROM mcp_clients WHERE client_id_url = $1`
      : `SELECT client_id_url, client_name, client_uri, logo_uri, redirect_uris, raw_json, first_seen_at, last_seen_at, last_fetched_at
         FROM mcp_clients WHERE client_id_url = ?`;

    const row = await executeQueryOne<{
      client_id_url: string;
      client_name: string | null;
      client_uri: string | null;
      logo_uri: string | null;
      redirect_uris: unknown;
      raw_json: unknown;
      first_seen_at: string | Date | null;
      last_seen_at: string | Date | null;
      last_fetched_at: string | Date | null;
    }>(query, [clientIdUrl]);

    if (!row) {
      return null;
    }

    return mapRowToMetadata(row);
  },

  async upsert(meta: MpcClientMetadata): Promise<MpcClientMetadata> {
    const config = getDatabaseConfig();
    const params = [
      meta.clientId,
      meta.clientName,
      meta.clientUri ?? null,
      meta.logoUri ?? null,
      JSON.stringify(meta.redirectUris ?? []),
      serializeJson(meta.rawJson),
      meta.firstSeenAt.toISOString(),
      meta.lastSeenAt.toISOString(),
      meta.lastFetchedAt.toISOString(),
    ];

    if (config.type === "postgres") {
      await executeUpdate(
        `INSERT INTO mcp_clients (client_id_url, client_name, client_uri, logo_uri, redirect_uris, raw_json, first_seen_at, last_seen_at, last_fetched_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
         ON CONFLICT (client_id_url) DO UPDATE SET
           client_name = EXCLUDED.client_name,
           client_uri = EXCLUDED.client_uri,
           logo_uri = EXCLUDED.logo_uri,
           redirect_uris = EXCLUDED.redirect_uris,
           raw_json = EXCLUDED.raw_json,
           last_seen_at = EXCLUDED.last_seen_at,
           last_fetched_at = EXCLUDED.last_fetched_at`,
        params
      );
    } else {
      await executeUpdate(
        `INSERT INTO mcp_clients (client_id_url, client_name, client_uri, logo_uri, redirect_uris, raw_json, first_seen_at, last_seen_at, last_fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(client_id_url) DO UPDATE SET
           client_name = excluded.client_name,
           client_uri = excluded.client_uri,
           logo_uri = excluded.logo_uri,
           redirect_uris = excluded.redirect_uris,
           raw_json = excluded.raw_json,
           last_seen_at = excluded.last_seen_at,
           last_fetched_at = excluded.last_fetched_at`,
        params
      );
    }

    return meta;
  },

  async touchLastSeen(clientIdUrl: string): Promise<void> {
    const config = getDatabaseConfig();
    const nowIso = new Date().toISOString();
    const query = config.type === "postgres"
      ? `UPDATE mcp_clients SET last_seen_at = $1 WHERE client_id_url = $2`
      : `UPDATE mcp_clients SET last_seen_at = ? WHERE client_id_url = ?`;
    const params = config.type === "postgres" ? [nowIso, clientIdUrl] : [nowIso, clientIdUrl];
    await executeUpdate(query, params);
  },
};

