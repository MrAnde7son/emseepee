import { AsyncLocalStorage } from "async_hooks";
import type { AgentContext } from "./handlers/BaseGatewayHandler.js";

/**
 * AsyncLocalStorage for storing agent context per request
 * This allows tools to access the current request's agent context
 * without needing to pass it through every function call
 */
const agentContextStorage = new AsyncLocalStorage<AgentContext>();

/**
 * Run a function with agent context stored in AsyncLocalStorage
 */
export function runWithAgentContext<T>(context: AgentContext, fn: () => T): T {
  return agentContextStorage.run(context, fn);
}

/**
 * Run an async function with agent context stored in AsyncLocalStorage
 */
export async function runWithAgentContextAsync<T>(
  context: AgentContext,
  fn: () => Promise<T>
): Promise<T> {
  return agentContextStorage.run(context, fn);
}

/**
 * Get the current agent context from AsyncLocalStorage
 * Returns undefined if no context is set (e.g., during startup/registration)
 */
export function getAgentContext(): AgentContext | undefined {
  return agentContextStorage.getStore();
}

/**
 * Create agent context from auth object
 */
export function createAgentContextFromAuth(auth: {
  userId: number;
  email: string;
  role: string;
  tenantId?: string | null;
}): AgentContext {
  return {
    agentId: `user-${auth.userId}`,
    agentRole: auth.role,
    env: process.env.AGENT_ENV || "dev",
    tenantId: auth.tenantId || undefined,
  };
}

