import { logger } from "../logger.js";

export interface OAuthMetadata {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  [key: string]: unknown;
}

const metadataCache = new Map<string, OAuthMetadata | null>();

function buildDiscoveryUrls(serverUrl: string): string[] {
  try {
    const url = new URL(serverUrl);
    const base = `${url.protocol}//${url.host}`;
    return [
      `${base}/.well-known/oauth-authorization-server`,
    ];
  } catch (error) {
    logger.warn(`[OAUTH] Invalid server URL for discovery: ${serverUrl}`, error);
    return [];
  }
}

export async function discoverMcpOAuthMetadata(serverUrl: string): Promise<OAuthMetadata | null> {
  if (metadataCache.has(serverUrl)) {
    return metadataCache.get(serverUrl) ?? null;
  }

  const discoveryUrls = buildDiscoveryUrls(serverUrl);
  for (const endpoint of discoveryUrls) {
    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        logger.info(`[OAUTH] Discovery endpoint ${endpoint} returned ${response.status}`);
        continue;
      }

      const data = await response.json() as OAuthMetadata;
      if (data.authorization_endpoint && data.token_endpoint) {
        metadataCache.set(serverUrl, data);
        logger.info(`[OAUTH] Discovered OAuth metadata for ${serverUrl} via ${endpoint}`);
        return data;
      }

      logger.info(`[OAUTH] Discovery endpoint ${endpoint} missing required fields`);
    } catch (error) {
      logger.info(`[OAUTH] Failed to discover OAuth metadata from ${endpoint}:`, error);
    }
  }

  metadataCache.set(serverUrl, null);
  return null;
}
