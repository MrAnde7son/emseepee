import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";

type MockResponse = ServerResponse & { data: string; statusCode?: number; headers?: Record<string, string> };

function createMockResponse(): MockResponse {
  const res = {
    data: "",
    statusCode: undefined as number | undefined,
    headers: {} as Record<string, string>,
    setHeader(this: MockResponse, key: string, value: string) {
      this.headers[key] = value;
    },
    writeHead(this: MockResponse, statusCode: number, headers: Record<string, string>) {
      this.statusCode = statusCode;
      this.headers = headers;
      return this;
    },
    end(this: MockResponse, chunk?: string) {
      if (chunk) {
        this.data += chunk;
      }
      return this;
    },
  } as Partial<MockResponse>;

  return res as MockResponse;
}

describe("CIMD route", () => {
  let router: import("../src/api/router.js").Router;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    process.env.PUBLIC_HOST = "example.com";
    process.env.PUBLIC_APP_URL = "https://example.com";
    process.env.OAUTH_REDIRECT_URI = "https://example.com/api/oauth/callback";
    process.env.CIMD_CLIENT_ID = "https://example.com/mcp/clients/gateway.json";
    const module = await import("../src/api/router.js");
    router = new module.Router();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns CIMD document", async () => {
    const req = { method: "GET", headers: { host: "example.com" }, url: "/mcp/clients/gateway.json" } as IncomingMessage;
    const res = createMockResponse();

    await router.handleRequest(req, res);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.data) as Record<string, unknown>;
    expect(payload.client_id).toBe("https://example.com/mcp/clients/gateway.json");
    expect(payload.redirect_uris).toEqual(["https://example.com/api/oauth/callback"]);
  });
});

