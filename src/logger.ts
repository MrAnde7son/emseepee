/**
 * Logger utility for MCP servers.
 * All logging goes to stderr to avoid interfering with stdout (MCP protocol).
 */

export const logger = {
  info: (...args: unknown[]) => {
    console.error("[INFO]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.error("[WARN]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[ERROR]", ...args);
  },
};

