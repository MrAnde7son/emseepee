import { IncomingMessage, ServerResponse } from "http";
import { BaseRouteHandler } from "./baseRouteHandler.js";
import { RequestParser } from "../middleware/requestParser.js";
import { generateToken } from "../auth.js";
import { logger } from "../../logger.js";
import { ErrorHandler } from "../middleware/errorHandler.js";
import { randomBytes } from "crypto";

/**
 * Common public email provider domains.
 * For these domains, we use the full email as tenant ID to ensure data isolation.
 * For enterprise/private domains, we use just the domain as tenant ID.
 */
const PUBLIC_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "zoho.com",
  "fastmail.com",
]);

/**
 * Derives a tenant ID from an email address.
 * - For public email providers (Gmail, Yahoo, etc.), uses the full email to ensure data isolation
 * - For enterprise/private domains, uses just the domain
 * - Falls back to a generated tenant ID if email format is invalid
 */
function deriveTenantIdFromEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) {
    logger.warn(`[Auth] Invalid email format: ${email}, generating tenant ID`);
    return `tenant-${Date.now()}`;
  }

  const domain = parts[1].toLowerCase();
  
  // If it's a public email provider, use the full email as tenant ID for isolation
  if (PUBLIC_EMAIL_PROVIDERS.has(domain)) {
    return email.toLowerCase();
  }
  
  // For enterprise/private domains, use just the domain
  return domain;
}

export class AuthRouteHandler extends BaseRouteHandler {
  async handle(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    if (path.startsWith("/api/auth/oauth/")) {
      const segments = path.split("/").filter(Boolean);
      const provider = segments[3];
      const action = segments[4];

      if (method === "GET" && action === "start" && provider) {
        await this.handleSocialLoginStart(req, res, provider);
        return true;
      }

      if (method === "GET" && action === "callback" && provider) {
        await this.handleSocialLoginCallback(req, res, provider);
        return true;
      }

      // If path matches OAuth pattern but doesn't match valid actions, return 404
      // This prevents other handlers from trying to process it
      if (provider) {
        if (action && action !== "start" && action !== "callback") {
          this.sendError(res, 404, `Invalid OAuth action: ${action}`);
        } else if (!action) {
          this.sendError(res, 404, "OAuth action not specified");
        } else {
          // Method is not GET
          this.sendError(res, 405, `Method ${method} not allowed for OAuth routes`);
        }
        return true;
      }

      // If path matches OAuth pattern but provider is missing
      this.sendError(res, 404, "OAuth provider not specified");
      return true;
    }

    if (path === "/api/auth/register" && method === "POST") {
      await this.handleRegister(req, res);
      return true;
    }

    if (path === "/api/auth/login" && method === "POST") {
      await this.handleLogin(req, res);
      return true;
    }

    if (path === "/api/auth/me" && method === "GET") {
      await this.handleMe(req, res);
      return true;
    }

    return false;
  }

  private async handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await RequestParser.parseBody(req) as { name?: string; email: string; password: string; tenantId?: string };
      
      if (!body.email || !body.password) {
        this.sendError(res, 400, "Email and password are required");
        return;
      }

      if (body.password.length < 8) {
        this.sendError(res, 400, "Password must be at least 8 characters long");
        return;
      }

      const { createUser, getUserByEmail } = await import("../../db/services/userService.js");
      
      const existingUser = await getUserByEmail(body.email);
      if (existingUser) {
        this.sendError(res, 409, "User with this email already exists");
        return;
      }

      const tenantId = body.tenantId || deriveTenantIdFromEmail(body.email);
      const user = await createUser({
        email: body.email,
        name: body.name,
        password: body.password,
        role: "user",
        tenantId,
      });

      const token = generateToken(user.id, user.email, user.role, user.tenantId);

      this.sendJSON(res, 201, {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "Registration error");
    }
  }

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await RequestParser.parseBody(req) as { email: string; password: string };
      
      if (!body.email || !body.password) {
        this.sendError(res, 400, "Email and password are required");
        return;
      }

      const { verifyPassword } = await import("../../db/services/userService.js");
      
      const user = await verifyPassword(body.email, body.password);
      if (!user) {
        this.sendError(res, 401, "Invalid email or password");
        return;
      }

      const token = generateToken(user.id, user.email, user.role, user.tenantId);

      this.sendJSON(res, 200, {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "Login error");
    }
  }

  private async handleMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const auth = this.requireAuth(req);
      if (!auth) {
        this.sendError(res, 401, "No token provided");
        return;
      }

      const { getUserById } = await import("../../db/services/userService.js");
      const user = await getUserById(auth.userId);
      
      if (!user) {
        this.sendError(res, 404, "User not found");
        return;
      }

      this.sendJSON(res, 200, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "Auth me error");
    }
  }

  private async handleSocialLoginStart(req: IncomingMessage, res: ServerResponse, provider: string): Promise<void> {
    try {
      const config = this.getSocialProviderConfig(provider);
      if (!config) {
        this.sendError(res, 404, "Unsupported OAuth provider");
        return;
      }

      if (!config.clientId || !config.clientSecret) {
        this.sendError(res, 400, `${config.displayName} client credentials are not configured`);
        return;
      }

      const state = randomBytes(16).toString("hex");
      socialStates.set(state, {
        provider,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const redirectUri = this.getSocialRedirectUri(req, provider);
      const authUrl = new URL(config.authorizationUrl);
      authUrl.searchParams.set("client_id", config.clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", config.scopes.join(" "));
      authUrl.searchParams.set("state", state);

      if (provider === "google") {
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
      }

      this.sendJSON(res, 200, {
        authorizationUrl: authUrl.toString(),
        state,
      });
    } catch (error) {
      ErrorHandler.handle(error, res, "OAuth start error");
    }
  }

  private async handleSocialLoginCallback(req: IncomingMessage, res: ServerResponse, provider: string): Promise<void> {
    try {
      const config = this.getSocialProviderConfig(provider);
      if (!config) {
        this.sendError(res, 404, "Unsupported OAuth provider");
        return;
      }

      if (!config.clientId || !config.clientSecret) {
        this.sendError(res, 400, `${config.displayName} client credentials are not configured`);
        return;
      }

      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        this.redirectWithError(res, errorParam);
        return;
      }

      if (!code || !state) {
        this.sendError(res, 400, "Missing code or state parameter");
        return;
      }

      const stateData = socialStates.get(state);
      if (!stateData || stateData.provider !== provider || stateData.expiresAt < Date.now()) {
        this.sendError(res, 400, "Invalid or expired state token");
        return;
      }
      socialStates.delete(state);

      const token = await this.exchangeCodeForToken(config, code, this.getSocialRedirectUri(req, provider));
      if (!token) {
        this.sendError(res, 400, "Failed to exchange code for token");
        return;
      }

      const profile = await this.fetchUserProfile(config, token);
      if (!profile?.email) {
        this.sendError(res, 400, "Unable to retrieve user email from provider");
        return;
      }

      const { getUserByEmail, createUser } = await import("../../db/services/userService.js");
      let user = await getUserByEmail(profile.email);
      if (!user) {
        user = await createUser({
          email: profile.email,
          name: profile.name || profile.email.split("@")[0],
          password: randomBytes(24).toString("hex"),
          role: "user",
          tenantId: deriveTenantIdFromEmail(profile.email),
        });
      }

      const jwt = generateToken(user.id, user.email, user.role, user.tenantId);
      const sanitizedUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      };

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:1337";
      const script = `localStorage.setItem('auth_token', ${JSON.stringify(jwt)});` +
        `localStorage.setItem('user', ${JSON.stringify(JSON.stringify(sanitizedUser))});` +
        `window.location.href = ${JSON.stringify(frontendUrl)};`;

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><html><body><script>${script}</script></body></html>`);
    } catch (error) {
      ErrorHandler.handle(error, res, "OAuth callback error");
    }
  }

  private getSocialProviderConfig(provider: string): SocialProviderConfig | null {
    const lower = provider.toLowerCase();
    if (lower === "google") {
      return {
        provider: "google",
        displayName: "Google",
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
        scopes: ["openid", "email", "profile"],
      };
    }

    if (lower === "github") {
      return {
        provider: "github",
        displayName: "GitHub",
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        authorizationUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
        scopes: ["user:email"],
      };
    }

    return null;
  }

  private async exchangeCodeForToken(config: SocialProviderConfig, code: string, redirectUri: string): Promise<string | null> {
    const body = new URLSearchParams({
      client_id: config.clientId || "",
      client_secret: config.clientSecret || "",
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });

    if (!response.ok) {
      logger.error(`[Auth] Failed to exchange code for token: ${response.status}`);
      return null;
    }

    const data = await response.json() as { access_token?: string };
    return data.access_token || null;
  }

  private async fetchUserProfile(config: SocialProviderConfig, accessToken: string): Promise<{ email: string; name?: string } | null> {
    const response = await fetch(config.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      logger.error(`[Auth] Failed to fetch user profile from ${config.displayName}: ${response.status}`);
      return null;
    }

    const profile = await response.json() as Record<string, unknown>;

    if (config.provider === "github" && (!profile.email || typeof profile.email !== "string")) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (emailResponse.ok) {
        const emails = await emailResponse.json() as Array<{ email: string; primary?: boolean; verified?: boolean }>;
        const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
        if (primary?.email) {
          profile.email = primary.email;
        }
      }
    }

    const email = typeof profile.email === "string" ? profile.email : undefined;
    const name = typeof profile.name === "string" ? profile.name : undefined;
    return email ? { email, name } : null;
  }

  private getSocialRedirectUri(req: IncomingMessage, provider: string): string {
    const proto = req.headers["x-forwarded-proto"] || "http";
    return `${proto}://${req.headers.host}/api/auth/oauth/${provider}/callback`;
  }

  private redirectWithError(res: ServerResponse, message: string): void {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:1337";
    res.writeHead(302, {
      Location: `${frontendUrl}/login?error=${encodeURIComponent(message)}`,
    });
    res.end();
  }
}

interface SocialProviderConfig {
  provider: "google" | "github";
  displayName: string;
  clientId?: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

const socialStates = new Map<string, { provider: string; expiresAt: number }>();

