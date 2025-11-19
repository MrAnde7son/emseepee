import type { OperationType, RiskLevel } from './types.js';

/**
 * Resource extractor function - extracts resource identifiers from tool arguments
 */
export type ResourceExtractor = (args: Record<string, unknown>) => string[];

/**
 * Tool metadata for rule-based intent inference
 */
export interface ToolMetadata {
  name: string;
  operation: OperationType;
  defaultAction: string;
  resourceExtractors?: ResourceExtractor[];
  defaultRisk?: RiskLevel;
  // If true, always use LLM classifier for this tool (even if in registry)
  requiresSemanticClassification?: boolean;
}

/**
 * Tool registry - maps tool names to their metadata for intent inference
 */
const TOOL_REGISTRY: ToolMetadata[] = [
  // File operations
  {
    name: 'file_read_gateway',
    operation: 'read',
    defaultAction: 'read_file',
    resourceExtractors: [
      (args) => args.path ? [`file:${args.path}`] : []
    ],
    defaultRisk: 'low',
  },
  {
    name: 'file_write_gateway',
    operation: 'write',
    defaultAction: 'write_file',
    resourceExtractors: [
      (args) => args.path ? [`file:${args.path}`] : []
    ],
    defaultRisk: 'high',
  },
  {
    name: 'file_search_gateway',
    operation: 'read',
    defaultAction: 'search_files',
    defaultRisk: 'low',
  },
  
  // Web operations
  {
    name: 'web_search_gateway',
    operation: 'read',
    defaultAction: 'web_search',
    defaultRisk: 'low',
  },
  
  // Common third-party tool patterns
  {
    name: 'refundOrder',
    operation: 'write',
    defaultAction: 'issue_refund',
    resourceExtractors: [
      (args) => args.orderId ? [`order:${args.orderId}`] : []
    ],
    defaultRisk: 'medium',
  },
  {
    name: 'deleteVm',
    operation: 'delete',
    defaultAction: 'delete_vm',
    resourceExtractors: [
      (args) => {
        const resources: string[] = [];
        if (args.vmId) resources.push(`vm:${args.vmId}`);
        if (args.projectId) resources.push(`project:${args.projectId}`);
        return resources;
      }
    ],
    defaultRisk: 'high',
  },
  {
    name: 'sql.query',
    operation: 'read',
    defaultAction: 'read_database',
    defaultRisk: 'high',
  },
  {
    name: 'sql.execute',
    operation: 'write',
    defaultAction: 'write_database',
    defaultRisk: 'high',
  },
  {
    name: 'createIssue',
    operation: 'write',
    defaultAction: 'create_issue',
    resourceExtractors: [
      (args) => {
        const resources: string[] = [];
        if (args.owner && args.repo) {
          resources.push(`repo:${args.owner}/${args.repo}`);
        }
        return resources;
      }
    ],
    defaultRisk: 'medium',
  },
  {
    name: 'createPullRequest',
    operation: 'write',
    defaultAction: 'create_pull_request',
    resourceExtractors: [
      (args) => {
        const resources: string[] = [];
        if (args.owner && args.repo) {
          resources.push(`repo:${args.owner}/${args.repo}`);
        }
        return resources;
      }
    ],
    defaultRisk: 'medium',
  },
  {
    name: 'deleteRepository',
    operation: 'delete',
    defaultAction: 'delete_repository',
    resourceExtractors: [
      (args) => {
        const resources: string[] = [];
        if (args.owner && args.repo) {
          resources.push(`repo:${args.owner}/${args.repo}`);
        }
        return resources;
      }
    ],
    defaultRisk: 'high',
  },
  {
    name: 'resetPassword',
    operation: 'write',
    defaultAction: 'reset_user_password',
    resourceExtractors: [
      (args) => args.userId ? [`user:${args.userId}`] : []
    ],
    defaultRisk: 'high',
  },
];

/**
 * Get tool metadata from registry
 */
export function getToolMetadata(toolName: string): ToolMetadata | undefined {
  return TOOL_REGISTRY.find(t => t.name === toolName);
}

/**
 * Register a new tool metadata (for dynamic registration)
 */
export function registerToolMetadata(metadata: ToolMetadata): void {
  const existingIndex = TOOL_REGISTRY.findIndex(t => t.name === metadata.name);
  if (existingIndex >= 0) {
    TOOL_REGISTRY[existingIndex] = metadata;
  } else {
    TOOL_REGISTRY.push(metadata);
  }
}

/**
 * Get all registered tool metadata
 */
export function getAllToolMetadata(): ToolMetadata[] {
  return [...TOOL_REGISTRY];
}

