import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";

import { UsersRouteHandler } from "../src/api/routes/usersRouteHandler.js";
import * as userService from "../src/db/services/userService.js";
import * as authMiddleware from "../src/api/middleware/auth.js";
import * as providerService from "../src/db/services/providerService.js";
import { MicrosoftCopilotIntegration } from "../src/integrations/microsoft/copilot/MicrosoftCopilotIntegration.js";
import { OpenAIEnterpriseIntegration } from "../src/integrations/openai/OpenAIEnterpriseIntegration.js";

type MockResponse = ServerResponse & { data: string; statusCode?: number; headers?: Record<string, string> };

function createMockResponse(): MockResponse {
  const res = {
    data: "",
    statusCode: undefined as number | undefined,
    headers: {} as Record<string, string>,
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

function createRequest(method: string = "GET", headers: Record<string, string> = {}): IncomingMessage {
  return { method, headers } as IncomingMessage;
}

describe("UsersRouteHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns sanitized users when authorized", async () => {
    vi.spyOn(authMiddleware.AuthMiddleware, "requireAuth").mockReturnValue({
      userId: 1,
      email: "admin@example.com",
      role: "admin",
    });

    vi.spyOn(userService, "listUsers").mockResolvedValue([
      {
        id: 1,
        email: "user1@example.com",
        name: "User One",
        passwordHash: "secret",
        role: "member",
        tenantId: "tenant-a",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
      {
        id: 2,
        email: "user2@example.com",
        name: null,
        passwordHash: "secret",
        role: "member",
        tenantId: null,
        createdAt: "2024-02-01T00:00:00Z",
        updatedAt: "2024-02-02T00:00:00Z",
      },
    ] as any);

    vi.spyOn(providerService, "getProviderConfig").mockResolvedValue(null as any);
    vi.spyOn(MicrosoftCopilotIntegration.prototype, "listUsers").mockResolvedValue([]);

    const handler = new UsersRouteHandler();
    const req = createRequest("GET", { authorization: "Bearer token" });
    const res = createMockResponse();

    const handled = await handler.handle(req, res, "/api/users", "GET");

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);

    const payload = JSON.parse(res.data) as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ id: 1, email: "user1@example.com", name: "User One", role: "member", source: "local" });
    expect(payload[0]).not.toHaveProperty("passwordHash");
  });

  it("includes Microsoft 365 users when provider is configured", async () => {
    vi.spyOn(authMiddleware.AuthMiddleware, "requireAuth").mockReturnValue({
      userId: 1,
      email: "admin@example.com",
      role: "admin",
      tenantId: "tenant-a",
    });

    vi.spyOn(userService, "listUsers").mockResolvedValue([] as any);
    vi.spyOn(providerService, "getProviderConfig").mockResolvedValue({
      providerId: "microsoft_copilot",
      config: { tenantId: "t1", clientId: "c1", clientSecret: "s", dataverseHost: "example.crm.dynamics.com" },
      enabled: true,
      createdAt: "now",
      updatedAt: "now",
    } as any);

    vi.spyOn(MicrosoftCopilotIntegration.prototype, "listUsers").mockResolvedValue([
      { id: "u1", email: "cloud@example.com", displayName: "Cloud User", active: true, source: "microsoft-365" },
    ]);

    const handler = new UsersRouteHandler();
    const req = createRequest("GET", { authorization: "Bearer token" });
    const res = createMockResponse();

    const handled = await handler.handle(req, res, "/api/users", "GET");

    expect(handled).toBe(true);
    const payload = JSON.parse(res.data) as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ id: "u1", email: "cloud@example.com", name: "Cloud User", source: "microsoft-365" });
  });

  it("includes ChatGPT Enterprise users when provider is configured", async () => {
    vi.spyOn(authMiddleware.AuthMiddleware, "requireAuth").mockReturnValue({
      userId: 1,
      email: "admin@example.com",
      role: "admin",
      tenantId: "tenant-a",
    });

    vi.spyOn(userService, "listUsers").mockResolvedValue([] as any);
    vi.spyOn(providerService, "getProviderConfig").mockImplementation(async (providerId: string) => {
      if (providerId === "openai") {
        return {
          providerId: "openai",
          config: { apiKey: "key", baseUrl: "https://api.test/v1", organizationId: "org" },
          enabled: true,
          createdAt: "now",
          updatedAt: "now",
        } as any;
      }
      return null as any;
    });

    vi.spyOn(MicrosoftCopilotIntegration.prototype, "listUsers").mockResolvedValue([]);
    vi.spyOn(OpenAIEnterpriseIntegration.prototype, "listUsers").mockResolvedValue([
      { id: "chat1", email: "chat@example.com", name: "Chat User", active: true, source: "chatgpt" },
    ]);

    const handler = new UsersRouteHandler();
    const req = createRequest("GET", { authorization: "Bearer token" });
    const res = createMockResponse();

    const handled = await handler.handle(req, res, "/api/users", "GET");

    expect(handled).toBe(true);
    const payload = JSON.parse(res.data) as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ id: "chat1", email: "chat@example.com", name: "Chat User", source: "chatgpt" });
  });

  it("returns an error when no auth token is provided", async () => {
    vi.spyOn(authMiddleware.AuthMiddleware, "requireAuth").mockReturnValue(null);

    const handler = new UsersRouteHandler();
    const req = createRequest("GET");
    const res = createMockResponse();

    const handled = await handler.handle(req, res, "/api/users", "GET");

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(401);
    const payload = JSON.parse(res.data) as { error: string };
    expect(payload.error).toContain("No token provided");
  });
});
