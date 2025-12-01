import { logger } from "../logger.js";
import https from "https";
import http from "http";
import { Agent as HttpsAgent } from "https";

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

// Lazy singleton for an insecure HTTPS agent (used only when explicitly allowed)
let insecureAgent: HttpsAgent | null = null;
function getInsecureAgent(): HttpsAgent {
  if (!insecureAgent) {
    insecureAgent = new HttpsAgent({ rejectUnauthorized: false });
  }
  return insecureAgent;
}

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

/**
 * Fetch using Node's https/http modules with support for insecure TLS
 */
async function fetchWithCustomTLS(url: string, options: { timeout?: number; allowInsecureTLS?: boolean } = {}): Promise<{ status: number; statusText: string; body: string; headers: Record<string, string> }> {
  if (typeof fetch === "function" && options.allowInsecureTLS !== true) {
    const timeout = options.timeout || 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "hakuna-mcp-gateway/1.0",
        },
        signal: controller.signal,
      });

      const headers: Record<string, string> = {};
      if (response.headers && typeof (response.headers as any).forEach === "function") {
        (response.headers as any).forEach((value: string, key: string) => {
          headers[key] = value;
        });
      }

      let body = "";
      if (typeof (response as any).text === "function") {
        body = await (response as any).text();
      } else if (typeof (response as any).json === "function") {
        body = JSON.stringify(await (response as any).json());
      }

      return {
        status: (response as Response).status ?? 200,
        statusText: (response as Response).statusText ?? "",
        body,
        headers,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;
    
    const requestOptions: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "hakuna-mcp-gateway/1.0",
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

    req.end();
  });
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

  // Check if insecure TLS is allowed
  const allowInsecureTLS = process.env.OAUTH_ALLOW_INSECURE_TLS === "true" || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
  if (allowInsecureTLS) {
    logger.warn("[OAUTH] Insecure TLS is enabled (NODE_TLS_REJECT_UNAUTHORIZED=0 or OAUTH_ALLOW_INSECURE_TLS=true); DO NOT use in production");
  }

  for (const endpoint of discoveryUrls) {
    try {
      logger.info(`[OAUTH] Attempting to discover OAuth metadata from ${endpoint}`);
      
      const response = await fetchWithCustomTLS(endpoint, {
        timeout: 10000,
        allowInsecureTLS,
      });
      
      if (response.status < 200 || response.status >= 300) {
        logger.info(`[OAUTH] Discovery endpoint ${endpoint} returned ${response.status} ${response.statusText}`);
        logger.info(`[OAUTH] Response body: ${response.body.substring(0, 200)}`);
        continue;
      }

      let data: OAuthMetadata;
      try {
        data = JSON.parse(response.body) as OAuthMetadata;
      } catch (parseError) {
        logger.error(`[OAUTH] Failed to parse JSON response from ${endpoint}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        logger.info(`[OAUTH] Response body: ${response.body.substring(0, 500)}`);
        continue;
      }

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

export function clearOAuthMetadataCache(): void {
  metadataCache.clear();
}
