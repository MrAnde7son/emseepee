import { describe, expect, it } from "vitest";

import {
  getProviderConfigSchema,
  providerRequiresConfig,
} from "../dashboard/src/lib/providerConfigs";

describe("provider configuration schemas", () => {
  it("includes Anthropic Claude Code configuration", () => {
    const schema = getProviderConfigSchema("anthropic_claude_code");

    expect(schema).toBeTruthy();
    expect(schema?.requiresConfig).toBe(true);
    expect(schema?.fields.map((field) => field.key)).toContain("apiKey");
    expect(providerRequiresConfig("anthropic_claude_code")).toBe(true);
  });

  it("includes GitHub Copilot configuration", () => {
    const schema = getProviderConfigSchema("github_copilot");

    expect(schema).toBeTruthy();
    expect(schema?.fields.map((field) => field.key)).toContain("apiKey");
    expect(schema?.fields.map((field) => field.key)).toContain("baseUrl");
    expect(providerRequiresConfig("github_copilot")).toBe(true);
  });
});
