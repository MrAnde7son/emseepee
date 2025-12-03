import { URLSearchParams } from "url";
import type { IdpProvider } from "./types.js";

export class OktaProvider implements IdpProvider {
  type: IdpProvider["type"] = "okta";

  async getAccessTokenForNhi(params: Parameters<IdpProvider["getAccessTokenForNhi"]>[0]): Promise<string> {
    const { connection, tool, scopes } = params;
    const tokenUrl = `${connection.issuer.replace(/\/$/, "")}/oauth2/default/v1/token`;

    const body = new URLSearchParams();
    body.append("grant_type", "client_credentials");
    if (tool.idpAudience) {
      body.append("audience", tool.idpAudience);
    }
    const scopeList = scopes ?? tool.idpScopes;
    if (scopeList && scopeList.length > 0) {
      body.append("scope", scopeList.join(" "));
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${connection.clientId}:${connection.clientSecret ?? ""}`).toString("base64")}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Okta token: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error("Okta token response missing access_token");
    }

    return data.access_token;
  }
}
