import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";

import { AgentsRouteHandler } from "../src/api/routes/agentsRouteHandler.js";
import * as authMiddleware from "../src/api/middleware/auth.js";
import * as providerService from "../src/db/services/providerService.js";
import * as policyModule from "../src/policy.js";
import { MicrosoftCopilotIntegration } from "../src/integrations/microsoft/copilot/MicrosoftCopilotIntegration.js";
const parseBodyMock = vi.hoisted(() => vi.fn());

vi.mock("../src/api/middleware/requestParser.js", () => ({
  RequestParser: {
    parseBody: parseBodyMock,
  },
}));

const mockRegistry = {
  getAgent: vi.fn(),
};

vi.mock("../src/agents/registry.js", () => ({
  getAgentRegistry: () => mockRegistry,
}));

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

function createRequest(method: string = "POST", headers: Record<string, string> = {}): IncomingMessage {
  return { method, headers } as IncomingMessage;
}

describe("AgentsRouteHandler invoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry.getAgent.mockReset();
    parseBodyMock.mockReset();
  });

  it("blocks invocation when policy denies", async () => {
    vi.spyOn(authMiddleware.AuthMiddleware, "requireAuth").mockReturnValue({ userId: 1 });
    mockRegistry.getAgent.mockResolvedValue({ id: "microsoft_copilot:bot1", providerId: "microsoft_copilot", role: "assistant", env: "prod" });
    vi.spyOn(providerService, "getProviderConfig").mockResolvedValue({ config: {} } as any);
    vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({ decision: "deny", reason: "blocked" } as any);
    vi.spyOn(MicrosoftCopilotIntegration.prototype, "invokeCopilotAgent").mockResolvedValue({ conversationId: "c1" });
    parseBodyMock.mockResolvedValue({ message: "hello", userId: "u1" });

    const handler = new AgentsRouteHandler();
    const res = createMockResponse();
    const req = createRequest("POST", { authorization: "Bearer token" });

    const handled = await handler.handle(req, res, "/api/agents/microsoft_copilot:bot1/invoke", "POST");

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(res.data).toContain("blocked");
    expect(MicrosoftCopilotIntegration.prototype.invokeCopilotAgent).not.toHaveBeenCalled();
  });

  it("invokes Copilot when allowed", async () => {
    vi.spyOn(authMiddleware.AuthMiddleware, "requireAuth").mockReturnValue({ userId: 1 });
    mockRegistry.getAgent.mockResolvedValue({ id: "microsoft_copilot:bot1", name: "Bot", providerId: "microsoft_copilot", role: "assistant", env: "prod" });
    vi.spyOn(providerService, "getProviderConfig").mockResolvedValue({ config: { tenantId: "t", clientId: "c", clientSecret: "s", dataverseHost: "h" } } as any);
    vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({ decision: "allow", reason: "ok" } as any);
    vi.spyOn(MicrosoftCopilotIntegration.prototype, "invokeCopilotAgent").mockResolvedValue({ conversationId: "c123" });
    parseBodyMock.mockResolvedValue({ message: "hello", userId: "u1" });

    const handler = new AgentsRouteHandler();
    const res = createMockResponse();
    const req = createRequest("POST", { authorization: "Bearer token" });

    const handled = await handler.handle(req, res, "/api/agents/microsoft_copilot:bot1/invoke", "POST");

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.data) as { conversationId: string };
    expect(payload.conversationId).toBe("c123");
    expect(MicrosoftCopilotIntegration.prototype.invokeCopilotAgent).toHaveBeenCalled();
  });
});
