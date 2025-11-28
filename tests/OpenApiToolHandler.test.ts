import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  OpenApiToolGenerator,
  OpenApiToolHandler,
  clearOpenApiSpecCache,
} from "../src/tools/handlers/OpenApiToolHandler.js";
import type { OpenApiToolConfig } from "../src/config.js";

const sampleSpec = {
  openapi: "3.0.0",
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/clusters": {
      get: {
        operationId: "listClusters",
        description: "List clusters",
        parameters: [
          { name: "region", in: "query", required: false, schema: { type: "string" } },
        ],
      },
    },
    "/clusters/{name}": {
      delete: {
        operationId: "deleteCluster",
        description: "Delete a cluster",
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  force: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
  },
};

const openApiConfig: OpenApiToolConfig = {
  name: "eks",
  description: "AWS EKS MCP via OpenAPI",
  allowedRoles: ["coder_bot"],
  sensitivity: "medium",
  category: "third_party",
  execution: {
    type: "openapi",
    openApiUrl: "https://example.com/openapi.json",
    auth: {
      type: "oauth2",
      oauthProvider: "eks",
      headerName: "Authorization",
    },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

describe("OpenApiToolHandler", () => {
  beforeEach(() => {
    clearOpenApiSpecCache();
    fetchMock = vi.fn();
    // @ts-expect-error allow overriding fetch for tests
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearOpenApiSpecCache();
    // @ts-expect-error allow cleanup
    delete global.fetch;
    delete process.env.EKS_TOKEN;
  });

  it("generates MCP tools from an OpenAPI spec", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => sampleSpec });

    const generator = new OpenApiToolGenerator(openApiConfig);
    const tools = await generator.getGeneratedTools();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tools).toHaveLength(2);
    expect(tools.map((tool) => tool.name)).toContain("eks_listClusters");
    expect(tools.map((tool) => tool.name)).toContain("eks_deleteCluster");

    const deleteTool = tools.find((tool) => tool.name === "eks_deleteCluster");
    expect(deleteTool).toBeDefined();
    expect(() => deleteTool?.inputSchema.parse({ name: "dev", body: { force: true } })).not.toThrow();
  });

  it("routes tool execution to the OpenAPI endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => sampleSpec })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "deleted" }),
        text: async () => JSON.stringify({ status: "deleted" }),
      });

    process.env.EKS_TOKEN = "token-123";

    const generator = new OpenApiToolGenerator(openApiConfig);
    const tools = await generator.getGeneratedTools();
    const deleteTool = tools.find((tool) => tool.name === "eks_deleteCluster");
    expect(deleteTool).toBeDefined();
    const handler = new OpenApiToolHandler(deleteTool!, openApiConfig);

    const result = await handler.execute(
      { agentId: "1", agentRole: "coder_bot", env: "dev" },
      { name: "demo", body: { force: true } }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const callArgs = fetchMock.mock.calls[1];
    expect(callArgs?.[0]).toBe("https://api.example.com/clusters/demo");
    const requestInit = callArgs?.[1] as RequestInit;
    expect(requestInit?.method).toBe("DELETE");
    expect(requestInit?.headers).toMatchObject({ Authorization: "Bearer token-123" });
    expect(typeof requestInit?.body).toBe("string");

    expect(result.content[0]?.text).toContain("deleted");
  });
});
