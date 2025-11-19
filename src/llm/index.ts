import type { LLMConfig } from './config.js';
import { getLLMConfig } from './config.js';
import { OpenAIProvider } from './openai.js';
import { GroqProvider } from './groq.js';
import { GeminiProvider } from './gemini.js';
import { BedrockProvider } from './bedrock.js';
import type { LLMProvider as ILLMProvider } from './base.js';
import { logger } from '../logger.js';

let cachedProvider: ILLMProvider | null = null;

/**
 * Get or create the LLM provider instance
 */
export function getLLMProvider(): ILLMProvider | null {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = getLLMConfig();
  if (!config) {
    logger.warn('[LLM] No LLM provider configured. Set LLM_PROVIDER and required API keys.');
    return null;
  }

  try {
    switch (config.provider) {
      case 'openai':
        cachedProvider = new OpenAIProvider(config);
        break;
      case 'groq':
        cachedProvider = new GroqProvider(config);
        break;
      case 'gemini':
        cachedProvider = new GeminiProvider(config);
        break;
      case 'bedrock':
        cachedProvider = new BedrockProvider(config);
        break;
      default:
        logger.warn(`[LLM] Unknown provider: ${config.provider}`);
        return null;
    }

    logger.info(`[LLM] Initialized ${config.provider} provider with model ${config.model}`);
    return cachedProvider;
  } catch (error) {
    logger.error(`[LLM] Failed to initialize provider ${config.provider}`, error);
    return null;
  }
}

/**
 * Reset the cached provider (useful for testing or reconfiguration)
 */
export function resetLLMProvider(): void {
  cachedProvider = null;
}

export type { LLMConfig, LLMProvider } from './config.js';
export type { LLMMessage, LLMResponse } from './base.js';

