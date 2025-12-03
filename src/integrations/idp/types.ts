import type { NonHumanIdentity } from "../../config.js";
import type { ToolPolicyConfig as ToolConfig } from "../../config.js";

export type IdpType = "okta" | "entra" | "auth0";

export interface IdpConnection {
  id: number;
  tenantId: string;
  type: IdpType;
  issuer: string;
  clientId: string;
  clientSecret?: string;
  metadata: Record<string, unknown>;
}

export interface IdpProvider {
  type: IdpType;
  getAccessTokenForNhi(params: {
    connection: IdpConnection;
    nhi: NonHumanIdentity;
    tool: ToolConfig;
    scopes?: string[];
  }): Promise<string>;
  syncNhiClaims?(params: { connection: IdpConnection; nhi: NonHumanIdentity }): Promise<void>;
}
