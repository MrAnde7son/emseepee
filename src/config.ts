import { logger } from "./logger.js";

export type Sensitivity = "low" | "medium" | "high";
export type ToolCategory = "file" | "web" | "terminal" | "third_party";
export type ToolExecutionType = "http" | "command" | "custom" | "openapi" | "a2a";
export type PolicyOperation = "allow" | "log" | "block" | "webhook" | "custom";
export type ProviderType = "cursor" | "n8n" | "openai" | "vertex" | "bedrock" | "copilot" | "langchain" | "custom";

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
  // Match by agent ID (Hakuna stable ID)
  agentId?: string | string[];
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
 * Supports three connection types:
 * 1. Command-based (npx, node, etc.) - legacy @modelcontextprotocol/* packages
 * 2. Docker-based - docker run with MCP server images
 * 3. Remote endpoint - HTTP/SSE connection to remote MCP server
 */
export interface OAuthConfig {
  provider: string; // OAuth provider type (e.g., "notion", "slack", "linear", "github", or any custom provider)
  clientId?: string; // OAuth client ID (can be stored in env vars)
  clientSecret?: string; // OAuth client secret (should be in env vars, not config)
  authorizationUrl: string; // OAuth authorization endpoint
  tokenUrl: string; // OAuth token endpoint
  scopes?: string[]; // Required OAuth scopes
  redirectUri?: string; // OAuth redirect URI (defaults to gateway callback URL)
  clientIdHelpUrl?: string; // URL where users can get their OAuth client ID
  clientIdHelpText?: string; // Custom help text for obtaining the OAuth client ID (supports {link} placeholder)
  authorizationParams?: Record<string, string>; // Extra query params to send to authorization endpoint
  tokenRequestContentType?: "json" | "form"; // How to encode the token exchange request body (defaults to "form")
  tokenAuthMethod?: "basic" | "body"; // Whether to send client credentials via Basic auth header or in the body (defaults to "body")
  tokenGrantType?: string; // Override grant_type (defaults to "authorization_code")
}

export interface McpServerProxyConfig {
  name: string; // Unique identifier for this proxy
  description?: string;
  // For command-based or docker-based connections
  command?: string; // Command to start the MCP server (e.g., "npx", "node", "docker")
  args?: string[]; // Arguments for the command
  env?: Record<string, string>; // Environment variables
  cwd?: string; // Working directory
  // For remote endpoint connections
  serverUrl?: string; // URL of the remote MCP server endpoint (e.g., "https://api.githubcopilot.com/mcp")
  headers?: Record<string, string>; // HTTP headers for remote endpoint (supports ${VAR} env var substitution)
  enabled?: boolean; // Whether this MCP server proxy is enabled (default: false)
  // Optional: icon for the MCP server (can be a Lucide icon name or image URL)
  icon?: string;
  // OAuth configuration (for OAuth-based authentication)
  oauth?: OAuthConfig;
  // Default policy for all tools from this server
  defaultPolicy: {
    allowedRoles: string[];
    sensitivity: Sensitivity;
  };
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

export interface OpenApiAuthConfig {
  type: "oauth2" | "bearer" | "apiKey";
  headerName?: string;
  oauthProvider?: string;
  token?: string;
  tokenEnvVar?: string;
}

export interface OpenApiExecutionConfig {
  type: "openapi";
  openApiUrl: string;
  auth?: OpenApiAuthConfig;
}

/**
 * Authentication configuration for A2A execution
 */
export interface A2aAuthConfig {
  type: "bearer";
  envVar: string; // Environment variable containing the token
  headerName?: string; // Header to place the token in (default: Authorization)
  scheme?: string; // Authentication scheme prefix (default: Bearer)
}

/**
 * Authentication configuration for A2A execution
 */
export interface A2aAuthConfig {
  type: "bearer";
  envVar: string; // Environment variable containing the token
  headerName?: string; // Header to place the token in (default: Authorization)
  scheme?: string; // Authentication scheme prefix (default: Bearer)
}

/**
 * Agent-to-Agent (A2A) execution configuration
 * 
 * The endpoint should be the base URL of the A2A agent (e.g., https://agent.example.com).
 * The implementation will construct the proper A2A message endpoint automatically.
 * 
 * According to A2A protocol:
 * - Agent card is available at /.well-known/agent.json
 * - Messages are sent via POST to the base URL or /message endpoint
 */
export interface A2aExecutionConfig {
  type: "a2a";
  endpoint: string; // Base URL of the remote A2A agent (e.g., https://agent.example.com)
  messageEndpoint?: string; // Optional: custom message endpoint path (default: "/" or "/message")
  protocol?: string; // Protocol version/identifier (e.g., "0.2.5")
  providerId?: string; // Target provider identifier
  auth?: A2aAuthConfig; // Authentication for the remote agent
  timeoutMs?: number; // Request timeout in milliseconds
  metadata?: Record<string, unknown>; // Additional metadata to send alongside the call
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
export interface DeclarativeThirdPartyToolConfig extends ToolPolicyConfig {
  category: "third_party";
  execution: HttpExecutionConfig | CommandExecutionConfig | CustomExecutionConfig | A2aExecutionConfig;
  inputSchema: ToolInputSchema;
}

export interface OpenApiToolConfig extends ToolPolicyConfig {
  category: "third_party";
  execution: OpenApiExecutionConfig;
}

export type ThirdPartyToolConfig = DeclarativeThirdPartyToolConfig | OpenApiToolConfig;

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
type CachedConfig = {
  mcpServerProxies: McpServerProxyRegistry;
  toolsProxies: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
  policyRules: PolicyRule[];
};

const CONFIG_CACHE = new Map<string, CachedConfig>();
const GLOBAL_CACHE_KEY = "__global__";

function getCacheKey(tenantId?: string): string {
  return tenantId ?? GLOBAL_CACHE_KEY;
}

/**
 * Load configuration from database (lazy loading, async)
 * Falls back to file if database is not available
 */
export async function loadConfig(tenantId?: string): Promise<{
  mcpServerProxies: McpServerProxyRegistry;
  toolsProxies: Record<string, ToolPolicyConfig | ThirdPartyToolConfig>;
  policyRules: PolicyRule[];
}> {
  const cacheKey = getCacheKey(tenantId);
  if (!CONFIG_CACHE.has(cacheKey)) {
    try {
      // Try to load from database first
      const { getAllConfigFromDb } = await import("./db/services/configService.js");
      const config = await getAllConfigFromDb(tenantId);
      
      // If database is empty, try to load from file and migrate
      if (Object.keys(config.mcpServerProxies).length === 0 && 
          Object.keys(config.toolsProxies).length === 0 && 
          config.policyRules.length === 0) {
        // Fallback to file
        const { loadConfigFromFile } = await import("./configLoader.js");
        const fileConfig = loadConfigFromFile();
        const cached = {
          mcpServerProxies: fileConfig.mcpServerProxies,
          toolsProxies: fileConfig.toolsProxies,
          policyRules: fileConfig.policyRules,
        };
        CONFIG_CACHE.set(cacheKey, cached);
        
        // Migrate to database only for global tenant to avoid overwriting tenant-specific data
        if (!tenantId) {
          const { saveMcpServerProxiesToDb, saveToolsProxiesToDb, savePolicyRulesToDb } = await import("./db/services/configService.js");
          await saveMcpServerProxiesToDb(fileConfig.mcpServerProxies);
          await saveToolsProxiesToDb(fileConfig.toolsProxies);
          await savePolicyRulesToDb(fileConfig.policyRules);
          logger.info("[CONFIG] Migrated configuration from file to database");
        }
      } else {
        CONFIG_CACHE.set(cacheKey, {
          mcpServerProxies: config.mcpServerProxies,
          toolsProxies: config.toolsProxies,
          policyRules: config.policyRules,
        });
      }
    } catch (error) {
      // If database fails, fallback to file
      logger.warn("[CONFIG] Database not available, falling back to file:", error);
      const { loadConfigFromFile } = await import("./configLoader.js");
      const config = loadConfigFromFile();
      CONFIG_CACHE.set(cacheKey, {
        mcpServerProxies: config.mcpServerProxies,
        toolsProxies: config.toolsProxies,
        policyRules: config.policyRules,
      });
    }
  }
  // At this point, we know they're not null due to the check above
  return {
    ...CONFIG_CACHE.get(cacheKey)!,
  };
}

/**
 * Clear the config cache (useful after modifying config.json)
 */
export function clearConfigCache(tenantId?: string): void {
  if (tenantId === undefined) {
    CONFIG_CACHE.clear();
  } else {
    CONFIG_CACHE.delete(getCacheKey(tenantId));
  }
  logger.info("[CONFIG] Configuration cache cleared - config will be reloaded on next access");
}

/**
 * Start watching config for changes and automatically reload
 * With database, we don't need file watching, but we keep this for backward compatibility
 * In the future, we could implement database change notifications
 */
export function startConfigWatcher(): void {
  // With database storage, file watching is not needed
  // Configuration changes are handled through the API
  logger.info("[CONFIG] Using database storage - file watching not needed");
}

/**
 * Get policy rules (loaded from config.json)
 */
export async function getPolicyRules(tenantId?: string): Promise<PolicyRule[]> {
  const config = await loadConfig(tenantId);
  return config.policyRules;
}

/**
 * Get MCP server proxies (loaded from config.json)
 */
export async function getMcpServerProxies(tenantId?: string): Promise<McpServerProxyRegistry> {
  const config = await loadConfig(tenantId);
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
      allowedRoles: [],
      sensitivity: "medium",
      category: "file",
    },
    file_search_gateway: {
      name: "file_search_gateway",
      description: "Search for files through the central gateway with policy enforcement.",
      allowedRoles: [],
      sensitivity: "medium",
      category: "file",
    },
    file_write_gateway: {
      name: "file_write_gateway",
      description: "Write files through the central gateway with policy enforcement.",
      allowedRoles: [],
      sensitivity: "high",
      category: "file",
    },
    list_file_gateway: {
      name: "list_file_gateway",
      description: "List files and directories through the central gateway with policy enforcement.",
      allowedRoles: [],
      sensitivity: "medium",
      category: "file",
    },
    file_grep_gateway: {
      name: "file_grep_gateway",
      description: "Search for patterns in file contents through the central gateway with policy enforcement. Supports regex patterns, file type filtering, and case-sensitive/insensitive matching.",
      allowedRoles: [],
      sensitivity: "medium",
      category: "file",
    },
  },
  web: {
    web_search_gateway: {
      name: "web_search_gateway",
      description: "Perform comprehensive web search through the central gateway with policy enforcement. Supports multiple search providers (Tavily, SerpAPI, Google Custom Search, Bing, DuckDuckGo) with automatic provider selection based on available API keys. Returns structured results with titles, snippets, and URLs.",
      allowedRoles: [],
      sensitivity: "medium",
      category: "web",
    },
  },
  terminal: {
    terminal_command: {
      name: "terminal_command",
      description: "Execute terminal commands through the central gateway with policy enforcement. Supports custom working directory, environment variables, and timeout configuration.",
      allowedRoles: [],
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
export async function getToolRegistry(tenantId?: string): Promise<ToolCategoryRegistry> {
  const config = await loadConfig(tenantId);
  const { toolsProxies } = config;
  
  logger.info(`[CONFIG] Loading tool registry - found ${Object.keys(toolsProxies).length} tools in config`);
  
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
  
  const result = {
    file: mergedFileTools,
    web: mergedWebTools,
    terminal: mergedTerminalTools,
    third_party: thirdPartyTools,
  };
  
  logger.info(`[CONFIG] Tool registry loaded - file: ${Object.keys(result.file).length}, web: ${Object.keys(result.web).length}, terminal: ${Object.keys(result.terminal).length}, third_party: ${Object.keys(result.third_party).length}`);
  
  return result;
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getToolRegistry() instead
 * Note: This will be initialized asynchronously, use getToolRegistry() for proper async handling
 */
export async function getToolRegistrySync(tenantId?: string): Promise<ToolCategoryRegistry> {
  return await getToolRegistry(tenantId);
}

/**
 * Get all tools from a specific category
 */
export async function getToolsByCategory(category: ToolCategory, tenantId?: string): Promise<Record<string, ToolPolicyConfig | ThirdPartyToolConfig>> {
  const registry = await getToolRegistry(tenantId);
  return registry[category] || {};
}

/**
 * Type guard to check if a tool config is a third-party tool
 */
export function isOpenApiToolConfig(
  tool: ToolPolicyConfig | ThirdPartyToolConfig
): tool is OpenApiToolConfig {
  return (
    (tool as ThirdPartyToolConfig).category === "third_party" &&
    "execution" in tool &&
    (tool as ThirdPartyToolConfig).execution?.type === "openapi"
  );
}

export function isDeclarativeThirdPartyToolConfig(
  tool: ToolPolicyConfig | ThirdPartyToolConfig
): tool is DeclarativeThirdPartyToolConfig {
  return (
    (tool as ThirdPartyToolConfig).category === "third_party" &&
    "execution" in tool &&
    (tool as ThirdPartyToolConfig).execution?.type !== "openapi" &&
    "inputSchema" in tool
  );
}

export function isThirdPartyToolConfig(
  tool: ToolPolicyConfig | ThirdPartyToolConfig
): tool is ThirdPartyToolConfig {
  return isOpenApiToolConfig(tool) || isDeclarativeThirdPartyToolConfig(tool);
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
      (tool) => tool.enabled !== false
    );
  }) as ToolCategory[];
}

/**
 * Agent metadata - unified representation of an agent across all providers
 */
export interface Agent {
  // Stable Hakuna identity
  id: string;
  // Human-readable name
  name: string;
  // Description of the agent's purpose
  description?: string;
  // Provider this agent belongs to
  providerId: string;
  // Provider-specific native ID (e.g., GPT assistant ID, n8n workflow ID)
  providerNativeId?: string;
  // Agent role/category (e.g., "coder_bot", "research_bot", "admin")
  role?: string;
  // Environment context (e.g., "production", "staging", "development")
  env?: string;
  // Tenant/organization mapping
  tenantId?: string;
  // Owner/user who created or manages this agent
  owner?: string;
  // Custom metadata
  metadata?: Record<string, unknown>;
  // Whether this agent is active/enabled
  enabled: boolean;
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
}

/**
 * Provider Agent Adapter - interface for providers to implement
 * Allows providers to project their native agent concept into Hakuna's unified Agent model
 */
export interface ProviderAgentAdapter {
  /**
   * Get the provider ID this adapter handles
   */
  getProviderId(): string;
  
  /**
   * List all agents from this provider
   */
  listAgents(): Promise<Agent[]>;
  
  /**
   * Get a specific agent by its provider-native ID
   */
  getAgent(providerNativeId: string): Promise<Agent | null>;
  
  /**
   * Create a new agent in the provider
   */
  createAgent(agent: Omit<Agent, "id" | "providerId" | "createdAt" | "updatedAt">): Promise<Agent>;
  
  /**
   * Update an existing agent
   */
  updateAgent(providerNativeId: string, updates: Partial<Agent>): Promise<Agent>;
  
  /**
   * Delete an agent
   */
  deleteAgent(providerNativeId: string): Promise<void>;
  
  /**
   * Check if the provider is available/connected
   */
  isAvailable(): Promise<boolean>;
}
