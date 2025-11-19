import type { AgentIntent, ToolCallEvent, RiskLevel, OperationType } from './types.js';
import { getToolMetadata } from './toolRegistry.js';
import { logger } from '../logger.js';

/**
 * Infer intent from tool call using rule-based approach
 */
export function inferIntentFromToolCall(event: ToolCallEvent): AgentIntent['inferredIntent'] {
  const meta = getToolMetadata(event.toolName);
  
  if (!meta) {
    return {
      operation: 'read',
      action: 'unknown_action',
      resources: [],
      riskLevel: 'medium',
      confidence: 0.3,
      explanation: `Unknown tool '${event.toolName}'; defaulting to read/medium.`,
    };
  }

  // Extract resources using registered extractors
  const resources = (meta.resourceExtractors || [])
    .flatMap(fn => {
      try {
        return fn(event.arguments);
      } catch (error) {
        logger.warn(`[INTENT] Resource extractor failed for tool ${event.toolName}`, error);
        return [];
      }
    })
    .filter(Boolean);

  return {
    operation: meta.operation,
    action: meta.defaultAction,
    resources,
    riskLevel: meta.defaultRisk || 'medium',
    confidence: 0.8,
    explanation: `Derived from tool=${meta.name} and arguments.`,
  };
}

