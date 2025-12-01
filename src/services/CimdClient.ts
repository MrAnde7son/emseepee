import { URL } from "url";
import { mcpClientRepo } from "../domain/mcpClients/repo.js";
import type { MpcClientMetadata } from "../domain/mcpClients/types.js";

export class CimdClient {
  private static MAX_DOC_BYTES = 64 * 1024;

  async getClientMetadata(clientIdUrl: string): Promise<MpcClientMetadata> {
    const existing = await mcpClientRepo.findById(clientIdUrl);
    if (existing && this.isFresh(existing)) {
      await mcpClientRepo.touchLastSeen(clientIdUrl);
      return existing;
    }

    const fetched = await this.fetchAndValidate(clientIdUrl);
    await mcpClientRepo.upsert(fetched);
    return fetched;
  }

  private isFresh(meta: MpcClientMetadata): boolean {
    const TTL_MS = 60 * 60 * 1000; // 1 hour
    return Date.now() - meta.lastFetchedAt.getTime() < TTL_MS;
  }

  async fetchAndValidate(clientIdUrl: string): Promise<MpcClientMetadata> {
    const url = new URL(clientIdUrl);
    if (!url.protocol.startsWith("http")) {
      throw new Error("CIMD client_id must be an http/https URL");
    }

    const res = await fetch(clientIdUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch CIMD document: ${res.status} ${res.statusText}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > CimdClient.MAX_DOC_BYTES) {
      throw new Error("CIMD document too large");
    }

    let json: any;
    try {
      json = JSON.parse(buf.toString("utf8"));
    } catch {
      throw new Error("Invalid JSON in CIMD document");
    }

    if (!json.client_id || json.client_id !== clientIdUrl) {
      throw new Error("CIMD client_id mismatch");
    }

    const now = new Date();
    const redirectUris = Array.isArray(json.redirect_uris) ? json.redirect_uris : [];

    return {
      clientId: json.client_id,
      clientName: json.client_name ?? json.client_id,
      clientUri: json.client_uri,
      logoUri: json.logo_uri,
      redirectUris,
      rawJson: json,
      firstSeenAt: now,
      lastSeenAt: now,
      lastFetchedAt: now,
    };
  }
}

