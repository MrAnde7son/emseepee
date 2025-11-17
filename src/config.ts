
export type Sensitivity = "low" | "medium" | "high";
export type ToolCategory = "file" | "browser" | "third_party";
export type ToolExecutionType = "http" | "command" | "custom";

/**
 * MCP Server proxy configuration
 * Allows proxying entire MCP servers through the gateway
 */
export interface McpServerProxyConfig {
  name: string; // Unique identifier for this proxy
  description?: string;
  command: string; // Command to start the MCP server (e.g., "npx", "node")
  args: string[]; // Arguments for the command
  env?: Record<string, string>; // Environment variables
  cwd?: string; // Working directory
  // Default policy for all tools from this server (can be overridden per-tool)
  defaultPolicy: {
    allowedRoles: string[];
    sensitivity: Sensitivity;
  };
  // Optional: per-tool policy overrides
  toolPolicyOverrides?: Record<string, {
    allowedRoles?: string[];
    sensitivity?: Sensitivity;
  }>;
}

/**
 * HTTP execution configuration for third-party tools
 */
export interface HttpExecutionConfig {
  type: "http";
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string; // Can use template variables like {param}
  headers?: Record<string, string>; // Can use template variables
  bodyTemplate?: string; // JSON string template, can use {param}
  responsePath?: string; // JSONPath to extract from response (optional)
}

/**
 * Command execution configuration for third-party tools
 */
export interface CommandExecutionConfig {
  type: "command";
  command: string; // Command template, can use {param}
  args?: string[]; // Argument templates
  env?: Record<string, string>; // Environment variables
}

/**
 * Custom execution configuration (for future extensibility)
 */
export interface CustomExecutionConfig {
  type: "custom";
  handler: string; // Handler identifier
  config: Record<string, unknown>;
}

/**
 * Base policy configuration (for built-in tools)
 */
export interface ToolPolicyConfig {
  name: string;
  description: string;
  allowedRoles: string[];
  sensitivity: Sensitivity;
  category: ToolCategory;
}

/**
 * Input schema definition for a tool
 */
export interface ToolInputSchema {
  [key: string]: {
    type: "string" | "number" | "boolean" | "array" | "object";
    description?: string;
    required?: boolean;
    default?: unknown;
    enum?: unknown[];
  };
}

/**
 * Extended configuration for third-party tools with execution details
 */
export interface ThirdPartyToolConfig extends ToolPolicyConfig {
  category: "third_party";
  execution: HttpExecutionConfig | CommandExecutionConfig | CustomExecutionConfig;
  inputSchema: ToolInputSchema;
}

export interface ToolCategoryRegistry {
  [category: string]: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
}

/**
 * Registry of MCP server proxies
 */
export interface McpServerProxyRegistry {
  [proxyName: string]: McpServerProxyConfig;
}

/**
 * MCP Server Proxy Registry
 * Add MCP servers here to automatically proxy all their tools through the gateway
 */
export const MCP_SERVER_PROXIES: McpServerProxyRegistry = {
  // Example: GitHub MCP server proxy
  // Uncomment and configure to use:
  // github: {
  //   name: "github",
  //   description: "GitHub MCP server proxied through gateway",
  //   command: "npx",
  //   args: ["-y", "@modelcontextprotocol/server-github"],
  //   env: {
  //     GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || "",
  //   },
  //   defaultPolicy: {
  //     allowedRoles: ["coder_bot", "admin"],
  //     sensitivity: "medium",
  //   },
  //   toolPolicyOverrides: {
  //     // Override policy for specific tools
  //     "github_create_issue": {
  //       sensitivity: "high",
  //       allowedRoles: ["admin"],
  //     },
  //   },
  // },
};

export const TOOL_REGISTRY: ToolCategoryRegistry = {
  file: {
    file_read_gateway: {
      name: "file_read_gateway",
      description: "Read files through the central gateway with policy enforcement.",
      allowedRoles: ["coder_bot", "admin"],
      sensitivity: "medium",
      category: "file",
    },
    file_search_gateway: {
      name: "file_search_gateway",
      description: "Search for files through the central gateway with policy enforcement.",
      allowedRoles: ["coder_bot", "admin"],
      sensitivity: "medium",
      category: "file",
    },
    file_write_gateway: {
      name: "file_write_gateway",
      description: "Write files through the central gateway with policy enforcement.",
      allowedRoles: ["coder_bot", "admin"],
      sensitivity: "high",
      category: "file",
    },
  },
  browser: {
    web_search_gateway: {
      name: "web_search_gateway",
      description: "Perform web search through the central gateway with policy enforcement.",
      allowedRoles: ["coder_bot", "research_bot", "admin"],
      sensitivity: "medium",
      category: "browser",
    },
  },
  third_party: {
    // Example: Slack message tool (commented out - uncomment and configure to use)
    // slack_send_message: {
    //   name: "slack_send_message",
    //   description: "Send a message to a Slack channel through the gateway.",
    //   allowedRoles: ["coder_bot", "admin"],
    //   sensitivity: "medium",
    //   category: "third_party",
    //   execution: {
    //     type: "http",
    //     method: "POST",
    //     url: "https://slack.com/api/chat.postMessage",
    //     headers: {
    //       Authorization: "Bearer {token}",
    //       "Content-Type": "application/json",
    //     },
    //     bodyTemplate: '{"channel": "{channel}", "text": "{message}"}',
    //     responsePath: "ok", // Extract 'ok' field from response
    //   },
    //   inputSchema: {
    //     token: {
    //       type: "string",
    //       description: "Slack API token",
    //       required: true,
    //     },
    //     channel: {
    //       type: "string",
    //       description: "Slack channel ID or name",
    //       required: true,
    //     },
    //     message: {
    //       type: "string",
    //       description: "Message to send",
    //       required: true,
    //     },
    //   },
    // },
    //
    // Example: GitHub issue creation tool
    // github_create_issue: {
    //   name: "github_create_issue",
    //   description: "Create a GitHub issue through the gateway.",
    //   allowedRoles: ["coder_bot", "admin"],
    //   sensitivity: "high",
    //   category: "third_party",
    //   execution: {
    //     type: "http",
    //     method: "POST",
    //     url: "https://api.github.com/repos/{owner}/{repo}/issues",
    //     headers: {
    //       Authorization: "token {token}",
    //       Accept: "application/vnd.github.v3+json",
    //     },
    //     bodyTemplate: '{"title": "{title}", "body": "{body}"}',
    //     responsePath: "number", // Extract issue number from response
    //   },
    //   inputSchema: {
    //     token: {
    //       type: "string",
    //       description: "GitHub personal access token",
    //       required: true,
    //     },
    //     owner: {
    //       type: "string",
    //       description: "Repository owner",
    //       required: true,
    //     },
    //     repo: {
    //       type: "string",
    //       description: "Repository name",
    //       required: true,
    //     },
    //     title: {
    //       type: "string",
    //       description: "Issue title",
    //       required: true,
    //     },
    //     body: {
    //       type: "string",
    //       description: "Issue body/description",
    //       required: false,
    //     },
    //   },
    // },
  },
};

/**
 * Get all tools from a specific category
 */
export function getToolsByCategory(category: ToolCategory): Record<string, ToolPolicyConfig | ThirdPartyToolConfig> {
  return TOOL_REGISTRY[category] || {};
}

/**
 * Type guard to check if a tool config is a third-party tool
 */
export function isThirdPartyToolConfig(tool: ToolPolicyConfig | ThirdPartyToolConfig): tool is ThirdPartyToolConfig {
  return tool.category === "third_party" && "execution" in tool && "inputSchema" in tool;
}

/**
 * Get a tool by name across all categories
 */
export function getToolByName(name: string): ToolPolicyConfig | undefined {
  for (const categoryTools of Object.values(TOOL_REGISTRY)) {
    if (categoryTools[name]) {
      return categoryTools[name];
    }
  }
  return undefined;
}

/**
 * Get all enabled categories (categories that have at least one tool)
 */
export function getEnabledCategories(): ToolCategory[] {
  return Object.keys(TOOL_REGISTRY).filter(
    (category) => Object.keys(TOOL_REGISTRY[category]).length > 0
  ) as ToolCategory[];
}
