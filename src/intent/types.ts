export type OperationType = 'read' | 'write' | 'delete' | 'execute' | 'admin';

export type ProviderType = 'openai' | 'vertex' | 'gemini' | 'n8n' | 'cursor' | 'other';

export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * AgentIntent represents a normalized, structured view of what an agent intends to do.
 * This is what the policy engine reasons about, not the raw tool call.
 */
export interface AgentIntent {
  // Where did this come from
  provider: ProviderType;
  agentId?: string;
  userId?: string;           // human identity behind agent
  sessionId?: string;
  requestId: string;

  // What the agent says it wants to do (if available)
  declaredIntent?: {
    goal: string;            // "reset user password"
    raw: unknown;            // original JSON block from agent
  };

  // What YOU infer
  inferredIntent: {
    operation: OperationType;
    action: string;          // "reset_user_password", "refund_order", "create_github_pr"
    resources: string[];     // "user:1234", "repo:org/app", "db:customers"
    riskLevel: RiskLevel;
    confidence: number;      // 0–1
    explanation?: string;
  };

  // What actually will be called
  toolCall: {
    toolName: string;        // "resetPassword", "createIssue", "sql.query"
    arguments: Record<string, unknown>;
    rawRequest: unknown;     // full gateway request, for audit
  };

  timestamp: string;
}

/**
 * Tool call event - the raw input to intent inference
 */
export interface ToolCallEvent {
  toolName: string;
  arguments: Record<string, unknown>;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  provider?: ProviderType;
  requestId?: string;
  // Optional: conversation context for LLM-based classification
  conversationContext?: {
    userRequest?: string;
    recentMessages?: Array<{ role: string; content: string }>;
  };
}

