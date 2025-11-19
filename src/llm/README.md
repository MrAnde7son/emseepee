# LLM Provider Configuration

The gateway supports multiple LLM providers for semantic classification and other LLM-based features. Configure your preferred provider using environment variables.

## Supported Providers

- **OpenAI** - GPT models (gpt-4o-mini, gpt-4, etc.)
- **Groq** - Fast inference with Llama models
- **Gemini** - Google's Gemini models
- **AWS Bedrock** - AWS managed LLM service (Claude, Llama, etc.)

## Configuration

Set the following environment variables to configure your LLM provider:

### Common Variables

```bash
# Required: Choose your provider
LLM_PROVIDER=openai  # Options: openai, groq, gemini, bedrock

# Optional: Model selection
LLM_MODEL=gpt-4o-mini  # Provider-specific default will be used if not set

# Optional: Generation parameters
LLM_TEMPERATURE=0.3    # Default: 0.3
LLM_MAX_TOKENS=1000    # Default: 1000
LLM_TIMEOUT=30000      # Default: 30000ms (30 seconds)
```

### OpenAI Configuration

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional, defaults to OpenAI API
LLM_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
```

### Groq Configuration

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_BASE_URL=https://api.groq.com/openai/v1  # Optional
LLM_MODEL=llama-3.1-70b-versatile  # Optional, defaults to llama-3.1-70b-versatile
```

### Gemini Configuration

```bash
LLM_PROVIDER=gemini
GEMINI_API_KEY=...  # Or use GOOGLE_API_KEY
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1  # Optional
LLM_MODEL=gemini-1.5-flash  # Optional, defaults to gemini-1.5-flash
```

### AWS Bedrock Configuration

```bash
LLM_PROVIDER=bedrock
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1  # Optional, defaults to us-east-1
AWS_SESSION_TOKEN=...  # Optional, for temporary credentials
LLM_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0  # Optional
```

**Note:** For production Bedrock usage, consider using AWS SDK (`@aws-sdk/client-bedrock-runtime`) instead of the manual signing implementation.

## Usage

The LLM providers can be used for:
1. **Intent Classification** - Semantic classification of tool calls (automatic)
2. **Custom Features** - Any other LLM-based functionality in the gateway

### Using the LLM Provider in Code

```typescript
import { getLLMProvider } from '../llm/index.js';
import type { LLMMessage } from '../llm/index.js';

const provider = getLLMProvider();
if (provider) {
  const messages: LLMMessage[] = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Classify this tool call...' },
  ];
  
  const response = await provider.chat(messages);
  console.log(response.content);
}
```

## Example .env File

```bash
# LLM Configuration
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=1000
```

## Fallback Behavior

If the LLM provider is not configured or fails:
- The system falls back to rule-based classification
- If rule-based also fails, conservative defaults are used (high risk, low confidence)
- All failures are logged for debugging

## Testing

To test your LLM configuration, ensure the environment variables are set and the gateway will automatically use the LLM classifier for unknown tools or low-confidence classifications.

