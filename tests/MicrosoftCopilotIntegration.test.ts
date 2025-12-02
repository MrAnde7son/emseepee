import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MicrosoftCopilotIntegration } from "../src/integrations/microsoft/copilot/MicrosoftCopilotIntegration.js";

const config = {
  tenantId: "tenant",
  clientId: "client",
  clientSecret: "secret",
  dataverseHost: "example.crm.dynamics.com",
};

describe("MicrosoftCopilotIntegration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps bots and components into agents", async () => {
    const fetchMock = vi.fn()
      // Token response
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }))
      // Bots list
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ botid: "bot1", name: "Bot One", createdon: "2024-01-01", modifiedon: "2024-01-02" }] }), { status: 200 }))
      // Components
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [
        { componenttype: 15, content: "desc" },
        { componenttype: 9, content: "capability" },
        { componenttype: 17, content: "trigger" },
      ] }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const integration = new MicrosoftCopilotIntegration();
    const agents = await integration.listAgents(config);

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      id: "microsoft_copilot:bot1",
      name: "Bot One",
      description: "desc",
      providerId: "microsoft_copilot",
    });

    expect((agents[0].metadata as any).capabilities).toHaveLength(1);
    expect((agents[0].metadata as any).triggers).toHaveLength(1);
  });

  it("maps graph users into user assets", async () => {
    const fetchMock = vi.fn()
      // Token
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }))
      // Users
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [
        { id: "u1", displayName: "User One", mail: "user1@example.com", accountEnabled: true },
        { id: "u2", userPrincipalName: "user2@example.com", accountEnabled: false },
      ] }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const integration = new MicrosoftCopilotIntegration();
    const users = await integration.listUsers(config);

    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ id: "u1", email: "user1@example.com", source: "microsoft-365", active: true });
    expect(users[1]).toMatchObject({ id: "u2", email: "user2@example.com", active: false });
  });
});
