import type { ToolPolicyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";

export interface WebSearchArgs extends Record<string, unknown> {
  query: string;
  limit?: number;
  provider?: "tavily" | "serpapi" | "google" | "bing" | "duckduckgo" | "auto";
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export type SearchProvider = "tavily" | "serpapi" | "google" | "bing" | "duckduckgo";

/**
 * Handler for web-based operations (search, etc.)
 * Supports multiple search providers for comprehensive web search results
 */
export class WebOperationsHandler extends BaseGatewayHandler {
  private toolConfig: ToolPolicyConfig | undefined;
  private readonly FETCH_TIMEOUT_MS = 30000; // 30 seconds

  constructor(toolConfig?: ToolPolicyConfig) {
    super();
    this.toolConfig = toolConfig;
  }

  protected getToolName(): string {
    return "web_search_gateway";
  }

  protected getToolConfig(): ToolPolicyConfig | undefined {
    return this.toolConfig;
  }

  /**
   * Fetch with timeout and better error handling
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = this.FETCH_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle different types of fetch errors
      if (error instanceof Error) {
        // Check for abort/timeout errors (can be AbortError or DOMException)
        if (error.name === "AbortError" || (error as unknown as { name?: string }).name === "AbortError") {
          throw new Error(`Request timeout after ${timeoutMs}ms while fetching ${url}`);
        }
        
        const errorMsg = error.message.toLowerCase();
        
        // Network connectivity errors
        if (
          errorMsg.includes("fetch failed") ||
          errorMsg.includes("econnrefused") ||
          errorMsg.includes("enotfound") ||
          errorMsg.includes("econnreset") ||
          errorMsg.includes("networkerror") ||
          errorMsg.includes("failed to fetch")
        ) {
          throw new Error(
            `Network error: Unable to connect to ${url}. ` +
            `This may be due to network connectivity issues, DNS resolution failure, or the server being unreachable. ` +
            `Error: ${error.message}`
          );
        }
        
        // Timeout errors
        if (errorMsg.includes("etimedout") || errorMsg.includes("timeout")) {
          throw new Error(
            `Request timeout: The connection to ${url} timed out. ` +
            `This may be due to network issues or the server taking too long to respond.`
          );
        }
        
        // Generic fetch errors
        throw new Error(`Fetch error for ${url}: ${error.message}`);
      }
      
      // Handle non-Error objects
      throw new Error(`Unknown error while fetching ${url}: ${String(error)}`);
    }
  }

  /**
   * Determine which search provider to use
   */
  private getSearchProvider(preferredProvider?: string): SearchProvider {
    if (preferredProvider && preferredProvider !== "auto") {
      return preferredProvider as SearchProvider;
    }

    // Auto-select based on available API keys
    if (process.env.TAVILY_API_KEY) return "tavily";
    if (process.env.SERPAPI_KEY) return "serpapi";
    if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) return "google";
    if (process.env.BING_SEARCH_API_KEY) return "bing";
    
    // Fallback to DuckDuckGo (no API key required)
    return "duckduckgo";
  }

  /**
   * Perform a web search using Tavily API
   */
  private async searchWithTavily(query: string, limit: number): Promise<SearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY environment variable is not set");
    }

    try {
      const response = await this.fetchWithTimeout("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: limit,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      // Add answer if available
      if (data.answer) {
        results.push({
          title: "Answer",
          url: "",
          snippet: data.answer,
          score: 1.0,
        });
      }

      // Add search results
      if (data.results && Array.isArray(data.results)) {
        for (const result of data.results.slice(0, limit)) {
          results.push({
            title: result.title || "No title",
            url: result.url || "",
            snippet: result.content || result.snippet || "",
            score: result.score,
          });
        }
      }

      return results;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Tavily API error")) {
        throw error;
      }
      throw new Error(`Failed to search with Tavily: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform a web search using SerpAPI
   */
  private async searchWithSerpApi(query: string, limit: number): Promise<SearchResult[]> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      throw new Error("SERPAPI_KEY environment variable is not set");
    }

    const url = new URL("https://serpapi.com/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("q", query);
    url.searchParams.set("engine", "google");
    url.searchParams.set("num", String(limit));

    try {
      const response = await this.fetchWithTimeout(url.toString());
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SerpAPI error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      if (data.organic_results && Array.isArray(data.organic_results)) {
        for (const result of data.organic_results.slice(0, limit)) {
          results.push({
            title: result.title || "No title",
            url: result.link || "",
            snippet: result.snippet || "",
            score: result.position ? 1 / result.position : undefined,
          });
        }
      }

      return results;
    } catch (error) {
      if (error instanceof Error && error.message.includes("SerpAPI error")) {
        throw error;
      }
      throw new Error(`Failed to search with SerpAPI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform a web search using Google Custom Search API
   */
  private async searchWithGoogle(query: string, limit: number): Promise<SearchResult[]> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !engineId) {
      throw new Error("GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables must be set");
    }

    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", engineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(limit, 10))); // Google API max is 10

    try {
      const response = await this.fetchWithTimeout(url.toString());
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Search API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items.slice(0, limit)) {
          results.push({
            title: item.title || "No title",
            url: item.link || "",
            snippet: item.snippet || "",
          });
        }
      }

      return results;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Google Search API error")) {
        throw error;
      }
      throw new Error(`Failed to search with Google: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform a web search using Bing Search API
   */
  private async searchWithBing(query: string, limit: number): Promise<SearchResult[]> {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error("BING_SEARCH_API_KEY environment variable is not set");
    }

    const url = new URL("https://api.bing.microsoft.com/v7.0/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(limit, 50))); // Bing API max is 50

    try {
      const response = await this.fetchWithTimeout(url.toString(), {
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bing Search API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      if (data.webPages && data.webPages.value && Array.isArray(data.webPages.value)) {
        for (const page of data.webPages.value.slice(0, limit)) {
          results.push({
            title: page.name || "No title",
            url: page.url || "",
            snippet: page.snippet || "",
          });
        }
      }

      return results;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Bing Search API error")) {
        throw error;
      }
      throw new Error(`Failed to search with Bing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform a web search using DuckDuckGo (fallback, limited results)
   */
  private async searchWithDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    try {
      const response = await this.fetchWithTimeout(searchUrl);
      if (!response.ok) {
        throw new Error(`DuckDuckGo API returned status ${response.status}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      // Add instant answer if available
      if (data.AbstractText) {
        results.push({
          title: "Instant Answer",
          url: data.AbstractURL || "",
          snippet: data.AbstractText,
        });
      }

      // Add related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
          if (topic.Text || topic.FirstURL) {
            results.push({
              title: topic.Text ? topic.Text.substring(0, 100) : "Related Topic",
              url: topic.FirstURL || "",
              snippet: topic.Text || "",
            });
          }
        }
      }

      return results;
    } catch (error) {
      if (error instanceof Error && error.message.includes("DuckDuckGo API")) {
        throw error;
      }
      throw new Error(`Failed to search with DuckDuckGo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Format search results as a readable string
   */
  private formatSearchResults(results: SearchResult[], provider: SearchProvider, query: string): string {
    if (results.length === 0) {
      return `No results found for query: "${query}"\n\nTry:\n- Using a more specific search query\n- Checking if a search provider API key is configured\n- Using a different search provider`;
    }

    const lines: string[] = [];
    lines.push(`Found ${results.length} result(s) using ${provider.toUpperCase()}:\n`);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      lines.push(`${i + 1}. ${result.title}`);
      if (result.url) {
        lines.push(`   URL: ${result.url}`);
      }
      if (result.snippet) {
        // Truncate long snippets
        const snippet = result.snippet.length > 300 
          ? result.snippet.substring(0, 300) + "..." 
          : result.snippet;
        lines.push(`   ${snippet}`);
      }
      lines.push(""); // Empty line between results
    }

    return lines.join("\n");
  }

  /**
   * Perform a web search
   */
  async searchWeb(
    agentContext: AgentContext,
    args: WebSearchArgs
  ): Promise<ToolExecutionResult> {
    if (!this.toolConfig) {
      return this.createErrorResponse("Web search tool not configured");
    }

    return this.executeWithPolicy(agentContext, args, async () => {
      const limit = Math.min(args.limit || 5, 20);
      const query = args.query as string;
      const preferredProvider = args.provider as string | undefined;

      const searchProvider = this.getSearchProvider(preferredProvider);
      let results: SearchResult[] = [];

      logger.info("[MCP-GATEWAY] web_search_gateway using provider", {
        provider: searchProvider,
        query,
        limit,
      });

      try {
        switch (searchProvider) {
          case "tavily":
            results = await this.searchWithTavily(query, limit);
            break;
          case "serpapi":
            results = await this.searchWithSerpApi(query, limit);
            break;
          case "google":
            results = await this.searchWithGoogle(query, limit);
            break;
          case "bing":
            results = await this.searchWithBing(query, limit);
            break;
          case "duckduckgo":
            results = await this.searchWithDuckDuckGo(query, limit);
            break;
          default:
            throw new Error(`Unknown search provider: ${searchProvider}`);
        }
      } catch (error) {
        // If primary provider fails and it's not duckduckgo, fallback to duckduckgo
        if (searchProvider !== "duckduckgo") {
          logger.warn("[MCP-GATEWAY] Primary search provider failed, falling back to DuckDuckGo", {
            provider: searchProvider,
            error: error instanceof Error ? error.message : String(error),
          });
          try {
            results = await this.searchWithDuckDuckGo(query, limit);
          } catch (fallbackError) {
            // If fallback also fails, throw a combined error
            throw new Error(
              `Both primary provider (${searchProvider}) and fallback (DuckDuckGo) failed. ` +
              `Primary error: ${error instanceof Error ? error.message : String(error)}. ` +
              `Fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
            );
          }
        } else {
          throw error;
        }
      }

      const resultText = this.formatSearchResults(results, searchProvider, query);

      logger.info("[MCP-GATEWAY] web_search_gateway success", {
        query,
        limit,
        provider: searchProvider,
        resultsFound: results.length,
      });

      return this.createSuccessResponse(resultText);
    });
  }
}

