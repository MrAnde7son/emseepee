import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";

import { AuthRouteHandler } from "../src/api/routes/authRouteHandler.js";
import * as userService from "../src/db/services/userService.js";

type MockResponse = ServerResponse & { data: string; statusCode?: number; headers?: Record<string, string> };

function createMockResponse(): MockResponse {
  const res = {
    data: "",
    statusCode: undefined as number | undefined,
    headers: {} as Record<string, string>,
    writeHead(this: MockResponse, statusCode: number, headers: Record<string, string> = {}) {
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

function createRequest(path: string, method: string = "GET", headers: Record<string, string> = {}): IncomingMessage {
  return { url: path, method, headers } as IncomingMessage;
}

function mockFetchResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as Response;
}

describe("AuthRouteHandler social login", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GITHUB_CLIENT_ID = "github-client-id";
    process.env.GITHUB_CLIENT_SECRET = "github-client-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an authorization URL for Google", async () => {
    const handler = new AuthRouteHandler();
    const req = createRequest("/api/auth/oauth/google/start", "GET", { host: "localhost:8000" });
    const res = createMockResponse();

    const handled = await handler.handle(req, res, "/api/auth/oauth/google/start", "GET");

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.data) as { authorizationUrl: string; state: string };
    const url = new URL(payload.authorizationUrl);
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("registers and signs in a user on OAuth callback", async () => {
    const handler = new AuthRouteHandler();
    const startReq = createRequest("/api/auth/oauth/google/start", "GET", { host: "localhost:8000" });
    const startRes = createMockResponse();
    await handler.handle(startReq, startRes, "/api/auth/oauth/google/start", "GET");
    const { authorizationUrl } = JSON.parse(startRes.data) as { authorizationUrl: string; state: string };
    const state = new URL(authorizationUrl).searchParams.get("state");
    expect(state).toBeTruthy();

    vi.spyOn(global, "fetch").mockImplementationOnce(() => Promise.resolve(mockFetchResponse({ access_token: "access-token" })))
      .mockImplementationOnce(() => Promise.resolve(mockFetchResponse({ email: "user@example.com", name: "OAuth User" })));

    const createUser = vi.spyOn(userService, "createUser").mockResolvedValue({
      id: 10,
      email: "user@example.com",
      name: "OAuth User",
      passwordHash: "hash",
      role: "user",
      tenantId: "example.com",
      createdAt: "now",
      updatedAt: "now",
    } as any);

    vi.spyOn(userService, "getUserByEmail").mockResolvedValue(null);

    const callbackReq = createRequest(`/api/auth/oauth/google/callback?code=abc&state=${state}`, "GET", { host: "localhost:8000" });
    const callbackRes = createMockResponse();

    const handled = await handler.handle(callbackReq, callbackRes, "/api/auth/oauth/google/callback", "GET");

    expect(handled).toBe(true);
    expect(callbackRes.statusCode).toBe(200);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "user@example.com" }));
    expect(callbackRes.data).toContain("auth_token");
    expect(callbackRes.data).toContain("window.location.href");
  });
});
