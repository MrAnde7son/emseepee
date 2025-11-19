import { BaseLLMProvider, type LLMMessage, type LLMResponse } from './base.js';
import type { LLMConfig } from './config.js';
import { logger } from '../logger.js';

/**
 * Google Gemini provider implementation
 */
export class GeminiProvider extends BaseLLMProvider {
  getName(): string {
    return 'gemini';
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const model = this.config.model || 'gemini-1.5-flash';
    const url = `${this.config.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;

    // Convert messages to Gemini format
    // Gemini uses a different message format - combine system and user messages
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages in Gemini are handled via systemInstruction
        // For now, prepend to first user message
        continue;
      }
      
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    // Add system instruction if first message is system
    const systemInstruction = messages[0]?.role === 'system' 
      ? { parts: [{ text: messages[0].content }] }
      : undefined;

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: this.config.temperature || 0.3,
        maxOutputTokens: this.config.maxTokens || 1000,
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    const response = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[LLM] Gemini API error: ${response.status} ${errorText}`);
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content: text,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }
}

