import type { AgentIntent, ToolCallEvent, ProviderType } from './types.js';
import { inferIntentFromToolCall } from './ruleBasedInference.js';
import { classifyIntentWithLLM, shouldUseLLMClassification } from './llmClassifier.js';
import { getToolMetadata } from './toolRegistry.js';
import { logger } from '../logger.js';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Merge two intent inferences, handling conflicts
 */
function mergeIntentInferences(
  ruleBased: AgentIntent['inferredIntent'],
  llmBased?: AgentIntent['inferredIntent']
): AgentIntent['inferredIntent'] {
  if (!llmBased) {
    return ruleBased;
  }

  // If both agree on operation and risk, increase confidence
  if (
    ruleBased.operation === llmBased.operation &&
    ruleBased.riskLevel === llmBased.riskLevel
  ) {
    return {
      ...ruleBased,
      confidence: Math.min(1.0, (ruleBased.confidence + llmBased.confidence) / 2 + 0.1),
      explanation: `Agreement between rule-based and LLM: ${ruleBased.explanation}`,
    };
  }

  // If they conflict, mark as high-risk and require approval
  return {
    operation: ruleBased.operation, // Prefer rule-based for operation
    action: llmBased.action || ruleBased.action,
    resources: [...new Set([...ruleBased.resources, ...llmBased.resources])], // Merge resources
    riskLevel: 'high', // Conflicts are high risk
    confidence: Math.min(ruleBased.confidence, llmBased.confidence),
    explanation: `Conflict between rule-based (${ruleBased.explanation}) and LLM (${llmBased.explanation}). Marked as high-risk.`,
  };
}

/**
 * Main intent layer function: takes a raw tool call and returns a structured AgentIntent
 */
export async function inferAgentIntent(
  event: ToolCallEvent,
  toolConfig?: { name: string; description?: string }
): Promise<AgentIntent> {
  const requestId = event.requestId || generateRequestId();
  const provider: ProviderType = event.provider || 'other';
  
  // Step 1: Rule-based inference (always runs)
  const ruleBasedIntent = inferIntentFromToolCall(event);
  
  // Step 2: Check if we need LLM classification
  const toolMetadata = getToolMetadata(event.toolName);
  const needsLLM = 
    toolMetadata?.requiresSemanticClassification ||
    shouldUseLLMClassification(event.toolName, ruleBasedIntent);
  
  let finalIntent = ruleBasedIntent;
  
  // Step 3: Run LLM classifier if needed
  if (needsLLM) {
    try {
      const llmIntent = await classifyIntentWithLLM(event, ruleBasedIntent);
      finalIntent = mergeIntentInferences(ruleBasedIntent, llmIntent);
    } catch (error) {
      logger.warn(`[INTENT] LLM classification failed, using rule-based only`, error);
      // Fall back to rule-based if LLM fails
      finalIntent = {
        ...ruleBasedIntent,
        confidence: ruleBasedIntent.confidence * 0.8, // Reduce confidence if LLM failed
        explanation: `${ruleBasedIntent.explanation} (LLM classification failed)`,
      };
    }
  }
  
  // Step 4: Build the complete AgentIntent
  const intent: AgentIntent = {
    provider,
    agentId: event.agentId,
    userId: event.userId,
    sessionId: event.sessionId,
    requestId,
    declaredIntent: event.conversationContext?.userRequest
      ? {
          goal: event.conversationContext.userRequest,
          raw: event.conversationContext,
        }
      : undefined,
    inferredIntent: finalIntent,
    toolCall: {
      toolName: event.toolName,
      arguments: event.arguments,
      rawRequest: event,
    },
    timestamp: new Date().toISOString(),
  };
  
  logger.info(`[INTENT] Inferred intent for ${event.toolName}`, {
    operation: finalIntent.operation,
    action: finalIntent.action,
    riskLevel: finalIntent.riskLevel,
    confidence: finalIntent.confidence,
    resources: finalIntent.resources,
  });
  
  return intent;
}

