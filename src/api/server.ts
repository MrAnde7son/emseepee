import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { logger } from "../logger.js";
import { getToolRegistry, getMcpServerProxies, clearConfigCache } from "../config.js";
import { getPolicyRules } from "../config.js";
import { loadConfigFromFile } from "../configLoader.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PolicyRule, PolicyOperation, PolicyRuleCondition } from "../config.js";
// Types matching dashboard types
type ProviderType = "cursor" | "n8n" | "openai" | "vertex" | "bedrock" | "copilot" | "langchain" | "custom";

interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  status: "connected" | "error" | "pending";
  lastHeartbeat?: string;
  icon?: string;
  comingSoon?: boolean;
}

interface Tool {
  id: string;
  name: string;
  source: "builtin" | "mcp" | "third-party";
  providerId?: string;
  category?: string;
  riskLevel?: "low" | "medium" | "high";
  installed: boolean;
}

interface Policy {
  id: string;
  name: string;
  description?: string;
  scope: "tool" | "provider" | "agent" | "mcp" | "global";
  effect: "allow" | "deny" | "log" | "webhook" | "custom";
  priority: number;
  enabled: boolean;
  archived?: boolean;
  customCode?: string;
  scopeTarget?: string;
}

interface GatewayEvent {
  id: string;
  timestamp: string;
  provider: string;
  agentId: string;
  toolName: string;
  intentSummary: string;
  decision: "allow" | "deny" | "log";
  riskLevel?: "low" | "medium" | "high";
  latencyMs?: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.GATEWAY_API_PORT ? parseInt(process.env.GATEWAY_API_PORT, 10) : 8000;

/**
 * Get the path to config.json
 */
function getConfigPath(): string {
  // Try project root first (where the server is typically run from)
  const projectRoot = process.cwd();
  const projectConfigPath = join(projectRoot, "config.json");
  if (existsSync(projectConfigPath)) {
    return projectConfigPath;
  }
  // Fallback to relative to dist directory
  return join(__dirname, "..", "..", "config.json");
}

/**
 * Check if Cursor is installed (has .cursor/mcp.json configured)
 */
function isCursorInstalled(): boolean {
  const projectRoot = process.cwd();
  const cursorConfigPath = join(projectRoot, ".cursor", "mcp.json");
  if (!existsSync(cursorConfigPath)) {
    return false;
  }
  
  try {
    const config = JSON.parse(readFileSync(cursorConfigPath, "utf-8"));
    return config.mcpServers && config.mcpServers["hakuna"] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Install Cursor provider by creating/updating .cursor/mcp.json
 */
function installCursorProvider(): { success: boolean; error?: string } {
  try {
    const projectRoot = process.cwd();
    const cursorDir = join(projectRoot, ".cursor");
    const cursorConfigPath = join(cursorDir, "mcp.json");
    
    // Get the absolute path to the gateway executable
    const gatewayPath = join(__dirname, "..", "..", "dist", "index.js");
    
    let config: { mcpServers?: Record<string, unknown> } = {};
    if (existsSync(cursorConfigPath)) {
      try {
        config = JSON.parse(readFileSync(cursorConfigPath, "utf-8"));
      } catch {
        // If file exists but is invalid, we'll overwrite it
      }
    }
    
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    
    // Add or update the gateway configuration
    config.mcpServers["hakuna"] = {
      command: "node",
      args: [gatewayPath],
      cwd: join(__dirname, "..", ".."),
    };
    
    // Ensure .cursor directory exists
    if (!existsSync(cursorDir)) {
      mkdirSync(cursorDir, { recursive: true });
    }
    
    // Write the configuration
    writeFileSync(cursorConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Helper function to save config to database
 */
async function saveConfigToDb(
  updatedPolicyRules: PolicyRule[]
): Promise<void> {
  try {
    const { savePolicyRulesToDb } = await import("../db/services/configService.js");
    await savePolicyRulesToDb(updatedPolicyRules);
    // Clear cache so next request loads fresh config
    clearConfigCache();
  } catch (error) {
    logger.error("[API] Failed to save config to database:", error);
    throw error;
  }
}

/**
 * Get all providers
 * Providers are enterprise agent frameworks/platforms, not MCP servers
 */
async function getProviders(): Promise<Provider[]> {
  const providers: Provider[] = [
    {
      id: "cursor",
      name: "Cursor",
      type: "cursor",
      status: isCursorInstalled() ? "connected" : "pending",
      lastHeartbeat: isCursorInstalled() ? new Date().toISOString() : undefined,
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/cursor.svg",
      comingSoon: false,
    },
    {
      id: "n8n",
      name: "n8n",
      type: "n8n",
      status: "pending",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/n8n.svg",
      comingSoon: true,
    },
    {
      id: "openai",
      name: "OpenAI ChatGPT Enterprise",
      type: "openai",
      status: "pending",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg",
      comingSoon: true,
    },
    {
      id: "vertex_ai",
      name: "Google Vertex AI",
      type: "vertex",
      status: "pending",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/googlecloud.svg",
      comingSoon: true,
    },
    {
      id: "aws_bedrock",
      name: "AWS Bedrock",
      type: "bedrock",
      status: "pending",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/amazonaws.svg",
      comingSoon: true,
    },
    {
      id: "microsoft_copilot",
      name: "Microsoft Copilot",
      type: "copilot",
      status: "pending",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/microsoft.svg",
      comingSoon: true,
    },
    {
      id: "langchain",
      name: "LangChain",
      type: "langchain",
      status: "pending",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/langchain.svg",
      comingSoon: true,
    },
  ];
  
  return providers;
}

/**
 * Enable a tool by setting enabled: true in database
 */
async function enableTool(toolId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { getMcpServerProxiesFromDb, getToolsProxiesFromDb, saveMcpServerProxiesToDb, saveToolsProxiesToDb } = await import("../db/services/configService.js");
    const mcpProxies = await getMcpServerProxiesFromDb();
    const toolsProxies = await getToolsProxiesFromDb();
    
    // Check if it's an MCP tool (format: "mcpName:toolName")
    if (toolId.includes(":")) {
      const [mcpName, toolName] = toolId.split(":", 2);
      if (!mcpProxies[mcpName]) {
        return { success: false, error: `MCP server ${mcpName} not found` };
      }
      
      // For MCP tools, remove from disabledTools list if present
      const mcpConfig = mcpProxies[mcpName];
      if (mcpConfig.disabledTools) {
        mcpConfig.disabledTools = mcpConfig.disabledTools.filter(t => t !== toolName);
        // Remove the field if empty
        if (mcpConfig.disabledTools.length === 0) {
          delete mcpConfig.disabledTools;
        }
      }
      
      // Also ensure the MCP server is enabled
      mcpConfig.enabled = true;
      await saveMcpServerProxiesToDb(mcpProxies);
    } else {
      // Built-in or third-party tool
      if (toolsProxies[toolId]) {
        toolsProxies[toolId].enabled = true;
        await saveToolsProxiesToDb(toolsProxies);
      } else {
        return { success: false, error: `Tool ${toolId} not found` };
      }
    }
    
    clearConfigCache();
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Disable a tool by setting enabled: false in database
 * For MCP tools, adds the tool to the disabledTools list instead of disabling the entire MCP server
 */
async function disableTool(toolId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { getMcpServerProxiesFromDb, getToolsProxiesFromDb, saveMcpServerProxiesToDb, saveToolsProxiesToDb } = await import("../db/services/configService.js");
    const mcpProxies = await getMcpServerProxiesFromDb();
    const toolsProxies = await getToolsProxiesFromDb();
    
    // Check if it's an MCP tool (format: "mcpName:toolName")
    if (toolId.includes(":")) {
      const [mcpName, toolName] = toolId.split(":", 2);
      if (!mcpProxies[mcpName]) {
        return { success: false, error: `MCP server ${mcpName} not found` };
      }
      
      // For MCP tools, add to disabledTools list (don't disable the entire MCP server)
      const mcpConfig = mcpProxies[mcpName];
      if (!mcpConfig.disabledTools) {
        mcpConfig.disabledTools = [];
      }
      if (!mcpConfig.disabledTools.includes(toolName)) {
        mcpConfig.disabledTools.push(toolName);
      }
      await saveMcpServerProxiesToDb(mcpProxies);
    } else {
      // Built-in or third-party tool
      if (toolsProxies[toolId]) {
        toolsProxies[toolId].enabled = false;
        await saveToolsProxiesToDb(toolsProxies);
      } else {
        return { success: false, error: `Tool ${toolId} not found` };
      }
    }
    
    clearConfigCache();
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Enable an MCP server
 */
async function enableMcpServer(mcpId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { getMcpServerProxiesFromDb, saveMcpServerProxiesToDb } = await import("../db/services/configService.js");
    const mcpProxies = await getMcpServerProxiesFromDb();
    
    if (!mcpProxies[mcpId]) {
      return { success: false, error: `MCP server ${mcpId} not found` };
    }
    
    mcpProxies[mcpId].enabled = true;
    
    // Write back to database
    await saveMcpServerProxiesToDb(mcpProxies);
    clearConfigCache();
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Disable an MCP server
 */
async function disableMcpServer(mcpId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { getMcpServerProxiesFromDb, saveMcpServerProxiesToDb } = await import("../db/services/configService.js");
    const mcpProxies = await getMcpServerProxiesFromDb();
    
    if (!mcpProxies[mcpId]) {
      return { success: false, error: `MCP server ${mcpId} not found` };
    }
    
    mcpProxies[mcpId].enabled = false;
    
    // Write back to database
    await saveMcpServerProxiesToDb(mcpProxies);
    clearConfigCache();
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get MCP server details including configuration
 */
async function getMcpServerDetails(mcpId: string): Promise<{
  id: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  enabled?: boolean;
  icon?: string;
  defaultPolicy: {
    allowedRoles: string[];
    sensitivity: string;
  };
  toolPolicyOverrides?: Record<string, {
    allowedRoles?: string[];
    sensitivity?: string;
  }>;
  disabledTools?: string[];
} | null> {
  const mcpProxies = await getMcpServerProxies();
  const proxyConfig = mcpProxies[mcpId];
  
  if (!proxyConfig) {
    return null;
  }
  
  return {
    id: mcpId,
    name: proxyConfig.name,
    description: proxyConfig.description,
    command: proxyConfig.command,
    args: proxyConfig.args,
    env: proxyConfig.env,
    cwd: proxyConfig.cwd,
    enabled: proxyConfig.enabled,
    icon: proxyConfig.icon,
    defaultPolicy: {
      allowedRoles: proxyConfig.defaultPolicy.allowedRoles,
      sensitivity: proxyConfig.defaultPolicy.sensitivity,
    },
    toolPolicyOverrides: proxyConfig.toolPolicyOverrides,
    disabledTools: proxyConfig.disabledTools,
  };
}

/**
 * Get all tools (builtin, MCP, third-party) with pagination and filtering
 */
async function getTools(
  page: number = 1,
  limit: number = 50,
  searchQuery?: string
): Promise<{ data: Tool[]; total: number; page: number; limit: number; totalPages: number }> {
  const tools: Tool[] = [];
  
  // Get built-in tools
  const toolRegistry = await getToolRegistry();
  
  // Built-in tools
  for (const [category, categoryTools] of Object.entries(toolRegistry)) {
    for (const [toolName, toolConfig] of Object.entries(categoryTools)) {
      tools.push({
        id: toolName,
        name: toolName,
        source: category === "third_party" ? "third-party" : "builtin",
        category,
        riskLevel: toolConfig.sensitivity === "high" ? "high" : toolConfig.sensitivity === "medium" ? "medium" : "low",
        installed: toolConfig.enabled === true,
      });
    }
  }
  
  // Get MCP server proxies and discover their tools
  // Only connect to enabled servers to avoid slow page loads
  const mcpProxies = await getMcpServerProxies();
  for (const [proxyName, proxyConfig] of Object.entries(mcpProxies)) {
    // Skip disabled servers - just add them as placeholders without connecting
    if (proxyConfig.enabled !== true) {
      tools.push({
        id: `mcp-${proxyName}`,
        name: proxyName,
        source: "mcp",
        providerId: proxyName,
        category: "mcp",
        riskLevel: proxyConfig.defaultPolicy.sensitivity === "high" ? "high" : proxyConfig.defaultPolicy.sensitivity === "medium" ? "medium" : "low",
        installed: false,
      });
      continue;
    }
    
    // Only try to connect to enabled servers
    try {
      // Try to discover tools from the MCP server with timeout
      const { McpServerProxyManager } = await import("../tools/handlers/McpServerProxyHandler.js");
      const proxyManager = new McpServerProxyManager();
      
      try {
        // Add timeout to prevent hanging (5 seconds max per server)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Connection timeout")), 5000);
        });
        
        const discoveredTools = await Promise.race([
          proxyManager.connectAndDiscoverTools(proxyConfig),
          timeoutPromise,
        ]);
        
        // Add each discovered tool
        for (const tool of discoveredTools) {
          const toolPolicyOverride = proxyConfig.toolPolicyOverrides?.[tool.name];
          const sensitivity = toolPolicyOverride?.sensitivity || proxyConfig.defaultPolicy.sensitivity;
          
          // Check if tool is disabled
          const isToolDisabled = proxyConfig.disabledTools?.includes(tool.name) ?? false;
          const isInstalled = !isToolDisabled;
          
          tools.push({
            id: `${proxyName}:${tool.name}`,
            name: tool.name,
            source: "mcp",
            providerId: proxyName,
            category: "mcp", // MCP tools should not be in third_party category
            riskLevel: sensitivity === "high" ? "high" : sensitivity === "medium" ? "medium" : "low",
            installed: isInstalled,
          });
        }
        
        // Cleanup connection
        await proxyManager.cleanup();
      } catch (error) {
        // If we can't connect, just add the proxy as a placeholder
        logger.warn(`[API] Could not discover tools from MCP proxy ${proxyName}:`, error);
        tools.push({
          id: `mcp-${proxyName}`,
          name: proxyName,
          source: "mcp",
          providerId: proxyName,
          category: "mcp", // MCP servers should not be in third_party category
          riskLevel: proxyConfig.defaultPolicy.sensitivity === "high" ? "high" : proxyConfig.defaultPolicy.sensitivity === "medium" ? "medium" : "low",
          installed: true, // Server is enabled, just couldn't connect
        });
      }
    } catch (error) {
      logger.warn(`[API] Error loading MCP proxy ${proxyName}:`, error);
      // Add placeholder even if import fails
      tools.push({
        id: `mcp-${proxyName}`,
        name: proxyName,
        source: "mcp",
        providerId: proxyName,
        category: "mcp",
        riskLevel: proxyConfig.defaultPolicy.sensitivity === "high" ? "high" : proxyConfig.defaultPolicy.sensitivity === "medium" ? "medium" : "low",
        installed: true,
      });
    }
  }
  
  // Apply search filter if provided
  let filteredTools = tools;
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredTools = tools.filter((tool) =>
      tool.name.toLowerCase().includes(query) ||
      tool.category?.toLowerCase().includes(query) ||
      tool.providerId?.toLowerCase().includes(query)
    );
  }
  
  const total = filteredTools.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedTools = filteredTools.slice(startIndex, endIndex);
  
  return { data: paginatedTools, total, page, limit, totalPages };
}

/**
 * Infer policy scope from condition
 */
function inferScopeFromCondition(condition: PolicyRuleCondition): "tool" | "provider" | "agent" | "mcp" | "global" {
  // If toolName is specified, scope is "tool"
  if (condition.toolName !== undefined) {
    return "tool";
  }
  // If agentRole is specified (and no toolName), scope is "agent"
  if (condition.agentRole !== undefined) {
    return "agent";
  }
  // If providerId is specified, scope is "provider"
  if (condition.providerId !== undefined) {
    return "provider";
  }
  // If category is specified, it's still tool-level scope
  if (condition.category !== undefined) {
    return "tool";
  }
  // Otherwise, it's global
  return "global";
}

/**
 * Extract scope target from condition based on scope type
 */
function extractScopeTarget(condition: PolicyRuleCondition, scope: "tool" | "provider" | "agent" | "mcp" | "global"): string | undefined {
  if (scope === "tool" && condition.toolName) {
    return Array.isArray(condition.toolName) ? condition.toolName[0] : condition.toolName;
  }
  if (scope === "agent" && condition.agentRole) {
    return Array.isArray(condition.agentRole) ? condition.agentRole[0] : condition.agentRole;
  }
  if (scope === "provider" && condition.providerId) {
    return Array.isArray(condition.providerId) ? condition.providerId[0] : condition.providerId;
  }
  return undefined;
}

/**
 * Get all policies with pagination and filtering
 */
async function getPolicies(
  includeArchived: boolean = false,
  page: number = 1,
  limit: number = 50,
  filters?: {
    search?: string;
    scope?: string;
    effect?: string;
    enabled?: string;
    priority?: string;
  }
): Promise<{ data: Policy[]; total: number; page: number; limit: number; totalPages: number }> {
  const rules = await getPolicyRules();
  
  // Create a map of policy names to their original indices for stable IDs
  const nameToIndex = new Map<string, number>();
  rules.forEach((rule, idx) => {
    nameToIndex.set(rule.name, idx);
  });
  
  // Convert rules to Policy objects for filtering
  const allPolicies: Policy[] = rules.map((rule, idx): Policy => {
    const scope = inferScopeFromCondition(rule.condition);
    
    // Map action operation to Policy effect type
    let effect: Policy["effect"];
    if (rule.action.operation === "block") {
      effect = "deny";
    } else if (rule.action.operation === "allow") {
      effect = "allow";
    } else if (rule.action.operation === "log") {
      effect = "log";
    } else if (rule.action.operation === "custom") {
      effect = "custom";
    } else if (rule.action.operation === "webhook") {
      effect = "webhook";
    } else {
      effect = "allow"; // default fallback
    }
    
    return {
      id: `policy-${idx}`,
      name: rule.name,
      description: rule.description,
      scope,
      scopeTarget: extractScopeTarget(rule.condition, scope),
      effect,
      customCode: rule.action.operation === "custom" ? rule.action.customCode : undefined,
      priority: rule.priority ?? 0,
      enabled: !(rule.archived ?? false),
      archived: rule.archived ?? false,
    };
  });
  
  // Apply filters
  let filteredPolicies = allPolicies.filter((policy) => {
    // Filter archived policies based on includeArchived flag
    if (!includeArchived && policy.archived) {
      return false;
    }
    
    // Search filter
    if (filters?.search) {
      const query = filters.search.toLowerCase();
      const matchesSearch =
        policy.name.toLowerCase().includes(query) ||
        policy.description?.toLowerCase().includes(query) ||
        policy.scope.toLowerCase().includes(query) ||
        policy.effect.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    // Scope filter
    if (filters?.scope && filters.scope !== "all" && policy.scope !== filters.scope) {
      return false;
    }
    
    // Effect filter
    if (filters?.effect && filters.effect !== "all" && policy.effect !== filters.effect) {
      return false;
    }
    
    // Enabled filter
    if (filters?.enabled && filters.enabled !== "all") {
      const isEnabled = filters.enabled === "enabled";
      if (policy.enabled !== isEnabled) return false;
    }
    
    // Priority filter
    if (filters?.priority && filters.priority !== "all") {
      const priorityValue = parseInt(filters.priority, 10);
      if (!isNaN(priorityValue) && policy.priority !== priorityValue) {
        return false;
      }
    }
    
    return true;
  });
  
  const total = filteredPolicies.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedPolicies = filteredPolicies.slice(startIndex, endIndex);
  
  return { data: paginatedPolicies, total, page, limit, totalPages };
}

/**
 * Add a new policy rule
 * Accepts either PolicyRule (full) or Policy (simplified) format
 */
async function addPolicy(rule: Omit<PolicyRule, "name"> & { name?: string } | Partial<Policy> & { scopeTarget?: string }): Promise<Policy> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb();
  
  // Check if this is a Policy update (simplified) or PolicyRule update (full)
  const isPolicyFormat = "effect" in rule || "scope" in rule || "enabled" in rule;
  
  let newRule: PolicyRule;
  
  if (isPolicyFormat) {
    // Convert Policy format to PolicyRule
    const policyData = rule as Partial<Policy> & { scopeTarget?: string };
    const scope = policyData.scope || "global";
    const scopeTarget = policyData.scopeTarget;
    
    // Build condition based on scope
    const condition: PolicyRuleCondition = {};
    if (scope === "tool" && scopeTarget) {
      condition.toolName = scopeTarget;
    } else if (scope === "agent" && scopeTarget) {
      condition.agentRole = scopeTarget;
    } else if (scope === "provider" && scopeTarget) {
      // Provider scope - match tools called by specific provider/agent
      // For now, we can't directly match by provider in condition
      // Future: could add providerId field to condition or use other matching
      // For now, leave condition empty (would need backend enhancement)
    } else if (scope === "mcp" && scopeTarget) {
      // MCP scope - match tools from specific MCP server
      // MCP tools have providerId set to the MCP server name
      // Since condition doesn't support providerId matching directly,
      // we'll use a toolName pattern that matches tools from this MCP server
      // Note: This is a workaround - ideally we'd add providerId to condition
      // For now, we can't perfectly match MCP tools without backend changes
      // Leaving empty for now - would need to enhance condition matching
    }
    // For global scope, condition is empty (applies to all)
    
    // Build action from effect
    const effect = policyData.effect || "allow";
    const operationMap: Record<string, PolicyOperation> = {
      allow: "allow",
      deny: "block",
      log: "log",
      webhook: "webhook",
      custom: "custom",
    };
    
    const action: any = {
      operation: operationMap[effect] || "allow",
    };
    
    // Add customCode if effect is custom
    if (effect === "custom" && policyData.customCode) {
      action.customCode = policyData.customCode;
    }
    
    newRule = {
      name: policyData.name || `policy-${Date.now()}`,
      description: policyData.description,
      condition,
      action,
      priority: policyData.priority ?? 0,
      archived: policyData.enabled === false,
    };
  } else {
    // Full PolicyRule format
    const policyRule = rule as Omit<PolicyRule, "name"> & { name?: string };
    newRule = {
      name: policyRule.name || `policy-${Date.now()}`,
      description: policyRule.description,
      condition: policyRule.condition,
      action: policyRule.action,
      priority: policyRule.priority,
      stopOnMatch: policyRule.stopOnMatch,
    };
  }
  
  config.policyRules.push(newRule);
  
  // Write back to database
  await saveConfigToDb(config.policyRules);
  
  const scope = inferScopeFromCondition(newRule.condition);
  return {
    id: `policy-${config.policyRules.length - 1}`,
    name: newRule.name,
    description: newRule.description,
    scope,
    scopeTarget: extractScopeTarget(newRule.condition, scope),
    effect: newRule.action.operation === "block" ? "deny" : newRule.action.operation === "allow" ? "allow" : newRule.action.operation === "log" ? "log" : "webhook",
    priority: newRule.priority ?? 0,
    enabled: !(newRule.archived ?? false),
  };
}

/**
 * Update a policy rule
 * Accepts either PolicyRule updates or Policy updates (simplified)
 */
async function updatePolicy(id: string, updates: Partial<PolicyRule> | Partial<Policy>): Promise<Policy> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb();
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  const existingRule = config.policyRules[index];
  
  // Check if this is a Policy update (simplified) or PolicyRule update (full)
  const isPolicyUpdate = "effect" in updates || "scope" in updates || "enabled" in updates;
  
  let updatedRule: PolicyRule;
  
  if (isPolicyUpdate) {
    // Convert Policy update to PolicyRule update
    const policyUpdate = updates as Partial<Policy>;
    updatedRule = {
      ...existingRule,
      name: policyUpdate.name ?? existingRule.name,
      description: policyUpdate.description !== undefined ? policyUpdate.description : existingRule.description,
      priority: policyUpdate.priority !== undefined ? policyUpdate.priority : existingRule.priority,
      archived: policyUpdate.enabled === false ? true : policyUpdate.enabled === true ? false : existingRule.archived,
    };
    
    // Update action.operation if effect is provided
    if (policyUpdate.effect) {
      const operationMap: Record<string, PolicyOperation> = {
        allow: "allow",
        deny: "block",
        log: "log",
        webhook: "webhook",
        custom: "custom",
      };
      updatedRule.action = {
        ...existingRule.action,
        operation: operationMap[policyUpdate.effect] ?? existingRule.action.operation,
      };
      
      // Update customCode if effect is custom
      if (policyUpdate.effect === "custom") {
        if (policyUpdate.customCode !== undefined) {
          updatedRule.action.customCode = policyUpdate.customCode;
        }
      } else {
        // Remove customCode if effect is not custom
        delete updatedRule.action.customCode;
      }
    }
    
    // Update scope by modifying condition
    if (policyUpdate.scope) {
      const currentScope = inferScopeFromCondition(existingRule.condition);
      const newScope = policyUpdate.scope;
      const scopeTarget = (policyUpdate as any).scopeTarget;
      
      // Only update if scope actually changed or scopeTarget is provided
      if (currentScope !== newScope || scopeTarget) {
        const updatedCondition: PolicyRuleCondition = { ...existingRule.condition };
        
        // Remove scope-specific fields when changing scope
        if (newScope === "global") {
          // Remove tool/agent/provider-specific fields for global scope
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.agentRole;
          delete updatedCondition.providerId;
        } else if (newScope === "agent") {
          // For agent scope, remove tool/provider-specific but set agentRole
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.providerId;
          if (scopeTarget) {
            updatedCondition.agentRole = scopeTarget;
          } else if (!updatedCondition.agentRole) {
            // If no scopeTarget provided and no existing agentRole, keep existing or set empty
            // This preserves existing agentRole if it exists
          }
        } else if (newScope === "tool") {
          // For tool scope, remove agent/provider-specific but set toolName
          delete updatedCondition.agentRole;
          delete updatedCondition.providerId;
          if (scopeTarget) {
            updatedCondition.toolName = scopeTarget;
            // Remove category when specific tool is selected
            delete updatedCondition.category;
          } else if (!updatedCondition.toolName && !updatedCondition.category) {
            // If no scopeTarget and no existing tool/category, preserve what exists
          }
        } else if (newScope === "provider") {
          // Provider scope - match tools called by specific provider
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.agentRole;
          if (scopeTarget) {
            updatedCondition.providerId = scopeTarget;
          } else {
            // If no scopeTarget provided, clear providerId
            delete updatedCondition.providerId;
          }
        } else if (newScope === "mcp") {
          // MCP scope - match tools from specific MCP server
          // MCP tools have providerId set to the MCP server name
          // Since condition doesn't support providerId matching directly,
          // we'll need to enhance the condition structure or use workarounds
          // For now, clear other fields but can't set MCP-specific matching
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.agentRole;
          delete updatedCondition.providerId;
          // Note: MCP scope matching would require backend enhancement
          // to add providerId or mcpServer field to PolicyRuleCondition
        }
        
        updatedRule.condition = updatedCondition;
      }
    }
  } else {
    // Full PolicyRule update
    updatedRule = {
      ...existingRule,
      ...updates,
      name: (updates as Partial<PolicyRule>).name ?? existingRule.name,
      condition: (updates as Partial<PolicyRule>).condition ?? existingRule.condition,
      action: (updates as Partial<PolicyRule>).action ?? existingRule.action,
    };
  }
  
  config.policyRules[index] = updatedRule;
  
  // Write back to database
  await saveConfigToDb(config.policyRules);
  
  const scope = inferScopeFromCondition(updatedRule.condition);
  return {
    id,
    name: updatedRule.name,
    description: updatedRule.description,
    scope,
    scopeTarget: extractScopeTarget(updatedRule.condition, scope),
    effect: updatedRule.action.operation === "block" ? "deny" : updatedRule.action.operation === "allow" ? "allow" : updatedRule.action.operation === "log" ? "log" : "webhook",
    priority: updatedRule.priority ?? 0,
    enabled: !(updatedRule.archived ?? false),
  };
}

/**
 * Archive a policy rule (soft delete - can be restored)
 */
async function archivePolicy(id: string): Promise<void> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb();
  
  // Find policy by ID (which contains the original index)
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  // Mark as archived instead of deleting
  config.policyRules[index].archived = true;
  
  // Write back to database
  await saveConfigToDb(config.policyRules);
}

/**
 * Restore an archived policy rule
 */
async function restorePolicy(id: string): Promise<void> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb();
  
  // Find policy by ID (which contains the original index)
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  // Remove archived flag
  config.policyRules[index].archived = false;
  
  // Write back to database
  await saveConfigToDb(config.policyRules);
}

/**
 * Delete a policy rule (permanent deletion - use archivePolicy for soft delete)
 */
async function deletePolicy(id: string): Promise<void> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb();
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  config.policyRules.splice(index, 1);
  
  // Write back to database
  await saveConfigToDb(config.policyRules);
}

/**
 * Get events with optional search, filters, and pagination
 */
async function getEvents(
  searchQuery?: string,
  page: number = 1,
  limit: number = 50,
  filters?: {
    decisions?: string[];
    providers?: string[];
    agents?: string[];
    tools?: string[];
    riskLevels?: string[];
  }
): Promise<{ data: GatewayEvent[]; total: number; page: number; limit: number; totalPages: number }> {
  try {
    const { getEvents: getEventsFromDb, searchEvents, getEventsCount, searchEventsCount, getEventsWithFilters, getEventsWithFiltersCount } = await import("../db/services/eventService.js");
    
    let data: GatewayEvent[];
    let total: number;
    
    // Check if we have filters
    const hasFilters = filters && (
      (filters.decisions && filters.decisions.length > 0) ||
      (filters.providers && filters.providers.length > 0) ||
      (filters.agents && filters.agents.length > 0) ||
      (filters.tools && filters.tools.length > 0) ||
      (filters.riskLevels && filters.riskLevels.length > 0)
    );
    
    if (hasFilters || searchQuery) {
      // Use filtered/search function
      total = await getEventsWithFiltersCount(searchQuery, filters);
      data = await getEventsWithFilters(searchQuery, filters, limit, (page - 1) * limit);
    } else {
      // Get total count
      total = await getEventsCount();
      data = await getEventsFromDb(limit, (page - 1) * limit);
    }
    
    const totalPages = Math.ceil(total / limit);
    
    return { data, total, page, limit, totalPages };
  } catch (error) {
    // If database is not available, return empty array (fallback to file storage was removed)
    // In the future, we could add file-based fallback here if needed
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      logger.warn("[API] Database not available, returning empty events list");
      return { data: [], total: 0, page: 1, limit, totalPages: 0 };
    }
    logger.error("[API] Failed to get events from database:", error);
    return { data: [], total: 0, page: 1, limit, totalPages: 0 };
  }
}

/**
 * Parse request body
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response
 */
function sendJSON(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Handle API routes
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;
  
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    // Providers endpoints
    if (path === "/api/providers" && method === "GET") {
      const providers = await getProviders();
      sendJSON(res, 200, providers);
      return;
    }
    
    if (path.startsWith("/api/providers/") && path.endsWith("/install") && method === "POST") {
      const providerId = path.replace("/api/providers/", "").replace("/install", "");
      if (providerId === "cursor") {
        const result = installCursorProvider();
        if (result.success) {
          sendJSON(res, 200, { success: true });
        } else {
          sendJSON(res, 500, { error: result.error });
        }
      } else {
        sendJSON(res, 404, { error: `Provider ${providerId} not found` });
      }
      return;
    }
    
    // Tools endpoints
    if (path === "/api/tools" && method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const searchQuery = url.searchParams.get("q") || undefined;
      const tools = await getTools(page, limit, searchQuery);
      sendJSON(res, 200, tools);
      return;
    }
    
    // Enable/disable tool
    if (path.startsWith("/api/tools/") && method === "POST") {
      const pathAfterPrefix = path.replace("/api/tools/", "");
      if (pathAfterPrefix.endsWith("/enable")) {
        const toolId = pathAfterPrefix.replace("/enable", "");
        if (toolId) {
          const result = await enableTool(toolId);
          if (result.success) {
            sendJSON(res, 200, { success: true });
          } else {
            sendJSON(res, 500, { error: result.error });
          }
          return;
        }
      } else if (pathAfterPrefix.endsWith("/disable")) {
        const toolId = pathAfterPrefix.replace("/disable", "");
        if (toolId) {
          const result = await disableTool(toolId);
          if (result.success) {
            sendJSON(res, 200, { success: true });
          } else {
            sendJSON(res, 500, { error: result.error });
          }
          return;
        }
      }
    }
    
    // MCP server endpoints (enable/disable must come before GET)
    if (path.startsWith("/api/mcp/") && method === "POST") {
      const pathAfterPrefix = path.replace("/api/mcp/", "");
      if (pathAfterPrefix.endsWith("/enable")) {
        const mcpId = pathAfterPrefix.replace("/enable", "");
        if (mcpId) {
          const result = await enableMcpServer(mcpId);
          if (result.success) {
            sendJSON(res, 200, { success: true });
          } else {
            sendJSON(res, 500, { error: result.error });
          }
          return;
        }
      } else if (pathAfterPrefix.endsWith("/disable")) {
        const mcpId = pathAfterPrefix.replace("/disable", "");
        if (mcpId) {
          const result = await disableMcpServer(mcpId);
          if (result.success) {
            sendJSON(res, 200, { success: true });
          } else {
            sendJSON(res, 500, { error: result.error });
          }
          return;
        }
      }
    }
    
    // Get MCP server details (must come after enable/disable routes)
    if (path.startsWith("/api/mcp/") && method === "GET") {
      // Extract mcpId by removing the prefix
      const pathAfterPrefix = path.replace("/api/mcp/", "");
      // Make sure it's not an enable/disable endpoint and has content
      if (pathAfterPrefix && !pathAfterPrefix.endsWith("/enable") && !pathAfterPrefix.endsWith("/disable")) {
        // Remove any trailing slashes
        const mcpId = pathAfterPrefix.replace(/\/+$/, "");
        if (mcpId) {
          const mcpDetails = await getMcpServerDetails(mcpId);
          if (mcpDetails) {
            sendJSON(res, 200, mcpDetails);
          } else {
            sendJSON(res, 404, { error: `MCP server ${mcpId} not found` });
          }
          return;
        }
      }
      // If we get here, the path didn't match - return 404
      sendJSON(res, 404, { error: "MCP server endpoint not found" });
      return;
    }
    
    // Policies endpoints
    if (path === "/api/policies" && method === "GET") {
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const filters = {
        search: url.searchParams.get("q") || undefined,
        scope: url.searchParams.get("scope") || undefined,
        effect: url.searchParams.get("effect") || undefined,
        enabled: url.searchParams.get("status") || undefined,
        priority: url.searchParams.get("priority") || undefined,
      };
      const policies = await getPolicies(includeArchived, page, limit, filters);
      sendJSON(res, 200, policies);
      return;
    }
    
    // Get single policy with full details (including condition)
    // This must come before archive/restore routes
    if (path.startsWith("/api/policies/") && method === "GET") {
      const id = path.replace("/api/policies/", "");
      // Skip if it's an archive/restore endpoint (those are POST)
      if (id.includes("/archive") || id.includes("/restore")) {
        // Not a GET request for these endpoints, continue
      } else {
        const rules = await getPolicyRules();
        const index = parseInt(id.replace("policy-", ""), 10);
        if (isNaN(index) || index < 0 || index >= rules.length) {
          sendJSON(res, 404, { error: "Policy not found" });
          return;
        }
        const rule = rules[index];
        const scope = inferScopeFromCondition(rule.condition);
        // Return both the simplified Policy and the full PolicyRule
        const policy = {
          id,
          name: rule.name,
          description: rule.description,
          scope,
          scopeTarget: extractScopeTarget(rule.condition, scope),
          effect: rule.action.operation === "block" ? "deny" : rule.action.operation === "allow" ? "allow" : rule.action.operation === "log" ? "log" : rule.action.operation === "custom" ? "custom" : "webhook",
          customCode: rule.action.operation === "custom" ? rule.action.customCode : undefined,
          priority: rule.priority ?? 0,
          enabled: !(rule.archived ?? false),
          archived: rule.archived ?? false,
          condition: rule.condition, // Include full condition
        };
        sendJSON(res, 200, policy);
        return;
      }
    }
    
    if (path === "/api/policies" && method === "POST") {
      const body = await parseBody(req) as Partial<PolicyRule> | Partial<Policy> & { scopeTarget?: string };
      // Check if it's Policy format (simplified) or PolicyRule format (full)
      const isPolicyFormat = "effect" in body || "scope" in body || "enabled" in body;
      
      if (isPolicyFormat) {
        // Policy format - validate required fields
        const policyData = body as Partial<Policy> & { scopeTarget?: string };
        if (!policyData.name) {
          sendJSON(res, 400, { error: "Missing required field: name" });
          return;
        }
        if (!policyData.scope || policyData.scope === "global" || policyData.scopeTarget) {
          // Valid - either global scope or scope with target provided
        }
      } else {
        // PolicyRule format - ensure required fields are present
        const policyRule = body as Partial<PolicyRule>;
        if (!policyRule.condition || !policyRule.action) {
          sendJSON(res, 400, { error: "Missing required fields: condition and action" });
          return;
        }
      }
      
      const policy = await addPolicy(body);
      sendJSON(res, 201, policy);
      return;
    }
    
    // Check archive/restore routes BEFORE general PUT/DELETE routes (more specific first)
    if (method === "POST" && path.startsWith("/api/policies/") && path.endsWith("/archive")) {
      const id = path.replace("/api/policies/", "").replace("/archive", "");
      await archivePolicy(id);
      sendJSON(res, 200, { success: true });
      return;
    }
    
    if (method === "POST" && path.startsWith("/api/policies/") && path.endsWith("/restore")) {
      const id = path.replace("/api/policies/", "").replace("/restore", "");
      await restorePolicy(id);
      sendJSON(res, 200, { success: true });
      return;
    }
    
    if (path.startsWith("/api/policies/") && method === "PUT") {
      const id = path.replace("/api/policies/", "");
      const body = await parseBody(req) as Partial<PolicyRule> | Partial<Policy>;
      // Allow both PolicyRule and Policy updates
      // PolicyRule updates require condition and action, but Policy updates don't
      const isPolicyRuleUpdate = "condition" in body || "action" in body;
      if (isPolicyRuleUpdate && (!body.condition || !body.action)) {
        sendJSON(res, 400, { error: "Missing required fields: condition and action" });
        return;
      }
      const policy = await updatePolicy(id, body);
      sendJSON(res, 200, policy);
      return;
    }
    
    if (path.startsWith("/api/policies/") && method === "DELETE") {
      const id = path.replace("/api/policies/", "");
      await deletePolicy(id);
      sendJSON(res, 204, {});
      return;
    }
    
    // Events endpoints
    if (path === "/api/events" && method === "GET") {
      // Check if requesting filter options
      if (url.searchParams.get("filterOptions") === "true") {
        const { getEventFilterOptions } = await import("../db/services/eventService.js");
        const filterOptions = await getEventFilterOptions();
        sendJSON(res, 200, filterOptions);
        return;
      }
      
      const searchQuery = url.searchParams.get("q") || undefined;
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const filters = {
        decisions: url.searchParams.get("decision")?.split(",").filter(Boolean),
        providers: url.searchParams.get("provider") ? [url.searchParams.get("provider")!] : undefined,
        agents: url.searchParams.get("agent") ? [url.searchParams.get("agent")!] : undefined,
        tools: url.searchParams.get("tool") ? [url.searchParams.get("tool")!] : undefined,
        riskLevels: url.searchParams.get("risk")?.split(",").filter(Boolean),
      };
      const events = await getEvents(searchQuery, page, limit, filters);
      sendJSON(res, 200, events);
      return;
    }
    
    // 404
    sendJSON(res, 404, { error: "Not found" });
  } catch (error) {
    logger.error("[API] Error handling request:", error);
    sendJSON(res, 500, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * Start the HTTP server
 */
export function startApiServer(): void {
  const server = createServer(handleRequest);
  
  server.listen(PORT, () => {
    logger.info(`[API] Gateway API server listening on http://localhost:${PORT}`);
  });
  
  server.on("error", (error) => {
    logger.error("[API] Server error:", error);
  });
}
