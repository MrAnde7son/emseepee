/**
 * Registry for MCP tools registered with the server
 * Used to expose tools over HTTP when Cursor connects via HTTP
 */
interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: Record<string, unknown>) => Promise<any>;
}

const toolRegistry = new Map<string, RegisteredTool>();

export function registerTool(
  name: string,
  description: string,
  inputSchema: unknown,
  handler: (args: Record<string, unknown>) => Promise<any>
): void {
  toolRegistry.set(name, { name, description, inputSchema, handler });
}

export function getTool(name: string): RegisteredTool | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(): RegisteredTool[] {
  return Array.from(toolRegistry.values());
}

export function clearRegistry(): void {
  toolRegistry.clear();
}

