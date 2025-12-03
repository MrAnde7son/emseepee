import { promises as fs } from "fs";
import { join, resolve, dirname } from "path";
import type { ToolPolicyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";

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

export interface FileListArgs extends Record<string, unknown> {
  path?: string;
}

export interface FileGrepArgs extends Record<string, unknown> {
  pattern: string;
  directory?: string;
  fileType?: string;
  caseSensitive?: boolean;
  limit?: number;
}

/**
 * Handler for file system operations (read, write, search, list)
 */
export class FileOperationsHandler extends BaseGatewayHandler {
  private toolConfigs: {
    read?: ToolPolicyConfig;
    write?: ToolPolicyConfig;
    search?: ToolPolicyConfig;
    list?: ToolPolicyConfig;
    grep?: ToolPolicyConfig;
  };
  private currentToolName: string = "file_operations";

  constructor(toolConfigs: {
    read?: ToolPolicyConfig;
    write?: ToolPolicyConfig;
    search?: ToolPolicyConfig;
    list?: ToolPolicyConfig;
    grep?: ToolPolicyConfig;
  }) {
    super();
    this.toolConfigs = toolConfigs;
  }

  protected getToolName(): string {
    return this.currentToolName;
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

    this.currentToolName = "file_read_gateway";
    return this.executeWithPolicy(agentContext, args, async () => {
      const filePath = this.resolvePath(args.path);
      const encoding = (args.encoding || "utf-8") as BufferEncoding;
      const content = await fs.readFile(filePath, { encoding });

      logger.info("[MCP-GATEWAY] file_read_gateway success", {
        path: filePath,
        encoding: args.encoding,
        contentLength: content.length,
      });

      return this.createSuccessResponse(content);
    }, toolCfg);
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

    this.currentToolName = "file_write_gateway";
    return this.executeWithPolicy(agentContext, args, async () => {
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
    }, toolCfg);
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

    this.currentToolName = "file_search_gateway";
    return this.executeWithPolicy(agentContext, args, async () => {
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
    }, toolCfg);
  }

  /**
   * List files and directories in a directory
   */
  async listFiles(
    agentContext: AgentContext,
    args: FileListArgs
  ): Promise<ToolExecutionResult> {
    const toolCfg = this.toolConfigs.list;
    if (!toolCfg) {
      return this.createErrorResponse("File list tool not configured");
    }

    this.currentToolName = "list_file_gateway";
    return this.executeWithPolicy(agentContext, args, async () => {
      const listPath = args.path
        ? this.resolvePath(args.path)
        : process.cwd();

      const entries = await fs.readdir(listPath, { withFileTypes: true });
      const items: string[] = [];

      for (const entry of entries) {
        const itemName = entry.name;
        const itemType = entry.isDirectory() ? "directory" : "file";
        items.push(`${itemType}: ${itemName}`);
      }

      logger.info("[MCP-GATEWAY] list_file_gateway success", {
        path: listPath,
        itemsCount: items.length,
      });

      const resultText =
        items.length > 0
          ? items.join("\n")
          : `Directory "${listPath}" is empty`;

      return this.createSuccessResponse(resultText);
    }, toolCfg);
  }

  /**
   * Search for patterns in file contents (grep-like functionality)
   */
  async grepFiles(
    agentContext: AgentContext,
    args: FileGrepArgs
  ): Promise<ToolExecutionResult> {
    const toolCfg = this.toolConfigs.grep;
    if (!toolCfg) {
      return this.createErrorResponse("File grep tool not configured");
    }

    this.currentToolName = "file_grep_gateway";
    return this.executeWithPolicy(agentContext, args, async () => {
      const searchDir = args.directory
        ? this.resolvePath(args.directory)
        : process.cwd();

      const results: Array<{ file: string; line: number; match: string }> = [];
      const limit = args.limit || 100;
      const pattern = args.pattern;
      const fileTypeFilter = args.fileType ? args.fileType.replace("*", "") : null;
      const caseSensitive = args.caseSensitive === true;

      // Create regex pattern
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseSensitive ? "g" : "gi");
      } catch (err) {
        return this.createErrorResponse(
          `Invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      await this.grepDirectory(searchDir, regex, fileTypeFilter, results, limit);

      logger.info("[MCP-GATEWAY] file_grep_gateway success", {
        pattern: args.pattern,
        directory: searchDir,
        resultsCount: results.length,
        caseSensitive,
      });

      if (results.length === 0) {
        return this.createSuccessResponse(
          `No matches found for pattern "${pattern}"`
        );
      }

      // Format results as file:line:match
      const resultText = results
        .map((r) => {
          const relativePath = r.file.replace(process.cwd(), ".");
          return `${relativePath}:${r.line}:${r.match.trim()}`;
        })
        .join("\n");

      return this.createSuccessResponse(resultText);
    }, toolCfg);
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
   * Recursively grep files for pattern matches
   */
  private async grepDirectory(
    dir: string,
    pattern: RegExp,
    fileTypeFilter: string | null,
    results: Array<{ file: string; line: number; match: string }>,
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
          entry.name === "dist" ||
          entry.name.startsWith(".")
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.grepDirectory(fullPath, pattern, fileTypeFilter, results, limit);
        } else if (entry.isFile()) {
          // Check file type filter
          if (fileTypeFilter && !entry.name.endsWith(fileTypeFilter)) {
            continue;
          }

          // Skip binary-like files
          const binaryExtensions = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz"];
          if (binaryExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
            continue;
          }

          try {
            // Read file and search for pattern
            const content = await fs.readFile(fullPath, { encoding: "utf-8" });
            const lines = content.split("\n");

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
              if (results.length >= limit) break;

              const line = lines[lineNum];
              // Reset regex lastIndex before testing (match() doesn't use it, but good practice)
              pattern.lastIndex = 0;
              const matches = line.match(pattern);

              if (matches && matches.length > 0) {
                // Add the line once per match found (standard grep behavior)
                // If multiple matches on same line, we add it once per match
                for (let i = 0; i < matches.length && results.length < limit; i++) {
                  results.push({
                    file: fullPath,
                    line: lineNum + 1,
                    match: line,
                  });
                }
              }
            }
          } catch (err) {
            // Skip files we can't read (binary, permissions, etc.)
            logger.warn("[MCP-GATEWAY] file_grep_gateway: Cannot read file", {
              file: fullPath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    } catch (err) {
      // Skip directories we can't read (permissions, etc.)
      logger.warn("[MCP-GATEWAY] file_grep_gateway: Cannot read directory", {
        dir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

}

