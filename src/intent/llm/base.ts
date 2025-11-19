import type { LLMConfig } from './config.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Base interface for LLM providers
 */
export interface LLMProvider {
  /**
   * Generate a completion from messages
   */
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
  
  /**
   * Get the provider name
   */
  getName(): string;
}

/**
 * Base class for LLM providers with common functionality
 */
export abstract class BaseLLMProvider implements LLMProvider {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  abstract chat(messages: LLMMessage[]): Promise<LLMResponse>;
  abstract getName(): string;

  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number = this.config.timeout || 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

