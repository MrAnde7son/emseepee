import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAIAdapter } from "../src/agents/adapters/openai.js";
import { OpenAIEnterpriseIntegration } from "../src/integrations/openai/OpenAIEnterpriseIntegration.js";
import type { Agent } from "../src/config.js";

const createFetchResponse = (data: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("merges assistants with workspace GPT agents", async () => {
    const assistantResponse = {
      data: [
        {
          id: "asst_1",
          name: "Assistant One",
          description: "helper",
          model: "gpt-4",
          tools: [],
          metadata: {},
          created_at: 1_700_000_200,
          updated_at: 1_700_000_300,
        },
      ],
      has_more: false,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(createFetchResponse(assistantResponse) as any);

    const enterpriseAgent: Agent = {
      id: "openai_gpt:1:1",
      name: "GPT Agent",
      description: "enterprise",
      providerId: "openai",
      providerNativeId: "gpt-1",
      role: "assistant",
      env: "https://api.test/v1",
      tenantId: undefined,
      metadata: {},
      enabled: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };

    const enterpriseSpy = vi
      .spyOn(OpenAIEnterpriseIntegration.prototype, "listAgents")
      .mockResolvedValue([enterpriseAgent]);

    const adapter = new OpenAIAdapter(
      "api-key",
      "https://api.test/v1",
      "org-id",
      { apiKey: "api-key", baseUrl: "https://api.test/v1", organizationId: "org-id" }
    );

    const agents = await adapter.listAgents();

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(enterpriseSpy).toHaveBeenCalledWith({ apiKey: "api-key", baseUrl: "https://api.test/v1", organizationId: "org-id" });
    expect(agents.map((a) => a.providerNativeId)).toEqual(["asst_1", "gpt-1"]);
  });
});
