import { spawn } from "child_process";
import type { ToolPolicyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";

export interface TerminalCommandArgs extends Record<string, unknown> {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: boolean;
}

/**
 * Handler for terminal command execution with policy enforcement
 */
export class TerminalCommandsHandler extends BaseGatewayHandler {
  private toolConfig: ToolPolicyConfig;

  constructor(toolConfig: ToolPolicyConfig) {
    super();
    this.toolConfig = toolConfig;
  }

  protected getToolName(): string {
    return this.toolConfig.name;
  }

  protected getToolConfig(): ToolPolicyConfig {
    return this.toolConfig;
  }

  /**
   * Execute a terminal command with policy enforcement
   */
  async executeCommand(
    agentContext: AgentContext,
    args: TerminalCommandArgs
  ): Promise<ToolExecutionResult> {
    return this.executeWithPolicy(agentContext, args, async () => {
      const {
        command,
        args: commandArgs = [],
        cwd,
        env = {},
        timeout = 30000, // Default 30 seconds
        shell = true,
      } = args;

      if (!command || typeof command !== "string") {
        throw new Error("Command is required and must be a string");
      }

      // Validate command args are strings
      if (!Array.isArray(commandArgs) || !commandArgs.every((arg) => typeof arg === "string")) {
        throw new Error("Command args must be an array of strings");
      }

      logger.info(`[MCP-GATEWAY] Executing terminal command: ${command}`, {
        command,
        args: commandArgs,
        cwd: cwd || process.cwd(),
        timeout,
      });

      // Filter out undefined values from process.env and merge with custom env
      const processEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          processEnv[key] = value;
        }
      }

      const result = await this.runCommand(command, commandArgs, {
        cwd: cwd || process.cwd(),
        env: { ...processEnv, ...env },
        shell,
        timeout,
      });

      return this.createSuccessResponse(result);
    });
  }

  /**
   * Execute a shell command and return stdout/stderr
   */
  private runCommand(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      shell: boolean;
      timeout: number;
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        shell: options.shell,
      });

      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout | null = null;

      // Set up timeout
      if (options.timeout > 0) {
        timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          reject(
            new Error(
              `Command timed out after ${options.timeout}ms: ${command} ${args.join(" ")}`
            )
          );
        }, options.timeout);
      }

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (code !== 0) {
          const errorMessage = stderr || stdout || `Command failed with exit code ${code}`;
          reject(new Error(`Command failed: ${errorMessage}`));
        } else {
          // Return stdout, or stderr if stdout is empty (some commands write to stderr)
          resolve(stdout || stderr || "Command executed successfully");
        }
      });

      child.on("error", (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(new Error(`Failed to execute command: ${error.message}`));
      });
    });
  }
}

