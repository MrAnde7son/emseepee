import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  saveMcpServerProxiesToDb: vi.fn(),
  saveToolsProxiesToDb: vi.fn(),
  savePolicyRulesToDb: vi.fn(),
  getAllConfigFromDb: vi.fn(),
  getDistinctTenantIds: vi.fn(),
  loadConfigFromFile: vi.fn(),
}));

vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../src/db/connection.js", () => ({
  initializeDatabase: vi.fn().mockResolvedValue(undefined),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/db/schema.js", () => ({
  createSchema: vi.fn().mockResolvedValue(undefined),
  schemaExists: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/db/services/configService.js", () => ({
  saveMcpServerProxiesToDb: mocks.saveMcpServerProxiesToDb,
  saveToolsProxiesToDb: mocks.saveToolsProxiesToDb,
  savePolicyRulesToDb: mocks.savePolicyRulesToDb,
  getAllConfigFromDb: mocks.getAllConfigFromDb,
  getDistinctTenantIds: mocks.getDistinctTenantIds,
}));

vi.mock("../src/configLoader.js", () => ({
  loadConfigFromFile: mocks.loadConfigFromFile,
}));

import { migrate, resolveTenantId, resolveTenantsForMigration } from "../src/db/migrate.js";

const {
  saveMcpServerProxiesToDb,
  saveToolsProxiesToDb,
  savePolicyRulesToDb,
  getAllConfigFromDb,
  getDistinctTenantIds,
  loadConfigFromFile,
} = mocks;

describe("resolveTenantId", () => {
  it("prefers explicit tenant flag", () => {
    expect(resolveTenantId(["--tenant", "acme"])).toBe("acme");
    expect(resolveTenantId(["-t", "team"])).toBe("team");
  });

  it("returns undefined when no tenant is provided", () => {
    expect(resolveTenantId([])).toBeUndefined();
    expect(resolveTenantId(["--tenant"])).toBeUndefined();
  });
});

describe("resolveTenantsForMigration", () => {
  it("uses explicit tenant when provided", async () => {
    expect(await resolveTenantsForMigration("tenant-123")).toEqual(["tenant-123"]);
  });

  it("returns all distinct tenants when no tenant is provided", async () => {
    mocks.getDistinctTenantIds.mockResolvedValueOnce([null, "team-a", "team-b", "team-a"]);

    await expect(resolveTenantsForMigration()).resolves.toEqual([undefined, "team-a", "team-b"]);
  });

  it("defaults to global when database has no tenants", async () => {
    mocks.getDistinctTenantIds.mockResolvedValueOnce([]);

    await expect(resolveTenantsForMigration()).resolves.toEqual([undefined]);
  });
});

describe("migrate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDistinctTenantIds.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves config under the provided tenant", async () => {
    getAllConfigFromDb.mockResolvedValueOnce({
      mcpServerProxies: {},
      toolsProxies: {},
      policyRules: [],
    });

    loadConfigFromFile.mockReturnValue({
      mcpServerProxies: { a: { name: "a", description: "", command: "echo", args: [], enabled: true, defaultPolicy: {} } },
      toolsProxies: { tool: { name: "tool", description: "", allowedRoles: [], sensitivity: "low", category: "file" } },
      policyRules: [{ name: "rule", description: "", priority: 1, condition: {}, action: { operation: "allow" }, stopOnMatch: false }],
    });

    await migrate(false, "tenant-123");

    expect(getAllConfigFromDb).toHaveBeenCalledWith("tenant-123");
    expect(saveMcpServerProxiesToDb).toHaveBeenCalledWith(expect.any(Object), "tenant-123");
    expect(saveToolsProxiesToDb).toHaveBeenCalledWith(expect.any(Object), "tenant-123");
    expect(savePolicyRulesToDb).toHaveBeenCalledWith(expect.any(Array), "tenant-123");
  });

  it("runs migration for all tenants when none provided", async () => {
    getDistinctTenantIds.mockResolvedValueOnce([null, "tenant-one"]);

    getAllConfigFromDb.mockResolvedValue({
      mcpServerProxies: {},
      toolsProxies: {},
      policyRules: [],
    });

    loadConfigFromFile.mockReturnValue({
      mcpServerProxies: { a: { name: "a", description: "", command: "echo", args: [], enabled: true, defaultPolicy: {} } },
      toolsProxies: {},
      policyRules: [],
    });

    await migrate(false, undefined);

    expect(saveMcpServerProxiesToDb).toHaveBeenCalledTimes(2);
    expect(saveMcpServerProxiesToDb).toHaveBeenCalledWith(expect.any(Object), undefined);
    expect(saveMcpServerProxiesToDb).toHaveBeenCalledWith(expect.any(Object), "tenant-one");
  });

  it("skips migration when tenant already has data and force is false", async () => {
    getAllConfigFromDb.mockResolvedValueOnce({
      mcpServerProxies: { existing: {} },
      toolsProxies: {},
      policyRules: [],
    });

    await migrate(false, "tenant-with-data");

    expect(loadConfigFromFile).not.toHaveBeenCalled();
    expect(saveMcpServerProxiesToDb).not.toHaveBeenCalled();
    expect(saveToolsProxiesToDb).not.toHaveBeenCalled();
    expect(savePolicyRulesToDb).not.toHaveBeenCalled();
  });
});
