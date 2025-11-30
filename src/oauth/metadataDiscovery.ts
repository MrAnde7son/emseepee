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
  if (discoveryUrls.length === 0) {
    logger.warn(`[OAUTH] No discovery URLs generated for ${serverUrl}`);
    metadataCache.set(serverUrl, null);
    return null;
  }

  // Check if insecure TLS is allowed (affects global Node.js behavior)
  const allowInsecureTLS = process.env.OAUTH_ALLOW_INSECURE_TLS === "true" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
  if (allowInsecureTLS) {
    logger.warn("[OAUTH] Insecure TLS is enabled (NODE_TLS_REJECT_UNAUTHORIZED=0 or OAUTH_ALLOW_INSECURE_TLS=true); DO NOT use in production");
  }

  for (const endpoint of discoveryUrls) {
    try {
      logger.info(`[OAUTH] Attempting to discover OAuth metadata from ${endpoint}`);
      
      // Create AbortController for timeout (more compatible than AbortSignal.timeout)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const fetchOptions: RequestInit = {
        headers: { 
          Accept: "application/json",
          "User-Agent": "hakuna-mcp-gateway/1.0",
        },
        signal: controller.signal,
      };

      let response: Response;
      try {
        response = await fetch(endpoint, fetchOptions);
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Check if it's a timeout
        if (fetchError instanceof Error && (fetchError.name === "AbortError" || fetchError.message.includes("aborted"))) {
          throw new Error(`Request timeout after 10s while fetching ${endpoint}`);
        }
        
        // Re-throw to be caught by outer catch
        throw fetchError;
      }
      
      if (!response.ok) {
        logger.info(`[OAUTH] Discovery endpoint ${endpoint} returned ${response.status} ${response.statusText}`);
        const text = await response.text().catch(() => "");
        logger.info(`[OAUTH] Response body: ${text.substring(0, 200)}`);
        continue;
      }

      const data = await response.json() as OAuthMetadata;
      if (data.authorization_endpoint && data.token_endpoint) {
        metadataCache.set(serverUrl, data);
        logger.info(`[OAUTH] Discovered OAuth metadata for ${serverUrl} via ${endpoint}`);
        logger.info(`[OAUTH] Metadata: ${JSON.stringify({ 
          issuer: data.issuer, 
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
          registration_endpoint: data.registration_endpoint 
        })}`);
        return data;
      }

      logger.info(`[OAUTH] Discovery endpoint ${endpoint} missing required fields (has authorization_endpoint: ${!!data.authorization_endpoint}, has token_endpoint: ${!!data.token_endpoint})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCause = error instanceof Error && error.cause ? ` (cause: ${error.cause})` : "";
      const errorCode = error instanceof Error && "code" in error ? ` (code: ${(error as { code?: string }).code})` : "";
      
      logger.error(`[OAUTH] Failed to discover OAuth metadata from ${endpoint}: ${errorMessage}${errorCause}${errorCode}`);
      // Continue to next URL if available
      continue;
    }
  }

  metadataCache.set(serverUrl, null);
  logger.warn(`[OAUTH] Failed to discover OAuth metadata for ${serverUrl} from any discovery endpoint`);
  return null;
}
