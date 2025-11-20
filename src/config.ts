

export type Sensitivity = "low" | "medium" | "high";
export type ToolCategory = "file" | "web" | "terminal" | "third_party";
export type ToolExecutionType = "http" | "command" | "custom";
export type PolicyOperation = "allow" | "log" | "block" | "webhook" | "custom";

/**
 * Policy rule condition - when to apply this rule
 */
export interface PolicyRuleCondition {
  // Match by tool name (exact or pattern)
  toolName?: string | string[];
  // Match by tool category
  category?: ToolCategory | ToolCategory[];
  // Match by agent role
  agentRole?: string | string[];
  // Match by environment
  env?: string | string[];
  // Match by sensitivity level
  sensitivity?: Sensitivity | Sensitivity[];
  // Match by argument values (key-value pairs)
  args?: Record<string, unknown>;
  // Match by provider ID (for provider-scoped policies)
  providerId?: string | string[];
}

/**
 * Policy rule action configuration
 */
export interface PolicyRuleAction {
  operation: PolicyOperation;
  // Custom message for the operation (used for log, block, and potentially other operations)
  message?: string;
  // For "webhook" operation: URL or handler to call
  webhookUrl?: string;
  webhookHandler?: string;
  // For "webhook" operation: HTTP method
  webhookMethod?: "GET" | "POST" | "PUT";
  // For "custom" operation: JavaScript code to execute
  customCode?: string;
}

/**
 * Policy rule - defines when and what action to take
 */
export interface PolicyRule {
  name: string;
  description?: string;
  condition: PolicyRuleCondition;
  action: PolicyRuleAction;
  // Priority: rules are evaluated in order, lower priority first
  priority?: number;
  // Whether to stop evaluation after this rule matches
  stopOnMatch?: boolean;
  // Whether this policy is archived (hidden from active policies but can be restored)
  archived?: boolean;
}

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
  enabled?: boolean; // Whether this MCP server proxy is enabled (default: false)
  // Optional: icon for the MCP server (can be a Lucide icon name or image URL)
  icon?: string;
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
  // Optional: list of tool names to disable (even if MCP server is enabled)
  disabledTools?: string[];
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
  enabled?: boolean; // Whether this tool is enabled (default: false)
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
 * Loaded dynamically from config.json file
 * Use loadConfig() to get the actual configuration
 */
let _mcpServerProxies: McpServerProxyRegistry | null = null;
let _toolsProxies: Record<string, ToolPolicyConfig | ThirdPartyToolConfig> | null = null;
let _policyRules: PolicyRule[] | null = null;

/**
 * Load configuration from file (lazy loading, async)
 */
export async function loadConfig(): Promise<{
  mcpServerProxies: McpServerProxyRegistry;
  toolsProxies: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
  policyRules: PolicyRule[];
}> {
  if (_mcpServerProxies === null || _toolsProxies === null || _policyRules === null) {
    // Use dynamic import for ESM compatibility
    const { loadConfigFromFile } = await import("./configLoader.js");
    const config = loadConfigFromFile();
    _mcpServerProxies = config.mcpServerProxies;
    _toolsProxies = config.toolsProxies;
    _policyRules = config.policyRules;
  }
  // At this point, we know they're not null due to the check above
  return {
    mcpServerProxies: _mcpServerProxies!,
    toolsProxies: _toolsProxies!,
    policyRules: _policyRules!,
  };
}

/**
 * Clear the config cache (useful after modifying config.json)
 */
export function clearConfigCache(): void {
  _mcpServerProxies = null;
  _toolsProxies = null;
  _policyRules = null;
}

/**
 * Get policy rules (loaded from config.json)
 */
export async function getPolicyRules(): Promise<PolicyRule[]> {
  const config = await loadConfig();
  return config.policyRules;
}

/**
 * Get MCP server proxies (loaded from config.json)
 */
export async function getMcpServerProxies(): Promise<McpServerProxyRegistry> {
  const config = await loadConfig();
  return config.mcpServerProxies;
}

/**
 * Default built-in tool registry (file and web tools)
 * These are the defaults if not overridden in config.json
 */
const DEFAULT_BUILT_IN_TOOLS: ToolCategoryRegistry = {
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
  web: {
    web_search_gateway: {
      name: "web_search_gateway",
      description: "Perform comprehensive web search through the central gateway with policy enforcement. Supports multiple search providers (Tavily, SerpAPI, Google Custom Search, Bing, DuckDuckGo) with automatic provider selection based on available API keys. Returns structured results with titles, snippets, and URLs.",
      allowedRoles: ["coder_bot", "research_bot", "admin"],
      sensitivity: "medium",
      category: "web",
    },
  },
  terminal: {
    terminal_command: {
      name: "terminal_command",
      description: "Execute terminal commands through the central gateway with policy enforcement. Supports custom working directory, environment variables, and timeout configuration.",
      allowedRoles: ["coder_bot", "admin"],
      sensitivity: "high",
      category: "terminal",
    },
  },
  third_party: {}, // Third-party tools are loaded from config.json
};

/**
 * Get the complete tool registry (built-in + dynamically loaded)
 * Built-in tools can be customized via config.json, but defaults are always available
 */
export async function getToolRegistry(): Promise<ToolCategoryRegistry> {
  const config = await loadConfig();
  const { toolsProxies } = config;
  
  // Separate tools by category
  const fileTools: Record<string, ToolPolicyConfig> = {};
  const webTools: Record<string, ToolPolicyConfig> = {};
  const terminalTools: Record<string, ToolPolicyConfig> = {};
  const thirdPartyTools: Record<string, ThirdPartyToolConfig> = {};
  
  for (const [toolName, toolConfig] of Object.entries(toolsProxies)) {
    if (isThirdPartyToolConfig(toolConfig)) {
      thirdPartyTools[toolName] = toolConfig;
    } else if (toolConfig.category === "file") {
      fileTools[toolName] = toolConfig;
    } else if (toolConfig.category === "web") {
      webTools[toolName] = toolConfig;
    } else if (toolConfig.category === "terminal") {
      terminalTools[toolName] = toolConfig;
    } else if (toolConfig.category === "third_party") {
      // This shouldn't happen if isThirdPartyToolConfig works correctly, but handle it
      thirdPartyTools[toolName] = toolConfig as ThirdPartyToolConfig;
    }
  }
  
  // Merge configured tools with defaults (configured tools override defaults)
  const mergedFileTools = {
    ...DEFAULT_BUILT_IN_TOOLS.file,
    ...fileTools,
  };
  
  const mergedWebTools = {
    ...DEFAULT_BUILT_IN_TOOLS.web,
    ...webTools,
  };
  
  const mergedTerminalTools = {
    ...DEFAULT_BUILT_IN_TOOLS.terminal,
    ...terminalTools,
  };
  
  return {
    file: mergedFileTools,
    web: mergedWebTools,
    terminal: mergedTerminalTools,
    third_party: thirdPartyTools,
  };
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getToolRegistry() instead
 * Note: This will be initialized asynchronously, use getToolRegistry() for proper async handling
 */
let _toolRegistry: ToolCategoryRegistry | null = null;
export async function getToolRegistrySync(): Promise<ToolCategoryRegistry> {
  if (_toolRegistry === null) {
    _toolRegistry = await getToolRegistry();
  }
  return _toolRegistry;
}

/**
 * Get all tools from a specific category
 */
export async function getToolsByCategory(category: ToolCategory): Promise<Record<string, ToolPolicyConfig | ThirdPartyToolConfig>> {
  const registry = await getToolRegistry();
  return registry[category] || {};
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
export async function getToolByName(name: string): Promise<ToolPolicyConfig | undefined> {
  const registry = await getToolRegistry();
  for (const categoryTools of Object.values(registry)) {
    if (categoryTools[name]) {
      return categoryTools[name];
    }
  }
  return undefined;
}

/**
 * Get all enabled categories (categories that have at least one enabled tool)
 */
export async function getEnabledCategories(): Promise<ToolCategory[]> {
  const registry = await getToolRegistry();
  return Object.keys(registry).filter((category) => {
    const categoryTools = registry[category];
    // Check if at least one tool in this category is enabled (must be explicitly true)
    return Object.values(categoryTools).some(
      (tool) => tool.enabled === true
    );
  }) as ToolCategory[];
}
