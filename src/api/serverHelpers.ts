// Helper functions extracted from server.ts for use by route handlers
// These maintain backward compatibility while allowing better organization

import { getPolicyRules, clearConfigCache } from "../config.js";
import type { PolicyRule, PolicyRuleCondition, PolicyOperation } from "../config.js";
import { logger } from "../logger.js";
import type { Policy } from "./types.js";

export async function saveConfigToDb(updatedPolicyRules: PolicyRule[], tenantId?: string): Promise<void> {
  try {
    const { savePolicyRulesToDb } = await import("../db/services/configService.js");
    await savePolicyRulesToDb(updatedPolicyRules, tenantId);
    clearConfigCache();
  } catch (error) {
    logger.error("[API] Failed to save config to database:", error);
    throw error;
  }
}

export function inferScopeFromCondition(condition: PolicyRuleCondition): "tool" | "provider" | "agent" | "mcp" | "sensitivity" | "global" {
  if (condition.toolName !== undefined) {
    return "tool";
  }
  if (condition.agentRole !== undefined) {
    return "agent";
  }
  if (condition.providerId !== undefined) {
    return "provider";
  }
  if (condition.sensitivity !== undefined && 
      condition.toolName === undefined && 
      condition.agentRole === undefined && 
      condition.providerId === undefined) {
    return "sensitivity";
  }
  if (condition.category !== undefined) {
    return "tool";
  }
  return "global";
}

export function extractScopeTarget(condition: PolicyRuleCondition, scope: "tool" | "provider" | "agent" | "mcp" | "sensitivity" | "global"): string | undefined {
  if (scope === "tool" && condition.toolName) {
    return Array.isArray(condition.toolName) ? condition.toolName[0] : condition.toolName;
  }
  if (scope === "agent" && condition.agentRole) {
    return Array.isArray(condition.agentRole) ? condition.agentRole[0] : condition.agentRole;
  }
  if (scope === "provider" && condition.providerId) {
    return Array.isArray(condition.providerId) ? condition.providerId[0] : condition.providerId;
  }
  if (scope === "sensitivity" && condition.sensitivity) {
    return Array.isArray(condition.sensitivity) ? condition.sensitivity[0] : condition.sensitivity;
  }
  return undefined;
}

export async function getPolicies(
  archived: boolean = false,
  page: number = 1,
  limit: number = 50,
  filters?: {
    search?: string;
    scope?: string;
    effect?: string;
    enabled?: string;
    priority?: string;
  },
  tenantId?: string
): Promise<{ data: Policy[]; total: number; page: number; limit: number; totalPages: number }> {
  const rules = await getPolicyRules(tenantId);
  
  const allPolicies: Policy[] = rules.map((rule, idx): Policy => {
    const scope = inferScopeFromCondition(rule.condition);
    
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
      effect = "allow";
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
  
  let filteredPolicies = allPolicies.filter((policy) => {
    if (archived !== policy.archived) {
      return false;
    }
    
    if (filters?.search) {
      const query = filters.search.toLowerCase();
      const matchesSearch =
        policy.name.toLowerCase().includes(query) ||
        policy.description?.toLowerCase().includes(query) ||
        policy.scope.toLowerCase().includes(query) ||
        policy.effect.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }
    
    if (filters?.scope && filters.scope !== "all" && policy.scope !== filters.scope) {
      return false;
    }
    
    if (filters?.effect && filters.effect !== "all" && policy.effect !== filters.effect) {
      return false;
    }
    
    if (filters?.enabled && filters.enabled !== "all") {
      const isEnabled = filters.enabled === "enabled";
      if (policy.enabled !== isEnabled) return false;
    }
    
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

export async function addPolicy(
  rule: Omit<PolicyRule, "name"> & { name?: string } | Partial<Policy> & { scopeTarget?: string },
  tenantId?: string
): Promise<Policy> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb(tenantId);
  
  const isPolicyFormat = "effect" in rule || "scope" in rule || "enabled" in rule;
  
  let newRule: PolicyRule;
  
  if (isPolicyFormat) {
    const policyData = rule as Partial<Policy> & { scopeTarget?: string };
    const scope = policyData.scope || "global";
    const scopeTarget = policyData.scopeTarget;
    
    const condition: PolicyRuleCondition = {};
    if (scope === "tool" && scopeTarget) {
      condition.toolName = scopeTarget;
    } else if (scope === "agent" && scopeTarget) {
      condition.agentRole = scopeTarget;
    } else if (scope === "sensitivity" && scopeTarget) {
      condition.sensitivity = scopeTarget as "low" | "medium" | "high";
    }
    
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
  await saveConfigToDb(config.policyRules, tenantId);
  
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

export async function updatePolicy(id: string, updates: Partial<PolicyRule> | Partial<Policy>, tenantId?: string): Promise<Policy> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb(tenantId);
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  const existingRule = config.policyRules[index];
  const isPolicyUpdate = "effect" in updates || "scope" in updates || "enabled" in updates;
  
  let updatedRule: PolicyRule;
  
  if (isPolicyUpdate) {
    const policyUpdate = updates as Partial<Policy>;
    updatedRule = {
      ...existingRule,
      name: policyUpdate.name ?? existingRule.name,
      description: policyUpdate.description !== undefined ? policyUpdate.description : existingRule.description,
      priority: policyUpdate.priority !== undefined ? policyUpdate.priority : existingRule.priority,
      archived: policyUpdate.enabled === false ? true : policyUpdate.enabled === true ? false : existingRule.archived,
    };
    
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
      
      if (policyUpdate.effect === "custom") {
        if (policyUpdate.customCode !== undefined) {
          updatedRule.action.customCode = policyUpdate.customCode;
        }
      } else {
        delete updatedRule.action.customCode;
      }
    }
    
    if (policyUpdate.scope) {
      const currentScope = inferScopeFromCondition(existingRule.condition);
      const newScope = policyUpdate.scope;
      const scopeTarget = (policyUpdate as any).scopeTarget;
      
      if (currentScope !== newScope || scopeTarget) {
        const updatedCondition: PolicyRuleCondition = { ...existingRule.condition };
        
        if (newScope === "global") {
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.agentRole;
          delete updatedCondition.providerId;
          delete updatedCondition.sensitivity;
        } else if (newScope === "sensitivity") {
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.agentRole;
          delete updatedCondition.providerId;
          if (scopeTarget) {
            updatedCondition.sensitivity = scopeTarget as "low" | "medium" | "high";
          }
        } else if (newScope === "agent") {
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.providerId;
          if (scopeTarget) {
            updatedCondition.agentRole = scopeTarget;
          }
        } else if (newScope === "tool") {
          delete updatedCondition.agentRole;
          delete updatedCondition.providerId;
          if (scopeTarget) {
            updatedCondition.toolName = scopeTarget;
            delete updatedCondition.category;
          }
        } else if (newScope === "provider") {
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.agentRole;
          if (scopeTarget) {
            updatedCondition.providerId = scopeTarget;
          } else {
            delete updatedCondition.providerId;
          }
        } else if (newScope === "mcp") {
          delete updatedCondition.toolName;
          delete updatedCondition.category;
          delete updatedCondition.agentRole;
          delete updatedCondition.providerId;
        }
        
        updatedRule.condition = updatedCondition;
      }
    }
  } else {
    const policyRuleUpdates = updates as Partial<PolicyRule>;
    updatedRule = {
      ...existingRule,
      ...updates,
      name: policyRuleUpdates.name ?? existingRule.name,
      condition: policyRuleUpdates.condition ?? existingRule.condition,
      action: policyRuleUpdates.action ? { ...existingRule.action, ...policyRuleUpdates.action } : existingRule.action,
      stopOnMatch: policyRuleUpdates.stopOnMatch !== undefined ? policyRuleUpdates.stopOnMatch : existingRule.stopOnMatch,
    };
  }
  
  config.policyRules[index] = updatedRule;
  await saveConfigToDb(config.policyRules, tenantId);
  
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

export async function archivePolicy(id: string, tenantId?: string): Promise<void> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb(tenantId);
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  config.policyRules[index].archived = true;
  await saveConfigToDb(config.policyRules, tenantId);
}

export async function restorePolicy(id: string, tenantId?: string): Promise<void> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb(tenantId);
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  config.policyRules[index].archived = false;
  await saveConfigToDb(config.policyRules, tenantId);
}

export async function deletePolicy(id: string, tenantId?: string): Promise<void> {
  const { getAllConfigFromDb } = await import("../db/services/configService.js");
  const config = await getAllConfigFromDb(tenantId);
  
  const index = parseInt(id.replace("policy-", ""), 10);
  if (isNaN(index) || index < 0 || index >= config.policyRules.length) {
    throw new Error(`Policy not found: ${id}`);
  }
  
  config.policyRules.splice(index, 1);
  await saveConfigToDb(config.policyRules, tenantId);
}

export async function getEvents(
  searchQuery?: string,
  page: number = 1,
  limit: number = 50,
  filters?: {
    decisions?: string[];
    providers?: string[];
    agents?: string[];
    tools?: string[];
    riskLevels?: string[];
  },
  tenantId?: string
): Promise<{ data: import("./types.js").GatewayEvent[]; total: number; page: number; limit: number; totalPages: number }> {
  try {
    const { getEvents: getEventsFromDb, getEventsCount, getEventsWithFilters, getEventsWithFiltersCount } = await import("../db/services/eventService.js");
    
    let data: import("./types.js").GatewayEvent[];
    let total: number;
    
    const hasFilters = filters && (
      (filters.decisions && filters.decisions.length > 0) ||
      (filters.providers && filters.providers.length > 0) ||
      (filters.agents && filters.agents.length > 0) ||
      (filters.tools && filters.tools.length > 0) ||
      (filters.riskLevels && filters.riskLevels.length > 0)
    );
    
    if (hasFilters || searchQuery) {
      total = await getEventsWithFiltersCount(searchQuery, filters, tenantId);
      data = await getEventsWithFilters(searchQuery, filters, limit, (page - 1) * limit, tenantId);
    } else {
      total = await getEventsCount(tenantId);
      data = await getEventsFromDb(limit, (page - 1) * limit, tenantId);
    }
    
    const totalPages = Math.ceil(total / limit);
    
    return { data, total, page, limit, totalPages };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Database not initialized")) {
      logger.warn("[API] Database not available, returning empty events list");
      return { data: [], total: 0, page: 1, limit, totalPages: 0 };
    }
    logger.error("[API] Failed to get events from database:", error);
    return { data: [], total: 0, page: 1, limit, totalPages: 0 };
  }
}

