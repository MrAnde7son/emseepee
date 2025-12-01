import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAIEnterpriseIntegration, type OpenAIEnterpriseIntegrationConfig } from "../src/integrations/openai/OpenAIEnterpriseIntegration.js";
import { logger } from "../src/logger.js";

const createFetchResponse = (data: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

describe("OpenAIEnterpriseIntegration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps workspace GPTs into Hakuna agents", async () => {
    const integration = new OpenAIEnterpriseIntegration();
    const config: OpenAIEnterpriseIntegrationConfig = { apiKey: "test-key", baseUrl: "https://api.test/v1" };
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValue(
      createFetchResponse({
        data: [
          {
            id: "gpt_123",
            created_at: 1_700_000_000,
            owner_id: "owner-1",
            owner_email: "owner@example.com",
            builder_name: "Owner Name",
            sharing: { visibility: "workspace-with-link", recipients: { data: [{ email: "friend@example.com" }] } },
            latest_config: {
              data: [
                {
                  id: "gpt_ver_1",
                  name: "Workspace GPT",
                  description: "helper",
                  conversation_starters: ["hi"],
                  categories: ["helpers"],
                  tools: { data: [{ type: "function", name: "do_thing", description: "does" }] },
                  files: { data: [] },
                  created_at: 1_700_000_100,
                },
              ],
            },
          },
        ],
        has_more: false,
      }) as any
    );

    const agents = await integration.listAgents(config);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/gpts"), expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: expect.stringContaining("test-key") }),
    }));
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      providerId: "openai",
      providerNativeId: "gpt_123",
      metadata: expect.objectContaining({
        type: "workspace_gpt",
        visibility: "org",
        sharedWith: ["friend@example.com"],
      }),
    });
  });

  it("returns an empty list when the GPT API fails", async () => {
    const integration = new OpenAIEnterpriseIntegration();
    const config: OpenAIEnterpriseIntegrationConfig = { apiKey: "test-key" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createFetchResponse({ error: "boom" }, false, 500) as any);
    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    const agents = await integration.listAgents(config);

    expect(agents).toEqual([]);
    expect(loggerSpy).toHaveBeenCalled();
  });
});
