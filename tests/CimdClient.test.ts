import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CimdClient } from "../src/services/CimdClient.js";

describe("CimdClient.fetchAndValidate", () => {
  const client = new CimdClient();
  const clientId = "https://example.com/mcp/client.json";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed metadata on success", async () => {
    const payload = {
      client_id: clientId,
      client_name: "Test Client",
      client_uri: "https://example.com",
      logo_uri: "https://example.com/logo.png",
      redirect_uris: ["https://example.com/callback"],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await client.fetchAndValidate(clientId);

    expect(result.clientId).toBe(clientId);
    expect(result.clientName).toBe("Test Client");
    expect(result.redirectUris).toEqual(["https://example.com/callback"]);
    expect(fetchMock).toHaveBeenCalledWith(clientId, expect.any(Object));
  });

  it("throws when JSON is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => Buffer.from("not-json"),
    }));

    await expect(client.fetchAndValidate(clientId)).rejects.toThrow("Invalid JSON in CIMD document");
  });

  it("throws when document exceeds size limit", async () => {
    const oversized = JSON.stringify({ client_id: clientId, padding: "a".repeat(70 * 1024) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => Buffer.from(oversized),
    }));

    await expect(client.fetchAndValidate(clientId)).rejects.toThrow("CIMD document too large");
  });

  it("throws when client_id does not match", async () => {
    const payload = { client_id: "https://other.example.com", redirect_uris: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => Buffer.from(JSON.stringify(payload)),
    }));

    await expect(client.fetchAndValidate(clientId)).rejects.toThrow("CIMD client_id mismatch");
  });
});

