import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { discoverMcpOAuthMetadata } from "../src/oauth/metadataDiscovery.js";
import { getOrRegisterClientForMcp } from "../src/oauth/clientRegistrationService.js";

vi.mock("../src/db/connection.js", () => {
  let storedRow: any = null;
  return {
    executeQueryOne: vi.fn(async () => storedRow),
    executeUpdate: vi.fn(async (_query: string, _params?: unknown[]) => {
      // noop
    }),
    getDatabaseConfig: () => ({ type: "sqlite" as const }),
    isDatabaseInitialized: () => true,
    __setRow: (row: any) => { storedRow = row; },
  };
});

const mockedDb = await import("../src/db/connection.js");

describe("OAuth dynamic discovery and registration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("discovers metadata and caches the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://example.com/auth",
        token_endpoint: "https://example.com/token",
        scopes_supported: ["basic"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await discoverMcpOAuthMetadata("https://example.com/mcp");
    const second = await discoverMcpOAuthMetadata("https://example.com/mcp");

    expect(first?.authorization_endpoint).toBe("https://example.com/auth");
    expect(second?.token_endpoint).toBe("https://example.com/token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("registers a client when not cached", async () => {
    (mockedDb as any).__setRow(null);
    const executeUpdate = (mockedDb as any).executeUpdate as ReturnType<typeof vi.fn>;
    executeUpdate.mockClear();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        client_id: "dyn-client",
        client_secret: "",
        registration_client_uri: "https://example.com/clients/1",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = await getOrRegisterClientForMcp(
      null,
      "example",
      {
        authorization_endpoint: "https://example.com/auth",
        token_endpoint: "https://example.com/token",
        registration_endpoint: "https://example.com/register",
      },
      "http://localhost/api/oauth/callback"
    );

    expect(client?.clientId).toBe("dyn-client");
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/register", expect.any(Object));
    expect(executeUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns existing registration without re-registering", async () => {
    (mockedDb as any).__setRow({
      client_id: "existing-client",
      client_secret: "shh",
      registration_client_uri: "https://example.com/clients/2",
      registration_access_token: null,
      metadata: "{}",
      redirect_uri: "http://localhost/api/oauth/callback",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = await getOrRegisterClientForMcp(
      null,
      "example",
      {
        authorization_endpoint: "https://example.com/auth",
        token_endpoint: "https://example.com/token",
      },
      "http://localhost/api/oauth/callback"
    );

    expect(client?.clientId).toBe("existing-client");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
