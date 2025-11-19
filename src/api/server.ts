import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { getStoredEvents, logger } from "../logger.js";
import { getToolRegistry, getMcpServerProxies } from "../config.js";
import { getPolicyRules } from "../config.js";
import { loadConfigFromFile } from "../configLoader.js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PolicyRule } from "../config.js";
// Types matching dashboard types
type ProviderType = "cursor" | "n8n" | "openai" | "vertex" | "custom";

interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  status: "connected" | "error" | "pending";
  lastHeartbeat?: string;
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
  scope: "tool" | "provider" | "agent" | "global";
  effect: "allow" | "deny" | "log" | "webhook";
  priority: number;
  enabled: boolean;
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
 * Get all providers
 */
async function getProviders(): Promise<Provider[]> {
  const providers: Provider[] = [
    {
      id: "cursor",
      name: "Cursor",
      type: "cursor",
      status: isCursorInstalled() ? "connected" : "pending",
      lastHeartbeat: isCursorInstalled() ? new Date().toISOString() : undefined,
    },
  ];
  
  return providers;
}

/**
 * Get all tools (builtin, MCP, third-party)
 */
async function getTools(): Promise<Tool[]> {
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
        installed: true,
      });
    }
  }
  
  // Get MCP server proxies and discover their tools
  const mcpProxies = await getMcpServerProxies();
  for (const [proxyName, proxyConfig] of Object.entries(mcpProxies)) {
    try {
      // Try to discover tools from the MCP server
      const { McpServerProxyManager } = await import("../tools/handlers/McpServerProxyHandler.js");
      const proxyManager = new McpServerProxyManager();
      
      try {
        const discoveredTools = await proxyManager.connectAndDiscoverTools(proxyConfig);
        
        // Add each discovered tool
        for (const tool of discoveredTools) {
          const toolPolicyOverride = proxyConfig.toolPolicyOverrides?.[tool.name];
          const sensitivity = toolPolicyOverride?.sensitivity || proxyConfig.defaultPolicy.sensitivity;
          
          tools.push({
            id: `${proxyName}:${tool.name}`,
            name: tool.name,
            source: "mcp",
            providerId: proxyName,
            category: "third_party",
            riskLevel: sensitivity === "high" ? "high" : sensitivity === "medium" ? "medium" : "low",
            installed: true,
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
          category: "third_party",
          riskLevel: proxyConfig.defaultPolicy.sensitivity === "high" ? "high" : proxyConfig.defaultPolicy.sensitivity === "medium" ? "medium" : "low",
          installed: false,
        });
      }
    } catch (error) {
      logger.warn(`[API] Error loading MCP proxy ${proxyName}:`, error);
    }
  }
  
  return tools;
}

/**
 * Get all policies
 */
async function getPolicies(): Promise<Policy[]> {
  const rules = await getPolicyRules();
  
  return rules.map((rule, index) => ({
    id: `policy-${index}`,
    name: rule.name,
    description: rule.description,
    scope: "global", // Could be enhanced to detect scope from condition
    effect: rule.action.operation === "block" ? "deny" : rule.action.operation === "allow" ? "allow" : rule.action.operation === "log" ? "log" : "webhook",
    priority: rule.priority ?? 0,
    enabled: true, // Policies are always enabled if they exist
  }));
}

/**
 * Add a new policy rule
 */
async function addPolicy(rule: Omit<PolicyRule, "name"> & { name?: string }): Promise<Policy> {
  const configPath = getConfigPath();
  const config = loadConfigFromFile(configPath);
  
  const newRule: PolicyRule = {
    name: rule.name || `policy-${Date.now()}`,
    description: rule.description,
    condition: rule.condition,
    action: rule.action,
    priority: rule.priority,
    stopOnMatch: rule.stopOnMatch,
  };
  
  config.policyRules.push(newRule);
  
  // Write back to config file
  const fullConfig = {
    mcpServerProxies: config.mcpServerProxies,
    toolsProxies: {}, // We don't modify tools here
    policyRules: config.policyRules,
  };
  
  // Read existing config to preserve toolsProxies
  try {
    const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    fullConfig.toolsProxies = existingConfig.toolsProxies || {};
    fullConfig.mcpServerProxies = existingConfig.mcpServerProxies || {};
  } catch {
    // If config doesn't exist or is invalid, use defaults
  }
  
  writeFileSync(configPath, JSON.stringify(fullConfig, null, 2) + "\n", "utf-8");
  
  return {
    id: `policy-${config.policyRules.length - 1}`,
    name: newRule.name,
    description: newRule.description,
    scope: "global",
    effect: newRule.action.operation === "block" ? "deny" : newRule.action.operation === "allow" ? "allow" : newRule.action.operation === "log" ? "log" : "webhook",
    priority: newRule.priority ?? 0,
    enabled: true,
  };
}

/**
 * Update a policy rule
 */
async function updatePolicy(id: string, updates: Partial<PolicyRule>): Promise<Policy> {
  const configPath = getConfigPath();
  const config = loadConfigFromFile(configPath);
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  const existingRule = config.policyRules[index];
  const updatedRule: PolicyRule = {
    ...existingRule,
    ...updates,
    name: updates.name ?? existingRule.name,
  };
  
  config.policyRules[index] = updatedRule;
  
  // Write back to config file
  const fullConfig = {
    mcpServerProxies: config.mcpServerProxies,
    toolsProxies: {},
    policyRules: config.policyRules,
  };
  
  // Read existing config to preserve toolsProxies
  try {
    const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    fullConfig.toolsProxies = existingConfig.toolsProxies || {};
    fullConfig.mcpServerProxies = existingConfig.mcpServerProxies || {};
  } catch {
    // If config doesn't exist or is invalid, use defaults
  }
  
  writeFileSync(configPath, JSON.stringify(fullConfig, null, 2) + "\n", "utf-8");
  
  return {
    id,
    name: updatedRule.name,
    description: updatedRule.description,
    scope: "global",
    effect: updatedRule.action.operation === "block" ? "deny" : updatedRule.action.operation === "allow" ? "allow" : updatedRule.action.operation === "log" ? "log" : "webhook",
    priority: updatedRule.priority ?? 0,
    enabled: true,
  };
}

/**
 * Delete a policy rule
 */
async function deletePolicy(id: string): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfigFromFile(configPath);
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  config.policyRules.splice(index, 1);
  
  // Write back to config file
  const fullConfig = {
    mcpServerProxies: config.mcpServerProxies,
    toolsProxies: {},
    policyRules: config.policyRules,
  };
  
  // Read existing config to preserve toolsProxies
  try {
    const existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    fullConfig.toolsProxies = existingConfig.toolsProxies || {};
    fullConfig.mcpServerProxies = existingConfig.mcpServerProxies || {};
  } catch {
    // If config doesn't exist or is invalid, use defaults
  }
  
  writeFileSync(configPath, JSON.stringify(fullConfig, null, 2) + "\n", "utf-8");
}

/**
 * Get events with optional search
 */
function getEvents(searchQuery?: string): GatewayEvent[] {
  const events = getStoredEvents();
  
  if (!searchQuery) {
    return events;
  }
  
  const query = searchQuery.toLowerCase();
  return events.filter((event) => {
    return (
      event.agentId.toLowerCase().includes(query) ||
      event.provider.toLowerCase().includes(query) ||
      event.toolName.toLowerCase().includes(query) ||
      event.intentSummary.toLowerCase().includes(query) ||
      event.decision.toLowerCase().includes(query)
    );
  });
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
      const tools = await getTools();
      sendJSON(res, 200, tools);
      return;
    }
    
    // Policies endpoints
    if (path === "/api/policies" && method === "GET") {
      const policies = await getPolicies();
      sendJSON(res, 200, policies);
      return;
    }
    
    if (path === "/api/policies" && method === "POST") {
      const body = await parseBody(req) as Partial<PolicyRule>;
      // Ensure required fields are present
      if (!body.condition || !body.action) {
        sendJSON(res, 400, { error: "Missing required fields: condition and action" });
        return;
      }
      const policy = await addPolicy(body as Omit<PolicyRule, "name"> & { name?: string });
      sendJSON(res, 201, policy);
      return;
    }
    
    if (path.startsWith("/api/policies/") && method === "PUT") {
      const id = path.replace("/api/policies/", "");
      const body = await parseBody(req) as Partial<PolicyRule>;
      // Ensure required fields are present
      if (!body.condition || !body.action) {
        sendJSON(res, 400, { error: "Missing required fields: condition and action" });
        return;
      }
      const policy = await updatePolicy(id, body as Omit<PolicyRule, "name"> & { name?: string });
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
      const searchQuery = url.searchParams.get("q") || undefined;
      const events = getEvents(searchQuery);
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
