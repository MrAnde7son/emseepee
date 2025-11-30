import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ThirdPartyToolConfig, A2aExecutionConfig } from "../src/config.js";
import type { AgentContext } from "../src/tools/handlers/BaseGatewayHandler.js";
import { GenericToolHandler } from "../src/tools/handlers/GenericToolHandler.js";

vi.mock("../src/policy.js", () => ({
  evaluatePolicy: vi.fn().mockResolvedValue({
    decision: "allow",
    reason: "Access allowed",
    operations: ["allow"],
  }),
}));

vi.mock("../src/intent/index.js", () => ({
  inferAgentIntent: vi.fn().mockResolvedValue({
    inferredIntent: {
      operation: "call_tool",
      action: "execute",
      riskLevel: "low",
      confidence: 1,
      resources: [],
    },
  }),
}));

vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logEvent: vi.fn(),
  },
}));

describe("GenericToolHandler - A2A execution", () => {
  const agentContext: AgentContext = {
    agentId: "agent-123",
    agentRole: "coder_bot",
    env: "dev",
    tenantId: "tenant-abc",
  };

  const toolConfig: ThirdPartyToolConfig = {
    name: "support-agent",
    description: "Escalate to support agent",
    allowedRoles: ["coder_bot"],
    sensitivity: "high",
    category: "third_party",
    execution: {
      type: "a2a",
      endpoint: "https://support.agents.company.com", // Base URL - agent card at /.well-known/agent.json
      messageEndpoint: "/", // Messages sent to base URL root (default)
      protocol: "0.2.5", // A2A protocol version
      providerId: "support-cluster",
      auth: {
        type: "bearer",
        envVar: "SUPPORT_AGENT_TOKEN",
        headerName: "Authorization",
      },
      timeoutMs: 5000,
      metadata: {
        escalation: true,
      },
    },
    inputSchema: {
      ticketId: {
        type: "string",
        required: true,
      },
    },
    enabled: true,
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.SUPPORT_AGENT_TOKEN = "token-123";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPPORT_AGENT_TOKEN;
    vi.clearAllMocks();
  });

  it("sends caller context and headers when executing A2A tool", async () => {
    const handler = new GenericToolHandler(toolConfig);
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ ok: true, handledBy: "support" }),
    } as const;
    fetchMock.mockResolvedValue(mockResponse);

    const result = await handler.execute(agentContext, { ticketId: "TCK-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://support.agents.company.com/"); // Base URL with message endpoint
    expect(request.method).toBe("POST");

    const headers = request.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer token-123");

    const body = JSON.parse(request.body as string) as Record<string, any>;
    expect(body.caller).toEqual({
      agentId: agentContext.agentId,
      agentRole: agentContext.agentRole,
      env: agentContext.env,
      tenantId: agentContext.tenantId,
    });
    expect(body.params).toEqual({ ticketId: "TCK-1" });
    expect(body.protocol).toBe("0.2.5");
    expect(body.metadata).toEqual({ escalation: true });

    expect(result.content[0].text).toContain("\"ok\": true");
    expect(result.isError).toBeUndefined();
  });

  it("returns an error when bearer token is missing", async () => {
    delete process.env.SUPPORT_AGENT_TOKEN;
    const handler = new GenericToolHandler(toolConfig);

    const result = await handler.execute(agentContext, { ticketId: "TCK-2" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Missing bearer token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses custom messageEndpoint when provided", async () => {
    const customConfig: ThirdPartyToolConfig = {
      ...toolConfig,
      execution: {
        ...toolConfig.execution,
        type: "a2a",
        endpoint: "https://agent.example.com",
        messageEndpoint: "/message/stream", // Custom message endpoint
      } as A2aExecutionConfig,
    };

    const handler = new GenericToolHandler(customConfig);
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ response: "streaming response" }),
    } as const;
    fetchMock.mockResolvedValue(mockResponse);

    await handler.execute(agentContext, { ticketId: "TCK-3" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agent.example.com/message/stream");
  });

  it("handles base URL with trailing slash correctly", async () => {
    const trailingSlashConfig: ThirdPartyToolConfig = {
      ...toolConfig,
      execution: {
        ...toolConfig.execution,
        type: "a2a",
        endpoint: "https://agent.example.com/",
        messageEndpoint: "/",
      } as A2aExecutionConfig,
    };

    const handler = new GenericToolHandler(trailingSlashConfig);
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({ response: "success" }),
    } as const;
    fetchMock.mockResolvedValue(mockResponse);

    await handler.execute(agentContext, { ticketId: "TCK-4" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agent.example.com/"); // Should not have double slashes
  });
});
