import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { discoverMcpOAuthMetadata } from "../src/oauth/metadataDiscovery.js";
import { getOrRegisterClientForMcp } from "../src/oauth/clientRegistrationService.js";
import https from "https";
import http from "http";

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

// Helper to create a mock HTTP response
function createMockResponse(statusCode: number, body: string, headers: Record<string, string> = {}) {
  const callbacks: { data?: (chunk: Buffer) => void; end?: () => void } = {};
  let dataEmitted = false;
  let endEmitted = false;
  
  const emitEvents = () => {
    if (callbacks.data && !dataEmitted) {
      dataEmitted = true;
      process.nextTick(() => {
        callbacks.data!(Buffer.from(body));
        if (callbacks.end && !endEmitted) {
          endEmitted = true;
          process.nextTick(() => callbacks.end!());
        }
      });
    } else if (callbacks.end && !endEmitted && dataEmitted) {
      endEmitted = true;
      process.nextTick(() => callbacks.end!());
    }
  };
  
  const response = {
    statusCode,
    statusMessage: "OK",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    headersDistinct: Object.fromEntries(
      Object.entries({ "content-type": "application/json", ...headers }).map(([k, v]) => [k, [v]])
    ),
    on: vi.fn((event: string, callback: (data?: any) => void) => {
      if (event === "data") {
        callbacks.data = callback;
        emitEvents();
      } else if (event === "end") {
        callbacks.end = callback;
        emitEvents();
      }
      return response;
    }),
  };
  return response;
}

// Helper to create a mock request
function createMockRequest(writeCallback?: (data: string) => void) {
  const request = {
    on: vi.fn((event: string, callback: (error?: Error) => void) => {
      // Store error callback but don't call it unless we want to simulate an error
      return request;
    }),
    write: vi.fn((data: string) => {
      if (writeCallback) writeCallback(data);
      return true;
    }),
    end: vi.fn(),
    destroy: vi.fn(),
  };
  return request;
}

describe("OAuth dynamic discovery and registration", () => {
  let originalHttpsRequest: typeof https.request;
  let originalHttpRequest: typeof http.request;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalHttpsRequest = https.request;
    originalHttpRequest = http.request;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    https.request = originalHttpsRequest;
    http.request = originalHttpRequest;
  });

  it("discovers metadata and caches the result", async () => {
    const requestMock = vi.fn((options: any, callback?: (res: any) => void) => {
      const request = createMockRequest();
      // Call the callback with response in next tick to simulate async
      if (callback) {
        process.nextTick(() => {
          const response = createMockResponse(200, JSON.stringify({
            authorization_endpoint: "https://example.com/auth",
            token_endpoint: "https://example.com/token",
            scopes_supported: ["basic"],
          }));
          callback(response);
        });
      }
      return request;
    });
    https.request = requestMock as any;

    const first = await discoverMcpOAuthMetadata("https://example.com/mcp");
    const second = await discoverMcpOAuthMetadata("https://example.com/mcp");

    expect(first?.authorization_endpoint).toBe("https://example.com/auth");
    expect(second?.token_endpoint).toBe("https://example.com/token");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("registers a client when not cached", async () => {
    (mockedDb as any).__setRow(null);
    const executeUpdate = (mockedDb as any).executeUpdate as ReturnType<typeof vi.fn>;
    executeUpdate.mockClear();

    const requestMock = vi.fn((options: any, callback?: (res: any) => void) => {
      const request = createMockRequest();
      // Call the callback with response in next tick to simulate async
      if (callback) {
        process.nextTick(() => {
          const response = createMockResponse(200, JSON.stringify({
            client_id: "dyn-client",
            client_secret: "",
            registration_client_uri: "https://example.com/clients/1",
          }));
          callback(response);
        });
      }
      return request;
    });
    https.request = requestMock as any;

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
    expect(requestMock).toHaveBeenCalled();
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
    const requestMock = vi.fn();
    https.request = requestMock as any;

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
    expect(requestMock).not.toHaveBeenCalled();
  });
});
