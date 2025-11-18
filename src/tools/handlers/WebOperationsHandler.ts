import type { ToolPolicyConfig } from "../../config.js";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";
import { evaluatePolicy } from "../../policy.js";

export interface WebSearchArgs extends Record<string, unknown> {
  query: string;
  limit?: number;
}

/**
 * Handler for web-based operations (search, etc.)
 */
export class WebOperationsHandler extends BaseGatewayHandler {
  private toolConfig: ToolPolicyConfig | undefined;

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
   * Perform a web search
   */
  async searchWeb(
    agentContext: AgentContext,
    args: WebSearchArgs
  ): Promise<ToolExecutionResult> {
    if (!this.toolConfig) {
      return this.createErrorResponse("Web search tool not configured");
    }

    const decision = await evaluatePolicy({
      tool: this.toolConfig,
      agentId: agentContext.agentId,
      agentRole: agentContext.agentRole,
      env: agentContext.env,
      args,
    });

    this.logRequest(agentContext, args, decision);

    if (decision.decision === "deny") {
      return this.createDeniedResponse(decision.reason);
    }

    try {
      const limit = args.limit || 5;

      // Use DuckDuckGo Instant Answer API (no API key required)
      // For more comprehensive results, you could integrate with Google Custom Search, Bing, etc.
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`;

      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`Search API returned status ${response.status}`);
      }

      const data = await response.json();

      // Format results
      const results: string[] = [];

      // Add instant answer if available
      if (data.AbstractText) {
        results.push(`Instant Answer: ${data.AbstractText}`);
        if (data.AbstractURL) {
          results.push(`Source: ${data.AbstractURL}`);
        }
      }

      // Add related topics
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        results.push("\nRelated Topics:");
        const topics = data.RelatedTopics.slice(0, limit);
        for (const topic of topics) {
          if (topic.Text) {
            results.push(`- ${topic.Text}`);
          }
          if (topic.FirstURL) {
            results.push(`  URL: ${topic.FirstURL}`);
          }
        }
      }

      // If no results from DuckDuckGo, provide a fallback message
      if (results.length === 0) {
        results.push(`Search query: "${args.query}"`);
        results.push(
          `No instant answers found. Consider using a more specific search query or integrating with a different search provider.`
        );
      }

      const resultText = results.join("\n");

      logger.info("[MCP-GATEWAY] web_search_gateway success", {
        query: args.query,
        limit,
        resultsFound: results.length > 0,
      });

      return this.createSuccessResponse(resultText);
    } catch (error) {
      return this.handleError(error, args);
    }
  }
}

