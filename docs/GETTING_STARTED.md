# Getting Started

This guide walks through running EmSeePee Gateway locally with sensible defaults.

## Prerequisites
- Node.js 20 or later
- [pnpm](https://pnpm.io/) package manager

## Installation
```bash
pnpm install --frozen-lockfile
pnpm run build
```

## Running the MCP gateway
```bash
pnpm start
```
You should see `EmSeePee Gateway server starting...` and the server will await MCP traffic on stdio.

## Dashboard (optional)
The dashboard lets you administer tools and policies visually.
```bash
cd dashboard
pnpm install --frozen-lockfile
pnpm run dev
```
Then open http://localhost:1337 in your browser.

## Minimal workflow
1. Copy `.env.example` to `.env` and set any API keys you need (LLM, search providers, etc.).
2. Update `config.json` to enable the tools you want (built-in tools work without external credentials).
3. Connect an MCP client such as Cursor to the built gateway and invoke a built-in tool (e.g., file read/write).
