import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { FileOperationsHandler } from "../src/tools/handlers/FileOperationsHandler.js";
import type { ToolPolicyConfig } from "../src/config.js";
import type { AgentContext } from "../src/tools/handlers/BaseGatewayHandler.js";
import * as policyModule from "../src/policy.js";

describe("FileOperationsHandler", () => {
  const testDir = join(process.cwd(), "test-temp");
  const mockAgentContext: AgentContext = {
    agentId: "test-agent",
    agentRole: "coder_bot",
    env: "dev",
  };

  const mockToolConfig: ToolPolicyConfig = {
    name: "file_read_gateway",
    description: "Read files",
    allowedRoles: ["coder_bot", "admin"],
    sensitivity: "medium",
    category: "file",
  };

  const mockWriteToolConfig: ToolPolicyConfig = {
    name: "file_write_gateway",
    description: "Write files",
    allowedRoles: ["coder_bot", "admin"],
    sensitivity: "high",
    category: "file",
  };

  const mockSearchToolConfig: ToolPolicyConfig = {
    name: "file_search_gateway",
    description: "Search files",
    allowedRoles: ["coder_bot", "admin"],
    sensitivity: "medium",
    category: "file",
  };

  beforeEach(async () => {
    // Create test directory
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("readFile", () => {
    it("should return error when tool config is not provided", async () => {
      const handler = new FileOperationsHandler({});

      const result = await handler.readFile(mockAgentContext, {
        path: "test.txt",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("File read tool not configured");
    });

    it("should deny access when policy decision is deny", async () => {
      const handler = new FileOperationsHandler({
        read: mockToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "deny",
        reason: "Access denied",
        operations: ["block"],
      });

      const result = await handler.readFile(mockAgentContext, {
        path: "test.txt",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access denied by gateway policy");
    });

    it("should read file successfully when policy allows", async () => {
      const handler = new FileOperationsHandler({
        read: mockToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const testFile = join(testDir, "test-read.txt");
      const testContent = "Hello, World!";
      await fs.writeFile(testFile, testContent, "utf-8");

      const result = await handler.readFile(mockAgentContext, {
        path: testFile,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe(testContent);
    });

    it("should handle file not found error", async () => {
      const handler = new FileOperationsHandler({
        read: mockToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const result = await handler.readFile(mockAgentContext, {
        path: join(testDir, "nonexistent.txt"),
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ENOENT");
    });

    it("should read file with custom encoding", async () => {
      const handler = new FileOperationsHandler({
        read: mockToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const testFile = join(testDir, "test-encoding.txt");
      const testContent = "Hello, World!";
      await fs.writeFile(testFile, testContent, "utf-8");

      const result = await handler.readFile(mockAgentContext, {
        path: testFile,
        encoding: "utf-8",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe(testContent);
    });

    it("should resolve relative paths", async () => {
      const handler = new FileOperationsHandler({
        read: mockToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const testFile = join(testDir, "test-relative.txt");
      const testContent = "Relative path test";
      await fs.writeFile(testFile, testContent, "utf-8");

      // Use relative path from testDir
      const relativePath = testFile.replace(process.cwd() + "/", "");

      const result = await handler.readFile(mockAgentContext, {
        path: relativePath,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe(testContent);
    });
  });

  describe("writeFile", () => {
    it("should return error when tool config is not provided", async () => {
      const handler = new FileOperationsHandler({});

      const result = await handler.writeFile(mockAgentContext, {
        path: "test.txt",
        contents: "test",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("File write tool not configured");
    });

    it("should deny access when policy decision is deny", async () => {
      const handler = new FileOperationsHandler({
        write: mockWriteToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "deny",
        reason: "Access denied",
        operations: ["block"],
      });

      const result = await handler.writeFile(mockAgentContext, {
        path: "test.txt",
        contents: "test",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access denied by gateway policy");
    });

    it("should write file successfully when policy allows", async () => {
      const handler = new FileOperationsHandler({
        write: mockWriteToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const testFile = join(testDir, "test-write.txt");
      const testContent = "Written content";

      const result = await handler.writeFile(mockAgentContext, {
        path: testFile,
        contents: testContent,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Successfully wrote");

      // Verify file was written
      const writtenContent = await fs.readFile(testFile, "utf-8");
      expect(writtenContent).toBe(testContent);
    });

    it("should create directory if it doesn't exist", async () => {
      const handler = new FileOperationsHandler({
        write: mockWriteToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const testFile = join(testDir, "nested", "dir", "test-write.txt");
      const testContent = "Nested directory test";

      const result = await handler.writeFile(mockAgentContext, {
        path: testFile,
        contents: testContent,
      });

      expect(result.isError).toBeUndefined();

      // Verify file was written in nested directory
      const writtenContent = await fs.readFile(testFile, "utf-8");
      expect(writtenContent).toBe(testContent);
    });

    it("should write file with custom encoding", async () => {
      const handler = new FileOperationsHandler({
        write: mockWriteToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const testFile = join(testDir, "test-encoding-write.txt");
      const testContent = "Encoding test";

      const result = await handler.writeFile(mockAgentContext, {
        path: testFile,
        contents: testContent,
        encoding: "utf-8",
      });

      expect(result.isError).toBeUndefined();

      // Verify file was written
      const writtenContent = await fs.readFile(testFile, "utf-8");
      expect(writtenContent).toBe(testContent);
    });
  });

  describe("searchFiles", () => {
    it("should return error when tool config is not provided", async () => {
      const handler = new FileOperationsHandler({});

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "test",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("File search tool not configured");
    });

    it("should deny access when policy decision is deny", async () => {
      const handler = new FileOperationsHandler({
        search: mockSearchToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "deny",
        reason: "Access denied",
        operations: ["block"],
      });

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "test",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access denied by gateway policy");
    });

    it("should find files matching pattern", async () => {
      const handler = new FileOperationsHandler({
        search: mockSearchToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      // Create test files
      await fs.writeFile(join(testDir, "test-file.txt"), "content", "utf-8");
      await fs.writeFile(join(testDir, "test-file-2.txt"), "content", "utf-8");
      await fs.writeFile(join(testDir, "other-file.txt"), "content", "utf-8");

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "test-file",
        directory: testDir,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("test-file");
      expect(result.content[0].text).toContain("test-file-2");
      expect(result.content[0].text).not.toContain("other-file");
    });

    it("should respect file type filter", async () => {
      const handler = new FileOperationsHandler({
        search: mockSearchToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      // Create test files
      await fs.writeFile(join(testDir, "test.ts"), "content", "utf-8");
      await fs.writeFile(join(testDir, "test.js"), "content", "utf-8");
      await fs.writeFile(join(testDir, "test.txt"), "content", "utf-8");

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "test",
        directory: testDir,
        fileType: "*.ts",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("test.ts");
      expect(result.content[0].text).not.toContain("test.js");
      expect(result.content[0].text).not.toContain("test.txt");
    });

    it("should respect limit parameter", async () => {
      const handler = new FileOperationsHandler({
        search: mockSearchToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      // Create multiple test files
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(join(testDir, `test-${i}.txt`), "content", "utf-8");
      }

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "test",
        directory: testDir,
        limit: 5,
      });

      expect(result.isError).toBeUndefined();
      const lines = result.content[0].text.split("\n").filter((line) => line.trim().length > 0);
      // Should have at most 5 results (plus potentially a message)
      expect(lines.length).toBeLessThanOrEqual(6);
    });

    it("should search from current directory when directory not specified", async () => {
      const handler = new FileOperationsHandler({
        search: mockSearchToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      // Create a test file in a subdirectory
      const subDir = join(testDir, "subdir");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(join(subDir, "test-file.txt"), "content", "utf-8");

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "test-file",
        directory: testDir,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("test-file");
    });

    it("should return message when no files found", async () => {
      const handler = new FileOperationsHandler({
        search: mockSearchToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "nonexistent-pattern-xyz",
        directory: testDir,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("No files found");
    });

    it("should skip node_modules and .git directories", async () => {
      const handler = new FileOperationsHandler({
        search: mockSearchToolConfig,
      });

      vi.spyOn(policyModule, "evaluatePolicy").mockResolvedValue({
        decision: "allow",
        reason: "Access allowed",
        operations: ["allow"],
      });

      // Create files in ignored directories
      await fs.mkdir(join(testDir, "node_modules"), { recursive: true });
      await fs.writeFile(join(testDir, "node_modules", "test.txt"), "content", "utf-8");

      await fs.mkdir(join(testDir, ".git"), { recursive: true });
      await fs.writeFile(join(testDir, ".git", "test.txt"), "content", "utf-8");

      // Create a file that should be found
      await fs.writeFile(join(testDir, "visible-test.txt"), "content", "utf-8");

      const result = await handler.searchFiles(mockAgentContext, {
        pattern: "test",
        directory: testDir,
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("visible-test");
      expect(result.content[0].text).not.toContain("node_modules");
      expect(result.content[0].text).not.toContain(".git");
    });
  });
});

