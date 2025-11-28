import { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { logger } from "../../logger.js";
import { randomBytes, createHash } from "crypto";
import { discoverMcpOAuthMetadata } from "../../oauth/metadataDiscovery.js";
import { getOrRegisterClientForMcp } from "../../oauth/clientRegistrationService.js";

/**
 * OAuth state storage (in-memory, should be moved to database/redis in production)
 * Maps state token to { mcpId, expiresAt }
 */
const oauthStates = new Map<string, {
  mcpId: string;
  tenantId?: string;
  expiresAt: number;
  codeVerifier?: string;
  useDynamicClient?: boolean;
}>();

/**
 * OAuth tokens storage (in-memory, should be moved to database in production)
 * Maps mcpId to { accessToken, refreshToken?, expiresAt?, tokenType }
 */
const oauthTokens = new Map<string, {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
}>();

function getTenantScopedKey(tenantId: string | undefined, resourceId: string): string {
  return `${tenantId ?? "global"}:${resourceId}`;
}

export class OAuthRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path.startsWith("/api/oauth/") && method === "GET") {
      const pathAfterPrefix = path.replace("/api/oauth/", "");
      
      if (pathAfterPrefix.startsWith("authorize/")) {
        const mcpId = pathAfterPrefix.replace("authorize/", "");
        if (mcpId) {
          await this.handleAuthorize(req, res, mcpId);
          return true;
        }
      }
      
      if (pathAfterPrefix.startsWith("callback")) {
        await this.handleCallback(req, res);
        return true;
      }
      
      if (pathAfterPrefix.startsWith("status/")) {
        const mcpId = pathAfterPrefix.replace("status/", "");
        if (mcpId) {
          await this.handleStatus(req, res, mcpId);
          return true;
        }
      }
    }
    
    if (path.startsWith("/api/oauth/") && method === "POST") {
      const pathAfterPrefix = path.replace("/api/oauth/", "");
      
      if (pathAfterPrefix.startsWith("revoke/")) {
        const mcpId = pathAfterPrefix.replace("revoke/", "");
        if (mcpId) {
          await this.handleRevoke(req, res, mcpId);
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Initiate OAuth flow for an MCP server
   */
  private async handleAuthorize(req: IncomingMessage, res: ServerResponse, mcpId: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const { getMcpServerProxies } = await import("../../config.js");
      const mcpProxies = await getMcpServerProxies(auth.tenantId || undefined);
      const mcpConfig = mcpProxies[mcpId];

      if (!mcpConfig) {
        this.sendError(res, 404, `MCP server ${mcpId} not found`);
        return;
      }

      const oauthConfig = mcpConfig.oauth;
      const redirectUri = oauthConfig?.redirectUri ||
        `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}/api/oauth/callback`;

      let authorizationUrl: string | undefined;
      let tokenUrl: string | undefined;
      let clientId: string | undefined;
      let scopes: string[] | undefined;
      let codeVerifier: string | undefined;
      let useDynamicClient = false;

      if (oauthConfig?.clientId || oauthConfig?.clientSecret) {
        authorizationUrl = oauthConfig.authorizationUrl;
        tokenUrl = oauthConfig.tokenUrl;
        clientId = oauthConfig.clientId || process.env[`${mcpId.toUpperCase()}_OAUTH_CLIENT_ID`];
        scopes = oauthConfig.scopes;
      } else if (mcpConfig.serverUrl) {
        const metadata = await discoverMcpOAuthMetadata(mcpConfig.serverUrl);
        if (!metadata) {
          this.sendError(res, 400, "This MCP server does not expose OAuth metadata; please configure OAuth manually.");
          return;
        }

        const registeredClient = await getOrRegisterClientForMcp(auth.tenantId || null, mcpId, metadata, redirectUri);
        if (!registeredClient) {
          this.sendError(res, 400, "Dynamic client registration is not available. Please configure OAuth manually.");
          return;
        }

        authorizationUrl = metadata.authorization_endpoint;
        tokenUrl = metadata.token_endpoint;
        clientId = registeredClient.clientId;
        scopes = metadata.scopes_supported as string[] | undefined;
        useDynamicClient = true;
        codeVerifier = randomBytes(32).toString("base64url");
      } else {
        this.sendError(res, 400, `MCP server ${mcpId} does not support OAuth`);
        return;
      }

      if (!authorizationUrl || !tokenUrl || !clientId) {
        this.sendError(res, 400, "OAuth configuration incomplete. Please provide client credentials.");
        return;
      }

      // Generate state token for CSRF protection
      const state = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
      oauthStates.set(state, { mcpId, tenantId: auth.tenantId || undefined, expiresAt, codeVerifier, useDynamicClient });

      // Build authorization URL
      const authUrl = new URL(authorizationUrl);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);
      if (scopes && scopes.length > 0) {
        authUrl.searchParams.set("scope", scopes.join(" "));
      }

      if (codeVerifier) {
        const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
        authUrl.searchParams.set("code_challenge", challenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
      }

      // For Notion specifically, add additional params
      if (oauthConfig?.provider === "notion") {
        authUrl.searchParams.set("owner", "user");
      }

      logger.info(`[OAUTH] Initiating OAuth flow for ${mcpId}, redirecting to ${authUrl.toString()}`);

      this.sendJSON(res, 200, {
        authorizationUrl: authUrl.toString(),
        state,
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "OAuth authorization error");
    }
  }

  /**
   * Handle OAuth callback
   */
  private async handleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      
      if (error) {
        const errorDescription = url.searchParams.get("error_description") || error;
        logger.error(`[OAUTH] OAuth callback error: ${error} - ${errorDescription}`);
        // Redirect to frontend with error
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:1337";
        res.writeHead(302, {
          Location: `${frontendUrl}/tools?oauth_error=${encodeURIComponent(errorDescription)}`,
        });
        res.end();
        return;
      }
      
      if (!code || !state) {
        this.sendError(res, 400, "Missing code or state parameter");
        return;
      }
      
      // Verify state
      const stateData = oauthStates.get(state);
      if (!stateData) {
        this.sendError(res, 400, "Invalid or expired state token");
        return;
      }
      
      if (stateData.expiresAt < Date.now()) {
        oauthStates.delete(state);
        this.sendError(res, 400, "State token expired");
        return;
      }
      
      const { mcpId, tenantId, codeVerifier, useDynamicClient } = stateData;
      oauthStates.delete(state); // Clean up used state

      // Get MCP config
      const { getMcpServerProxies } = await import("../../config.js");
      const mcpProxies = await getMcpServerProxies(tenantId);
      const mcpConfig = mcpProxies[mcpId];

      if (!mcpConfig) {
        this.sendError(res, 404, `MCP server ${mcpId} not found or OAuth not configured`);
        return;
      }

      const oauthConfig = mcpConfig.oauth;
      const redirectUri = oauthConfig?.redirectUri ||
        `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}/api/oauth/callback`;

      let clientId: string | undefined;
      let clientSecret: string | undefined;
      let tokenUrl: string | undefined;
      let provider: string | undefined = oauthConfig?.provider;

      if (oauthConfig?.clientId || oauthConfig?.clientSecret) {
        clientId = oauthConfig.clientId || process.env[`${mcpId.toUpperCase()}_OAUTH_CLIENT_ID`];
        clientSecret = oauthConfig.clientSecret || process.env[`${mcpId.toUpperCase()}_OAUTH_CLIENT_SECRET`];
        tokenUrl = oauthConfig.tokenUrl;
      } else if (mcpConfig.serverUrl && useDynamicClient) {
        const metadata = await discoverMcpOAuthMetadata(mcpConfig.serverUrl);
        if (!metadata) {
          this.sendError(res, 400, "OAuth metadata no longer available. Please retry or configure manually.");
          return;
        }
        const registered = await getOrRegisterClientForMcp(tenantId || null, mcpId, metadata, redirectUri);
        if (!registered) {
          this.sendError(res, 400, "Dynamic client registration unavailable. Please configure manually.");
          return;
        }
        clientId = registered.clientId;
        clientSecret = registered.clientSecret;
        tokenUrl = metadata.token_endpoint;
        provider = metadata.issuer as string | undefined;
      }

      if (!clientId || !tokenUrl) {
        this.sendError(res, 400, "OAuth client not configured");
        return;
      }

      if (!clientSecret && !useDynamicClient) {
        logger.error(`[OAUTH] OAuth client secret not configured for ${mcpId}`);
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:1337";
        res.writeHead(302, {
          Location: `${frontendUrl}/tools?oauth_error=${encodeURIComponent("OAuth client secret not configured. Please configure it in the MCP server settings in the dashboard, or set the " + mcpId.toUpperCase() + "_OAUTH_CLIENT_SECRET environment variable.")}`,
        });
        res.end();
        return;
      }

      // Build token request
      const tokenRequestHeaders: HeadersInit = {
        "Accept": "application/json",
      };

      let tokenRequestBody: string | URLSearchParams;

      if (provider === "notion" && clientSecret) {
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        tokenRequestHeaders["Authorization"] = `Basic ${basicAuth}`;
        tokenRequestHeaders["Content-Type"] = "application/x-www-form-urlencoded";

        const params = new URLSearchParams();
        params.set("grant_type", "authorization_code");
        params.set("code", code);
        params.set("redirect_uri", redirectUri);
        tokenRequestBody = params;
      } else {
        tokenRequestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        const params = new URLSearchParams();
        params.set("grant_type", "authorization_code");
        params.set("code", code);
        params.set("redirect_uri", redirectUri);
        params.set("client_id", clientId);
        if (clientSecret) {
          params.set("client_secret", clientSecret);
        }
        if (codeVerifier) {
          params.set("code_verifier", codeVerifier);
        }
        tokenRequestBody = params;
      }

      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: tokenRequestHeaders,
        body: tokenRequestBody,
      });
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error(`[OAUTH] Token exchange failed: ${tokenResponse.status} ${errorText}`);
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:1337";
        res.writeHead(302, {
          Location: `${frontendUrl}/tools?oauth_error=${encodeURIComponent("Failed to exchange authorization code")}`,
        });
        res.end();
        return;
      }
      
      const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
      };
      
      logger.info(`[OAUTH] Token exchange successful for ${mcpId}. Token type: ${tokenData.token_type || "Bearer"}, Token length: ${tokenData.access_token?.length || 0}, Token prefix: ${tokenData.access_token?.substring(0, 10) || "none"}...`);
      
      // Store tokens
      const expiresAt = tokenData.expires_in 
        ? Date.now() + tokenData.expires_in * 1000 
        : undefined;
      
      const tokenKey = getTenantScopedKey(tenantId, mcpId);
      oauthTokens.set(tokenKey, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
        tokenType: tokenData.token_type || "Bearer",
      });
      
      // Update MCP config headers with the token
      const { getMcpServerProxiesFromDb, saveMcpServerProxiesToDb } = await import("../../db/services/configService.js");
      const mcpProxiesDb = await getMcpServerProxiesFromDb(tenantId);
      if (mcpProxiesDb[mcpId]) {
        // Normalize token_type to "Bearer" (capitalized) per OAuth 2.0 spec
        // Some providers return lowercase "bearer", but the spec requires "Bearer"
        const rawTokenType = (tokenData.token_type || "Bearer").trim().toLowerCase();
        const tokenType = rawTokenType === "bearer" ? "Bearer" : rawTokenType.charAt(0).toUpperCase() + rawTokenType.slice(1);
        const authHeaderValue = `${tokenType} ${tokenData.access_token}`;
        
        logger.info(`[OAUTH] Setting Authorization header for ${mcpId}: "${tokenType} ${tokenData.access_token.substring(0, 10)}..."`);
        
        // Ensure headers object exists
        if (!mcpProxiesDb[mcpId].headers) {
          mcpProxiesDb[mcpId].headers = {};
        }
        
        mcpProxiesDb[mcpId].headers = {
          ...mcpProxiesDb[mcpId].headers,
          Authorization: authHeaderValue,
        };
        
        // Save to database and wait for it to complete
        await saveMcpServerProxiesToDb(mcpProxiesDb, tenantId);
        logger.info(`[OAUTH] Headers saved to database for ${mcpId}`);
        
        // Verify the save by reading back
        const { getMcpServerProxiesFromDb } = await import("../../db/services/configService.js");
        const verifyConfig = await getMcpServerProxiesFromDb(tenantId);
        if (verifyConfig[mcpId]?.headers?.Authorization) {
          logger.info(`[OAUTH] Verified Authorization header saved: "${verifyConfig[mcpId].headers.Authorization.substring(0, 20)}..."`);
        } else {
          logger.error(`[OAUTH] WARNING: Authorization header not found after save for ${mcpId}`);
        }
        
        // Clear config cache to ensure new headers are loaded
        const { clearConfigCache } = await import("../../config.js");
        clearConfigCache(tenantId);
        logger.info(`[OAUTH] Configuration cache cleared for ${mcpId}`);
        
        // Disconnect existing MCP client to force reconnection with new token
        try {
          const { disconnectMcpServerProxy } = await import("../../tools/index.js");
          await disconnectMcpServerProxy(mcpId);
          logger.info(`[OAUTH] Disconnected MCP client for ${mcpId} to force reconnection with new token`);
        } catch (disconnectError) {
          logger.warn(`[OAUTH] Failed to disconnect MCP client for ${mcpId}:`, disconnectError);
          // Non-fatal - connection will be re-established on next tool discovery
        }
      }
      
      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:1337";
      res.writeHead(302, {
        Location: `${frontendUrl}/tools?mcp=${mcpId}&oauth_success=true`,
      });
      res.end();
    } catch (error) {
      logger.error(`[OAUTH] Callback error:`, error);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:1337";
      res.writeHead(302, {
        Location: `${frontendUrl}/tools?oauth_error=${encodeURIComponent(error instanceof Error ? error.message : "Unknown error")}`,
      });
      res.end();
    }
  }

  /**
   * Get OAuth status for an MCP server
   */
  private async handleStatus(req: IncomingMessage, res: ServerResponse, mcpId: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const tenantId = auth.tenantId || undefined;
      const tokens = oauthTokens.get(getTenantScopedKey(tenantId, mcpId));
      const { getMcpServerProxies } = await import("../../config.js");
      const mcpProxies = await getMcpServerProxies(tenantId);
      const mcpConfig = mcpProxies[mcpId];
      
      const isConfigured = !!(mcpConfig?.oauth || mcpConfig?.serverUrl);
      const isAuthenticated = !!tokens && (!tokens.expiresAt || tokens.expiresAt > Date.now());
      
      this.sendJSON(res, 200, {
        configured: isConfigured,
        authenticated: isAuthenticated,
        expiresAt: tokens?.expiresAt,
        hasRefreshToken: !!tokens?.refreshToken,
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "OAuth status error");
    }
  }

  /**
   * Revoke OAuth tokens
   */
  private async handleRevoke(req: IncomingMessage, res: ServerResponse, mcpId: string): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const tenantId = auth.tenantId || undefined;
      oauthTokens.delete(getTenantScopedKey(tenantId, mcpId));
      
      // Remove Authorization header from MCP config
      const { getMcpServerProxiesFromDb, saveMcpServerProxiesToDb } = await import("../../db/services/configService.js");
      const mcpProxiesDb = await getMcpServerProxiesFromDb(tenantId);
      if (mcpProxiesDb[mcpId] && mcpProxiesDb[mcpId].headers) {
        delete mcpProxiesDb[mcpId].headers?.Authorization;
        await saveMcpServerProxiesToDb(mcpProxiesDb, tenantId);
      }
      
      logger.info(`[OAUTH] OAuth tokens revoked for ${mcpId}`);
      this.sendJSON(res, 200, { success: true });
    } catch (error) {
      ErrorHandler.handle(error, res, "OAuth revoke error");
    }
  }
}

