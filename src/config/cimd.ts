import { URL } from "url";

function resolvePublicHost(): string {
  const fromEnv = process.env.PUBLIC_HOST?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }

  const appUrl = process.env.PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      return parsed.host;
    } catch {
      // Fallback handled below
    }
  }

  const gatewayHost = process.env.GATEWAY_PUBLIC_HOST?.trim();
  if (gatewayHost) {
    return gatewayHost.replace(/\/+$/, "");
  }

  return "localhost:8000";
}

export const CIMD_CLIENT_ID =
  process.env.CIMD_CLIENT_ID ?? `https://${resolvePublicHost()}/mcp/clients/gateway.json`;

function resolveRedirectUri(): string {
  const fallbackBase = process.env.PUBLIC_APP_URL?.trim() ?? `https://${resolvePublicHost()}`;
  return (
    process.env.OAUTH_REDIRECT_URI?.trim() ?? `${fallbackBase.replace(/\/+$/, "")}/api/oauth/callback`
  );
}

export function buildCimdDocument() {
  return {
    client_id: CIMD_CLIENT_ID,
    client_name: "Hakuna Gateway",
    client_uri: process.env.PUBLIC_APP_URL ?? "https://hakuna.example.com",
    logo_uri: process.env.PUBLIC_LOGO_URL ?? undefined,
    redirect_uris: [resolveRedirectUri()],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

