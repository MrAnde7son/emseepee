/**
 * LLM Provider Configuration
 */
export type LLMProvider = 'openai' | 'groq' | 'gemini' | 'bedrock';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  region?: string; // For Bedrock
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/**
 * Get LLM configuration from environment variables
 */
export function getLLMConfig(): LLMConfig | null {
  // Check which provider is configured
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase() as LLMProvider;
  
  if (!['openai', 'groq', 'gemini', 'bedrock'].includes(provider)) {
    return null;
  }

  const config: LLMConfig = {
    provider,
    model: process.env.LLM_MODEL,
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.3,
    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : 1000,
    timeout: process.env.LLM_TIMEOUT ? parseInt(process.env.LLM_TIMEOUT, 10) : 30000,
  };

  // Provider-specific configuration
  switch (provider) {
    case 'openai':
      config.apiKey = process.env.OPENAI_API_KEY;
      config.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      config.model = config.model || 'gpt-4o-mini';
      break;
    
    case 'groq':
      config.apiKey = process.env.GROQ_API_KEY;
      config.baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
      config.model = config.model || 'llama-3.1-70b-versatile';
      break;
    
    case 'gemini':
      config.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      config.baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1';
      config.model = config.model || 'gemini-1.5-flash';
      break;
    
    case 'bedrock':
      config.apiKey = process.env.AWS_ACCESS_KEY_ID;
      config.region = process.env.AWS_REGION || 'us-east-1';
      config.model = config.model || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
      // Bedrock uses AWS credentials, not API key
      if (!config.apiKey || !process.env.AWS_SECRET_ACCESS_KEY) {
        return null;
      }
      break;
  }

  // Check if API key is available (except for Bedrock which uses AWS credentials)
  if (provider !== 'bedrock' && !config.apiKey) {
    return null;
  }

  return config;
}

