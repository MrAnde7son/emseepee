import { promises as fs } from "fs";
import { join, resolve, dirname } from "path";
import type { ToolPolicyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";
import { evaluatePolicy } from "../../policy.js";
import { inferAgentIntent, type ToolCallEvent } from "../../intent/index.js";

export interface FileReadArgs extends Record<string, unknown> {
  path: string;
  encoding?: string;
}

export interface FileWriteArgs extends Record<string, unknown> {
  path: string;
  contents: string;
  encoding?: string;
}

export interface FileSearchArgs extends Record<string, unknown> {
  pattern: string;
  directory?: string;
  fileType?: string;
  limit?: number;
}

/**
 * Handler for file system operations (read, write, search)
 */
export class FileOperationsHandler extends BaseGatewayHandler {
  private toolConfigs: {
    read?: ToolPolicyConfig;
    write?: ToolPolicyConfig;
    search?: ToolPolicyConfig;
  };

  constructor(toolConfigs: {
    read?: ToolPolicyConfig;
    write?: ToolPolicyConfig;
    search?: ToolPolicyConfig;
  }) {
    super();
    this.toolConfigs = toolConfigs;
  }

  protected getToolName(): string {
    return "file_operations";
  }

  protected getToolConfig(): ToolPolicyConfig | undefined {
    // This is a fallback - each method uses its specific config
    return this.toolConfigs.read;
  }

  /**
   * Read a file from the filesystem
   */
  async readFile(
    agentContext: AgentContext,
    args: FileReadArgs
  ): Promise<ToolExecutionResult> {
    const toolCfg = this.toolConfigs.read;
    if (!toolCfg) {
      return this.createErrorResponse("File read tool not configured");
    }

    const { decision, intent } = await this.evaluatePolicy(agentContext, args, toolCfg);
    this.logRequest(agentContext, args, decision, intent);

    if (decision.decision === "deny") {
      return this.createDeniedResponse(decision.reason);
    }

    try {
      const filePath = this.resolvePath(args.path);
      const encoding = (args.encoding || "utf-8") as BufferEncoding;
      const content = await fs.readFile(filePath, { encoding });

      logger.info("[MCP-GATEWAY] file_read_gateway success", {
        path: filePath,
        encoding: args.encoding,
        contentLength: content.length,
      });

      return this.createSuccessResponse(content);
    } catch (error) {
      return this.handleError(error, args);
    }
  }

  /**
   * Write a file to the filesystem
   */
  async writeFile(
    agentContext: AgentContext,
    args: FileWriteArgs
  ): Promise<ToolExecutionResult> {
    const toolCfg = this.toolConfigs.write;
    if (!toolCfg) {
      return this.createErrorResponse("File write tool not configured");
    }

    const { decision, intent } = await this.evaluatePolicy(agentContext, args, toolCfg);
    this.logRequest(agentContext, args, decision, intent);

    if (decision.decision === "deny") {
      return this.createDeniedResponse(decision.reason);
    }

    try {
      const filePath = this.resolvePath(args.path);
      const dir = dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      const encoding = (args.encoding || "utf-8") as BufferEncoding;
      await fs.writeFile(filePath, args.contents, { encoding });

      logger.info("[MCP-GATEWAY] file_write_gateway success", {
        path: filePath,
        encoding: args.encoding,
        contentLength: args.contents.length,
      });

      return this.createSuccessResponse(
        `Successfully wrote ${args.contents.length} characters to ${filePath}`
      );
    } catch (error) {
      return this.handleError(error, args);
    }
  }

  /**
   * Search for files in the filesystem
   */
  async searchFiles(
    agentContext: AgentContext,
    args: FileSearchArgs
  ): Promise<ToolExecutionResult> {
    const toolCfg = this.toolConfigs.search;
    if (!toolCfg) {
      return this.createErrorResponse("File search tool not configured");
    }

    const { decision, intent } = await this.evaluatePolicy(agentContext, args, toolCfg);
    this.logRequest(agentContext, args, decision, intent);

    if (decision.decision === "deny") {
      return this.createDeniedResponse(decision.reason);
    }

    try {
      const searchDir = args.directory
        ? this.resolvePath(args.directory)
        : process.cwd();

      const results: string[] = [];
      const limit = args.limit || 20;
      const pattern = args.pattern.toLowerCase();
      const fileTypeFilter = args.fileType ? args.fileType.replace("*", "") : null;

      await this.searchDirectory(searchDir, pattern, fileTypeFilter, results, limit);

      logger.info("[MCP-GATEWAY] file_search_gateway success", {
        pattern: args.pattern,
        directory: searchDir,
        resultsCount: results.length,
      });

      const resultText =
        results.length > 0
          ? results.map((p) => p.replace(process.cwd(), ".")).join("\n")
          : `No files found matching pattern "${args.pattern}"`;

      return this.createSuccessResponse(resultText);
    } catch (error) {
      return this.handleError(error, args);
    }
  }

  /**
   * Resolve a path (handle both absolute and relative paths)
   */
  private resolvePath(path: string): string {
    return path.startsWith("/") ? path : resolve(process.cwd(), path);
  }

  /**
   * Recursively search directories for matching files
   */
  private async searchDirectory(
    dir: string,
    pattern: string,
    fileTypeFilter: string | null,
    results: string[],
    limit: number
  ): Promise<void> {
    if (results.length >= limit) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= limit) break;

        const fullPath = join(dir, entry.name);

        // Skip node_modules and other common ignore directories
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name.startsWith(".")
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.searchDirectory(fullPath, pattern, fileTypeFilter, results, limit);
        } else if (entry.isFile()) {
          // Check file type filter
          if (fileTypeFilter && !entry.name.endsWith(fileTypeFilter)) {
            continue;
          }

          // Check if filename or path matches pattern
          const fileName = entry.name.toLowerCase();
          const relativePath = fullPath.replace(process.cwd(), "").toLowerCase();

          if (fileName.includes(pattern) || relativePath.includes(pattern)) {
            results.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Skip directories we can't read (permissions, etc.)
      logger.warn("[MCP-GATEWAY] file_search_gateway: Cannot read directory", {
        dir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Evaluate policy for a specific tool
   */
  private async evaluatePolicy(
    agentContext: AgentContext,
    args: Record<string, unknown>,
    toolCfg: ToolPolicyConfig
  ): Promise<{ decision: Awaited<ReturnType<typeof evaluatePolicy>>; intent: Awaited<ReturnType<typeof inferAgentIntent>> }> {
    // Step 1: Intent Layer
    const toolCallEvent: ToolCallEvent = {
      toolName: toolCfg.name,
      arguments: args,
      agentId: agentContext.agentId,
      provider: 'cursor',
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    const intent = await inferAgentIntent(toolCallEvent, {
      name: toolCfg.name,
      description: toolCfg.description,
    });

    // Step 2: Policy Engine
    const decision = await evaluatePolicy({
      tool: toolCfg,
      agentId: agentContext.agentId,
      agentRole: agentContext.agentRole,
      env: agentContext.env,
      args,
      intent,
    });

    return { decision, intent };
  }
}

