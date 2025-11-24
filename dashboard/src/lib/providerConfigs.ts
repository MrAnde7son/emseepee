/**
 * Provider Configuration Schemas
 * 
 * Defines the configuration fields required for each provider type.
 * This allows the UI to dynamically render configuration forms.
 */

export type FieldType = "text" | "password" | "url" | "email";

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  helpUrl?: string;
  validation?: {
    pattern?: string;
    patternMessage?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export interface ProviderConfigSchema {
  providerId: string;
  requiresConfig: boolean;
  fields: ConfigField[];
  description?: string;
}

/**
 * Provider configuration schemas
 * Add new providers here by defining their required fields
 */
export const PROVIDER_CONFIG_SCHEMAS: Record<string, ProviderConfigSchema> = {
  openai: {
    providerId: "openai",
    requiresConfig: true,
    description: "Enter your OpenAI API credentials to connect to ChatGPT",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "sk-...",
        description: "Your OpenAI API key",
        helpUrl: "https://platform.openai.com/api-keys",
        validation: {
          pattern: "^sk-",
          patternMessage: "API key must start with 'sk-'",
        },
      },
      {
        key: "baseUrl",
        label: "Base URL",
        type: "url",
        required: false,
        defaultValue: "https://api.openai.com/v1",
        placeholder: "https://api.openai.com/v1",
        description: "Custom API endpoint. Leave default for OpenAI.",
      },
      {
        key: "organizationId",
        label: "Organization ID",
        type: "text",
        required: false,
        placeholder: "org-...",
        description: "Your OpenAI organization ID if you belong to multiple organizations.",
      },
    ],
  },
  anthropic: {
    providerId: "anthropic",
    requiresConfig: true,
    description: "Enter your Anthropic API credentials to connect to Claude",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "sk-ant-...",
        description: "Your Anthropic API key",
        helpUrl: "https://console.anthropic.com/settings/keys",
        validation: {
          pattern: "^sk-ant-",
          patternMessage: "API key must start with 'sk-ant-'",
        },
      },
      {
        key: "baseUrl",
        label: "Base URL",
        type: "url",
        required: false,
        defaultValue: "https://api.anthropic.com",
        placeholder: "https://api.anthropic.com",
        description: "Custom API endpoint. Leave default for Anthropic.",
      },
    ],
  },
  gemini: {
    providerId: "gemini",
    requiresConfig: true,
    description: "Enter your Google API credentials to connect to Gemini",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "...",
        description: "Your Google API key for Gemini",
        helpUrl: "https://makersuite.google.com/app/apikey",
      },
      {
        key: "baseUrl",
        label: "Base URL",
        type: "url",
        required: false,
        defaultValue: "https://generativelanguage.googleapis.com/v1",
        placeholder: "https://generativelanguage.googleapis.com/v1",
        description: "Custom API endpoint. Leave default for Gemini.",
      },
    ],
  },
  bedrock: {
    providerId: "bedrock",
    requiresConfig: true,
    description: "Enter your AWS credentials to connect to Bedrock",
    fields: [
      {
        key: "accessKeyId",
        label: "AWS Access Key ID",
        type: "text",
        required: true,
        placeholder: "AKIA...",
        description: "Your AWS access key ID",
        helpUrl: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
      },
      {
        key: "secretAccessKey",
        label: "AWS Secret Access Key",
        type: "password",
        required: true,
        placeholder: "...",
        description: "Your AWS secret access key",
      },
      {
        key: "region",
        label: "AWS Region",
        type: "text",
        required: false,
        defaultValue: "us-east-1",
        placeholder: "us-east-1",
        description: "AWS region where Bedrock is available",
      },
      {
        key: "sessionToken",
        label: "Session Token (Optional)",
        type: "password",
        required: false,
        placeholder: "...",
        description: "Temporary session token for AWS credentials",
      },
    ],
  },
  vertex: {
    providerId: "vertex",
    requiresConfig: true,
    description: "Enter your Google Cloud credentials to connect to Vertex AI",
    fields: [
      {
        key: "projectId",
        label: "Project ID",
        type: "text",
        required: true,
        placeholder: "my-project-id",
        description: "Your Google Cloud project ID",
        helpUrl: "https://cloud.google.com/resource-manager/docs/creating-managing-projects",
      },
      {
        key: "location",
        label: "Location",
        type: "text",
        required: false,
        defaultValue: "us-central1",
        placeholder: "us-central1",
        description: "Google Cloud region for Vertex AI",
      },
      {
        key: "credentials",
        label: "Service Account JSON",
        type: "text",
        required: true,
        placeholder: '{"type": "service_account", ...}',
        description: "Service account JSON credentials",
        helpUrl: "https://cloud.google.com/iam/docs/service-accounts",
      },
    ],
  },
};

/**
 * Get configuration schema for a provider
 */
export function getProviderConfigSchema(providerId: string): ProviderConfigSchema | null {
  return PROVIDER_CONFIG_SCHEMAS[providerId] || null;
}

/**
 * Check if a provider requires configuration
 */
export function providerRequiresConfig(providerId: string): boolean {
  const schema = getProviderConfigSchema(providerId);
  return schema?.requiresConfig ?? false;
}

/**
 * Validate provider configuration against schema
 */
export function validateProviderConfig(
  providerId: string,
  config: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const schema = getProviderConfigSchema(providerId);
  if (!schema) {
    return { valid: true, errors: [] }; // No schema means no validation needed
  }

  const errors: string[] = [];

  for (const field of schema.fields) {
    const value = config[field.key] as string | undefined;

    // Check required fields
    if (field.required && (!value || value.trim() === "")) {
      errors.push(`${field.label} is required`);
      continue;
    }

    // Skip validation if field is empty and not required
    if (!value || value.trim() === "") {
      continue;
    }

    // Pattern validation
    if (field.validation?.pattern) {
      const pattern = new RegExp(field.validation.pattern);
      if (!pattern.test(value)) {
        errors.push(
          field.validation.patternMessage ||
            `${field.label} format is invalid`
        );
      }
    }

    // Length validation
    if (field.validation?.minLength && value.length < field.validation.minLength) {
      errors.push(
        `${field.label} must be at least ${field.validation.minLength} characters`
      );
    }

    if (field.validation?.maxLength && value.length > field.validation.maxLength) {
      errors.push(
        `${field.label} must be at most ${field.validation.maxLength} characters`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

