import { describe, expect, it, vi } from "vitest";

import { ProviderService } from "../src/api/services/providerService.js";

vi.mock("../src/db/services/providerService.js", () => ({
  getAllProviderConfigs: vi.fn(async () => [
    { providerId: "anthropic_claude_code" },
    { providerId: "github_copilot" },
  ]),
}));

vi.mock("../src/agents/registry.js", () => ({
  getAgentRegistry: () => ({
    getRegisteredProviders: () => ["cursor"],
  }),
}));

vi.mock("../src/agents/factory.js", () => ({
  AdapterFactory: {
    isAdapterAvailable: vi.fn((providerId: string) =>
      ["cursor", "openai", "microsoft_copilot"].includes(providerId)
    ),
  },
}));

describe("ProviderService", () => {
  it("exposes agentic providers for Anthropic Claude Code and GitHub Copilot", async () => {
    const service = new ProviderService();

    const providers = await service.getProviders();

    const claudeCode = providers.find((provider) => provider.id === "anthropic_claude_code");
    const githubCopilot = providers.find((provider) => provider.id === "github_copilot");

    expect(claudeCode).toBeDefined();
    expect(claudeCode?.name).toBe("Anthropic Claude Code");
    expect(claudeCode?.status).toBe("connected");
    expect(claudeCode?.comingSoon).toBe(true);

    expect(githubCopilot).toBeDefined();
    expect(githubCopilot?.name).toBe("GitHub Copilot");
    expect(githubCopilot?.status).toBe("connected");
    expect(githubCopilot?.comingSoon).toBe(true);
  });
});
