import { BaseLLMProvider, type LLMMessage, type LLMResponse } from './base.js';
import type { LLMConfig } from './config.js';
import { logger } from '../logger.js';

/**
 * AWS Bedrock provider implementation
 */
export class BedrockProvider extends BaseLLMProvider {
  getName(): string {
    return 'bedrock';
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const region = this.config.region || 'us-east-1';
    const modelId = this.config.model || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
    
    // Extract model name and version
    const [modelName, version] = modelId.split(':');
    const modelIdentifier = version ? `${modelName}:${version}` : modelName;

    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelIdentifier}/invoke`;

    // Convert messages to Bedrock format (Claude format)
    const systemMessages: string[] = [];
    const conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
      } else {
        conversationMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    // AWS Signature V4 signing
    const accessKeyId = this.config.apiKey || process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    const sessionToken = process.env.AWS_SESSION_TOKEN;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    }

    // For Bedrock, we need to sign the request using AWS Signature V4
    // This is a simplified version - in production, use AWS SDK
    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: this.config.maxTokens || 1000,
      temperature: this.config.temperature || 0.3,
      system: systemMessages.join('\n') || undefined,
      messages: conversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    // Use AWS SDK if available, otherwise use fetch with manual signing
    // For now, we'll use a fetch-based approach with manual signing
    // Note: In production, prefer using @aws-sdk/client-bedrock-runtime
    const signedRequest = await this.signRequest(
      url,
      'POST',
      requestBody,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      region
    );

    const response = await this.fetchWithTimeout(
      signedRequest.url,
      signedRequest.options
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[LLM] Bedrock API error: ${response.status} ${errorText}`);
      throw new Error(`Bedrock API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      content?: Array<{ text?: string }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    const text = data.content?.[0]?.text || '';

    return {
      content: text,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : undefined,
    };
  }

  /**
   * Sign AWS request using Signature V4
   * This is a simplified implementation - in production, use AWS SDK
   */
  private async signRequest(
    url: string,
    method: string,
    body: unknown,
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken?: string,
    region: string = 'us-east-1'
  ): Promise<{ url: string; options: RequestInit }> {
    // For a production implementation, use @aws-sdk/signature-v4
    // For now, we'll provide a basic implementation that works with fetch
    // This requires crypto for HMAC signing
    
    const urlObj = new URL(url);
    const service = 'bedrock';
    const host = urlObj.hostname;
    const path = urlObj.pathname;
    const query = urlObj.search;

    const bodyString = JSON.stringify(body);
    const contentType = 'application/json';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    // Create canonical request
    const canonicalUri = path;
    const canonicalQuerystring = query.substring(1);
    const canonicalHeaders = [
      `host:${host}`,
      `content-type:${contentType}`,
      `x-amz-date:${amzDate}`,
    ].join('\n') + '\n';
    
    const signedHeaders = 'host;content-type;x-amz-date';
    const payloadHash = await this.sha256(bodyString);
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      await this.sha256(canonicalRequest),
    ].join('\n');

    // Calculate signature
    const kDate = await this.hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, service);
    const kSigning = await this.hmacSha256(kService, 'aws4_request');
    const signature = await this.hmacSha256(kSigning, stringToSign);

    // Create authorization header
    const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'X-Amz-Date': amzDate,
      'Authorization': authorization,
    };

    if (sessionToken) {
      headers['X-Amz-Security-Token'] = sessionToken;
    }

    return {
      url,
      options: {
        method,
        headers,
        body: bodyString,
      },
    };
  }

  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async hmacSha256(key: string | ArrayBuffer, data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyBuffer = typeof key === 'string' ? encoder.encode(key) : key;
    const dataBuffer = encoder.encode(data);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

