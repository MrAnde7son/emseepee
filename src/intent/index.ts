// Export types
export type {
  AgentIntent,
  ToolCallEvent,
  OperationType,
  ProviderType,
  RiskLevel,
} from './types.js';

// Export main functions
export { inferAgentIntent } from './intentLayer.js';
export { inferIntentFromToolCall } from './ruleBasedInference.js';
export { classifyIntentWithLLM, shouldUseLLMClassification } from './llmClassifier.js';

// Export registry functions
export {
  getToolMetadata,
  registerToolMetadata,
  getAllToolMetadata,
  type ToolMetadata,
  type ResourceExtractor,
} from './toolRegistry.js';

