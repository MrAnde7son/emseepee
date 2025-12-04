import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  executeUpdate: vi.fn(),
  getDatabaseConfig: vi.fn(() => ({ type: "postgres" })),
}));

vi.mock("../src/db/connection.js", () => ({
  executeQuery: mocks.executeQuery,
  executeUpdate: mocks.executeUpdate,
  getDatabaseConfig: mocks.getDatabaseConfig,
}));

import {
  createOrUpdateIdpConnection,
  deleteIdpConnection,
  getIdpConnectionByTenantAndType,
  getIdpConnectionsByTenant,
} from "../src/db/services/idpConnectionService.js";

describe("idpConnectionService", () => {
  beforeEach(() => {
    mocks.executeQuery.mockReset();
    mocks.executeUpdate.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps connection rows for a tenant", async () => {
    mocks.executeQuery.mockResolvedValueOnce([
      {
        id: 2,
        tenant_id: "tenant-1",
        type: "okta",
        issuer: "https://okta.example.com",
        client_id: "abc",
        client_secret: "secret",
        metadata: "{\"region\":\"us\"}",
      },
    ]);

    const connections = await getIdpConnectionsByTenant("tenant-1");

    expect(mocks.executeQuery).toHaveBeenCalledWith(
      "SELECT * FROM idp_connections WHERE tenant_id = $1 ORDER BY id DESC",
      ["tenant-1"],
    );
    expect(connections).toEqual([
      {
        id: 2,
        tenantId: "tenant-1",
        type: "okta",
        issuer: "https://okta.example.com",
        clientId: "abc",
        clientSecret: "secret",
        metadata: { region: "us" },
      },
    ]);
  });

  it("returns null when no connection exists for tenant and type", async () => {
    mocks.executeQuery.mockResolvedValueOnce([]);

    const result = await getIdpConnectionByTenantAndType("tenant-2", "okta");

    expect(mocks.executeQuery).toHaveBeenCalledWith(
      "SELECT * FROM idp_connections WHERE tenant_id = $1 AND type = $2 LIMIT 1",
      ["tenant-2", "okta"],
    );
    expect(result).toBeNull();
  });

  it("creates or updates a connection and returns the persisted row", async () => {
    mocks.executeUpdate.mockResolvedValueOnce({ changes: 1 });
    mocks.executeQuery.mockResolvedValueOnce([
      {
        id: 3,
        tenant_id: "tenant-3",
        type: "okta",
        issuer: "https://okta.example.com",
        client_id: "cid",
        client_secret: "cs",
        metadata: { audience: "tool" },
      },
    ]);

    const connection = await createOrUpdateIdpConnection({
      tenantId: "tenant-3",
      type: "okta",
      issuer: "https://okta.example.com",
      clientId: "cid",
      clientSecret: "cs",
      metadata: { audience: "tool" },
    });

    expect(mocks.executeUpdate).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO idp_connections"),
      [
        "tenant-3",
        "okta",
        "https://okta.example.com",
        "cid",
        "cs",
        JSON.stringify({ audience: "tool" }),
      ],
    );
    expect(connection).toEqual({
      id: 3,
      tenantId: "tenant-3",
      type: "okta",
      issuer: "https://okta.example.com",
      clientId: "cid",
      clientSecret: "cs",
      metadata: { audience: "tool" },
    });
  });

  it("deletes a connection for the tenant", async () => {
    mocks.executeUpdate.mockResolvedValueOnce({ changes: 1 });

    await deleteIdpConnection(99, "tenant-4");

    expect(mocks.executeUpdate).toHaveBeenCalledWith(
      "DELETE FROM idp_connections WHERE id = $1 AND tenant_id = $2",
      [99, "tenant-4"],
    );
  });
});

