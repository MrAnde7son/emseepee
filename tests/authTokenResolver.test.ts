import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIdpConnectionByTenantAndType: vi.fn(),
  mockProvider: {
    type: "okta" as const,
    getAccessTokenForNhi: vi.fn(async () => ""),
  },
}));

vi.mock("../src/db/services/idpConnectionService.js", () => ({
  getIdpConnectionByTenantAndType: mocks.getIdpConnectionByTenantAndType,
}));

vi.mock("../src/integrations/idp/index.js", () => ({
  getIdpProvider: () => mocks.mockProvider,
}));

import { resolveAuthHeaderForToolCall } from "../src/tools/authTokenResolver.js";
import type { NonHumanIdentity, ToolPolicyConfig } from "../src/config.js";

describe("resolveAuthHeaderForToolCall", () => {
  const tenantId = "tenant-id";
  const nhi: NonHumanIdentity = {
    id: "agent-1",
    name: "Agent One",
    providerId: "provider",
    enabled: true,
    idpType: "okta",
  };

  const tool: ToolPolicyConfig = {
    name: "sample",
    description: "Sample tool",
    allowedRoles: [],
    sensitivity: "low",
    category: "web",
    authMode: "idp",
  };

  beforeEach(() => {
    mocks.getIdpConnectionByTenantAndType.mockReset();
    mocks.mockProvider.getAccessTokenForNhi = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when tool is not IdP backed", async () => {
    const header = await resolveAuthHeaderForToolCall({ tenantId, nhi, tool: { ...tool, authMode: "api_key" } });

    expect(header).toBeUndefined();
    expect(mocks.getIdpConnectionByTenantAndType).not.toHaveBeenCalled();
  });

  it("returns undefined when no IdP type is available", async () => {
    const header = await resolveAuthHeaderForToolCall({ tenantId, nhi: { ...nhi, idpType: undefined }, tool });

    expect(header).toBeUndefined();
  });

  it("returns undefined when no connection exists", async () => {
    mocks.getIdpConnectionByTenantAndType.mockResolvedValueOnce(null);

    const header = await resolveAuthHeaderForToolCall({ tenantId, nhi, tool });

    expect(mocks.getIdpConnectionByTenantAndType).toHaveBeenCalledWith(tenantId, "okta");
    expect(header).toBeUndefined();
  });

  it("returns a bearer token header when IdP resolves", async () => {
    mocks.getIdpConnectionByTenantAndType.mockResolvedValueOnce({
      id: 1,
      tenantId,
      type: "okta",
      issuer: "https://example.okta.com",
      clientId: "cid",
      clientSecret: "secret",
      metadata: {},
    });
    mocks.mockProvider.getAccessTokenForNhi = vi.fn().mockResolvedValue("token-123");

    const header = await resolveAuthHeaderForToolCall({ tenantId, nhi, tool });

    expect(mocks.mockProvider.getAccessTokenForNhi).toHaveBeenCalled();
    expect(header).toBe("Bearer token-123");
  });
});

