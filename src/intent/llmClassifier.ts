import type { AgentIntent, ToolCallEvent, RiskLevel, OperationType } from './types.js';
import { logger } from '../logger.js';
import { getLLMProvider } from '../llm/index.js';
import type { LLMMessage } from '../llm/index.js';

/**
 * LLM-based intent classifier for complex or unknown cases
 * 
 * This uses an LLM to classify the agent's intent when:
 * - Tool is not in registry
 * - Registry returns low confidence
 * - Tool is marked as requiring semantic classification
 */
export async function classifyIntentWithLLM(
  event: ToolCallEvent,
  ruleBasedIntent?: AgentIntent['inferredIntent']
): Promise<AgentIntent['inferredIntent']> {
  logger.info(`[INTENT] LLM classification requested for tool: ${event.toolName}`);
  
  const provider = getLLMProvider();
  if (!provider) {
    logger.warn('[INTENT] LLM provider not configured, falling back to conservative defaults');
    return {
      operation: 'read',
      action: `llm_classified_${event.toolName}`,
      resources: [],
      riskLevel: 'high',
      confidence: 0.3,
      explanation: 'LLM provider not configured; using conservative defaults.',
    };
  }

  try {
    // Build the classification prompt
    const messages = buildClassificationPrompt(event, ruleBasedIntent);
    
    // Call the LLM
    const response = await provider.chat(messages);
    
    // Parse the response
    const intent = parseLLMResponse(response.content, event, ruleBasedIntent);
    
    logger.info(`[INTENT] LLM classification completed`, {
      tool: event.toolName,
      operation: intent.operation,
      action: intent.action,
      riskLevel: intent.riskLevel,
      confidence: intent.confidence,
    });
    
    return intent;
  } catch (error) {
    logger.error(`[INTENT] LLM classification failed`, error);
    
    // Fall back to rule-based or conservative defaults
    if (ruleBasedIntent) {
      return {
        ...ruleBasedIntent,
        confidence: ruleBasedIntent.confidence * 0.7, // Reduce confidence on error
        explanation: `${ruleBasedIntent.explanation} (LLM classification failed: ${error instanceof Error ? error.message : String(error)})`,
      };
    }
    
    return {
      operation: 'read',
      action: `llm_classified_${event.toolName}`,
      resources: [],
      riskLevel: 'high',
      confidence: 0.3,
      explanation: `LLM classification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Build the classification prompt for the LLM
 */
function buildClassificationPrompt(
  event: ToolCallEvent,
  ruleBasedIntent?: AgentIntent['inferredIntent']
): LLMMessage[] {
  const systemPrompt = `You are an intent classification system for an agent tools gateway. Your task is to analyze tool calls and classify the agent's intent.

You must output a JSON object with the following structure:
{
  "operation": "read" | "write" | "delete" | "execute" | "admin",
  "action": "a_snake_case_action_name",
  "resources": ["resource:identifier1", "resource:identifier2"],
  "riskLevel": "low" | "medium" | "high",
  "confidence": 0.0-1.0,
  "explanation": "brief explanation of the classification"
}

Guidelines:
- operation: The type of operation (read=read-only, write=modify, delete=remove, execute=run code/commands, admin=administrative)
- action: A descriptive action name in snake_case (e.g., "delete_vm", "create_issue", "read_database")
- resources: Array of resource identifiers extracted from arguments (e.g., ["vm:vm-123", "project:payments-prod", "user:1234"])
- riskLevel: Assess the risk (low=safe, medium=moderate impact, high=destructive or sensitive)
- confidence: Your confidence in this classification (0.0-1.0)
- explanation: Brief explanation of why you classified it this way

Be precise and conservative with risk levels.`;

  const userPrompt = `Classify this tool call:

Tool Name: ${event.toolName}
Arguments: ${JSON.stringify(event.arguments, null, 2)}
${event.conversationContext?.userRequest ? `User Request: ${event.conversationContext.userRequest}` : ''}
${ruleBasedIntent ? `Previous Classification (for reference): ${JSON.stringify(ruleBasedIntent, null, 2)}` : ''}

Output only valid JSON, no markdown formatting or additional text.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Parse LLM response and extract intent
 */
function parseLLMResponse(
  response: string,
  event: ToolCallEvent,
  ruleBasedIntent?: AgentIntent['inferredIntent']
): AgentIntent['inferredIntent'] {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      const lines = jsonStr.split('\n');
      const startIndex = lines.findIndex((line: string) => line.includes('json') || line.includes('{'));
      let endIndex = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i]?.includes('}')) {
          endIndex = i;
          break;
        }
      }
      if (startIndex >= 0 && endIndex >= startIndex) {
        jsonStr = lines.slice(startIndex + 1, endIndex + 1).join('\n');
      }
    }
    
    // Find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr) as {
      operation?: string;
      action?: string;
      resources?: string[];
      riskLevel?: string;
      confidence?: number;
      explanation?: string;
    };
    
    // Validate and normalize
    const operation = (parsed.operation || 'read') as OperationType;
    const action = parsed.action || `llm_classified_${event.toolName}`;
    const resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    const riskLevel = (parsed.riskLevel || 'medium') as RiskLevel;
    const confidence = typeof parsed.confidence === 'number' 
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.7;
    const explanation = parsed.explanation || 'Classified by LLM';
    
    return {
      operation,
      action,
      resources,
      riskLevel,
      confidence,
      explanation,
    };
  } catch (error) {
    logger.warn(`[INTENT] Failed to parse LLM response, using fallback`, {
      response: response.substring(0, 200),
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Fallback to rule-based or defaults
    if (ruleBasedIntent) {
      return {
        ...ruleBasedIntent,
        confidence: ruleBasedIntent.confidence * 0.8,
        explanation: `${ruleBasedIntent.explanation} (LLM response parsing failed)`,
      };
    }
    
    return {
      operation: 'read',
      action: `llm_classified_${event.toolName}`,
      resources: [],
      riskLevel: 'high',
      confidence: 0.5,
      explanation: 'Failed to parse LLM response',
    };
  }
}

/**
 * Check if LLM classification should be used
 */
export function shouldUseLLMClassification(
  toolName: string,
  ruleBasedIntent: AgentIntent['inferredIntent']
): boolean {
  // Use LLM if:
  // 1. Tool not in registry (confidence < 0.5)
  // 2. Rule-based confidence is low
  // 3. Tool is marked as requiring semantic classification (check registry)
  
  if (ruleBasedIntent.confidence < 0.5) {
    return true;
  }
  
  // Check if tool requires semantic classification
  // This would require importing from toolRegistry, but to avoid circular deps,
  // we'll check the action name pattern
  if (ruleBasedIntent.action === 'unknown_action') {
    return true;
  }
  
  return false;
}

