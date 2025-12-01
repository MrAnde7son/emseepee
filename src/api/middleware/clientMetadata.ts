import type { IncomingMessage } from "http";
import { URL } from "url";
import { CimdClient } from "../../services/CimdClient.js";
import { logger } from "../../logger.js";

export interface RequestClientMetadata {
  id: string;
  name?: string;
  uri?: string;
  logoUri?: string;
  domain?: string;
}

const cimdClient = new CimdClient();

function isHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function attachClientMetadata(
  req: IncomingMessage,
  url: URL
): Promise<RequestClientMetadata | undefined> {
  const clientId = url.searchParams.get("client_id") || (req.headers["x-client-id"] as string | undefined);

  if (!clientId || !isHttpUrl(clientId)) {
    return undefined;
  }

  try {
    const meta = await cimdClient.getClientMetadata(clientId);
    const domain = meta.clientUri ? new URL(meta.clientUri).hostname : new URL(meta.clientId).hostname;
    const clientMetadata: RequestClientMetadata = {
      id: meta.clientId,
      name: meta.clientName,
      uri: meta.clientUri,
      logoUri: meta.logoUri,
      domain,
    };
    (req as IncomingMessage & { clientMetadata?: RequestClientMetadata }).clientMetadata = clientMetadata;
    return clientMetadata;
  } catch (error) {
    logger.warn(`[CIMD] Failed to attach client metadata for ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

