import { BaseLLMProvider, type LLMMessage, type LLMResponse } from './base.js';
import type { LLMConfig } from './config.js';
import { logger } from '../logger.js';

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseLLMProvider {
  getName(): string {
    return 'openai';
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const model = this.config.model || 'gpt-4o-mini';

    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: this.config.temperature || 0.3,
          max_tokens: this.config.maxTokens || 1000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[LLM] OpenAI API error: ${response.status} ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}

