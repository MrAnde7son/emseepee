import { logger } from "../logger.js";
import type { McpServerProxyConfig } from "../config.js";

/**
 * Cached tool information from an MCP server proxy
 */
export interface CachedTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * Cache entry for an MCP server proxy
 */
interface CacheEntry {
  tools: CachedTool[];
  timestamp: number;
  proxyConfig: McpServerProxyConfig;
}

/**
 * Tool cache for MCP server proxies
 * Stores discovered tools per proxy to avoid re-fetching on every request
 * Cache is tenant-aware
 */
class ToolCache {
  // Map: tenantId -> proxyName -> CacheEntry
  private cache: Map<string, Map<string, CacheEntry>> = new Map();
  
  // Cache TTL: 24 hours (tools don't change frequently)
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  /**
   * Get cache key for tenant
   */
  private getTenantKey(tenantId?: string): string {
    return tenantId || "default";
  }

  /**
   * Store discovered tools for a proxy
   */
  setTools(
    proxyName: string,
    tools: CachedTool[],
    proxyConfig: McpServerProxyConfig,
    tenantId?: string
  ): void {
    const tenantKey = this.getTenantKey(tenantId);
    
    if (!this.cache.has(tenantKey)) {
      this.cache.set(tenantKey, new Map());
    }
    
    const tenantCache = this.cache.get(tenantKey)!;
    tenantCache.set(proxyName, {
      tools,
      timestamp: Date.now(),
      proxyConfig,
    });
    
    logger.info(
      `[TOOL-CACHE] Cached ${tools.length} tools for proxy ${proxyName} (tenant: ${tenantKey})`
    );
  }

  /**
   * Get cached tools for a proxy
   * Returns undefined if not cached or cache expired
   */
  getTools(
    proxyName: string,
    tenantId?: string
  ): CachedTool[] | undefined {
    const tenantKey = this.getTenantKey(tenantId);
    const tenantCache = this.cache.get(tenantKey);
    
    if (!tenantCache) {
      return undefined;
    }
    
    const entry = tenantCache.get(proxyName);
    if (!entry) {
      return undefined;
    }
    
    // Check if cache expired
    const age = Date.now() - entry.timestamp;
    if (age > this.CACHE_TTL_MS) {
      logger.info(
        `[TOOL-CACHE] Cache expired for proxy ${proxyName} (age: ${Math.round(age / 1000)}s, TTL: ${Math.round(this.CACHE_TTL_MS / 1000)}s)`
      );
      tenantCache.delete(proxyName);
      return undefined;
    }
    
    return entry.tools;
  }

  /**
   * Check if cache entry exists and is valid
   */
  hasValidCache(proxyName: string, tenantId?: string): boolean {
    return this.getTools(proxyName, tenantId) !== undefined;
  }

  /**
   * Invalidate cache for a specific proxy
   */
  invalidate(proxyName: string, tenantId?: string): void {
    const tenantKey = this.getTenantKey(tenantId);
    const tenantCache = this.cache.get(tenantKey);
    
    if (tenantCache) {
      tenantCache.delete(proxyName);
      logger.info(
        `[TOOL-CACHE] Invalidated cache for proxy ${proxyName} (tenant: ${tenantKey})`
      );
    }
  }

  /**
   * Invalidate all caches for a tenant
   */
  invalidateAll(tenantId?: string): void {
    const tenantKey = this.getTenantKey(tenantId);
    this.cache.delete(tenantKey);
    logger.info(`[TOOL-CACHE] Invalidated all caches for tenant: ${tenantKey}`);
  }

  /**
   * Clear all caches (useful for testing or full refresh)
   */
  clear(): void {
    this.cache.clear();
    logger.info("[TOOL-CACHE] Cleared all tool caches");
  }

  /**
   * Get cache statistics
   */
  getStats(tenantId?: string): {
    totalProxies: number;
    totalTools: number;
    proxies: Array<{ name: string; toolCount: number; age: number }>;
  } {
    const tenantKey = this.getTenantKey(tenantId);
    const tenantCache = this.cache.get(tenantKey);
    
    if (!tenantCache) {
      return { totalProxies: 0, totalTools: 0, proxies: [] };
    }
    
    let totalTools = 0;
    const proxies: Array<{ name: string; toolCount: number; age: number }> = [];
    
    for (const [proxyName, entry] of tenantCache.entries()) {
      const toolCount = entry.tools.length;
      totalTools += toolCount;
      proxies.push({
        name: proxyName,
        toolCount,
        age: Date.now() - entry.timestamp,
      });
    }
    
    return {
      totalProxies: tenantCache.size,
      totalTools,
      proxies,
    };
  }
}

// Singleton instance
export const toolCache = new ToolCache();

