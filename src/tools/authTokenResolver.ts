import type { NonHumanIdentity } from "../config.js";
import type { ToolPolicyConfig as ToolConfig } from "../config.js";
import { getIdpProvider } from "../integrations/idp/index.js";
import { getIdpConnectionByTenantAndType } from "../db/services/idpConnectionService.js";

export async function resolveAuthHeaderForToolCall(params: {
  tenantId: string;
  nhi: NonHumanIdentity;
  tool: ToolConfig;
}): Promise<string | undefined> {
  const { tenantId, nhi, tool } = params;
  if (tool.authMode === "idp") {
    const idpType = tool.idpTypeOverride ?? nhi.idpType;
    if (!idpType) {
      return undefined;
    }

    const connection = await getIdpConnectionByTenantAndType(tenantId, idpType);
    if (!connection) {
      return undefined;
    }

    const idpProvider = getIdpProvider(connection.type);
    const token = await idpProvider.getAccessTokenForNhi({
      connection,
      nhi,
      tool,
      scopes: tool.idpScopes,
    });
    return `Bearer ${token}`;
  }

  return undefined;
}
