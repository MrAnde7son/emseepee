# Configuration Reference

Hakuna Gateway is configured through `config.json` and environment variables.

## Environment variables
Key variables live in `.env.example`:
- `JWT_SECRET` — secret used to sign dashboard tokens.
- `LLM_PROVIDER`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — LLM intent classification.
- `TAVILY_API_KEY`, `SERPAPI_KEY`, `GOOGLE_SEARCH_API_KEY`, `BING_SEARCH_API_KEY` — web search providers.
- Third-party tool tokens (e.g., `GITHUB_TOKEN`) referenced from `config.json`.

## MCP server proxies
Enable or disable proxies in `config.json`:
```json
{
  "mcpServerProxies": {
    "github": {
      "name": "github",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" },
      "enabled": false
    }
  }
}
```
Use `${VAR_NAME}` to substitute environment variables automatically.

## Policy engine
- Declare policy rules under `policyRules` with `allow`, `deny`, `log`, or `webhook` actions.
- Use conditions like `toolName`, `role`, `environment`, and `riskLevel` to scope policies.

## Safe defaults
- Third-party connectors are disabled until you provide credentials.
- Avoid committing secrets; rely on `.env` for sensitive values and keep `.env.example` updated.
