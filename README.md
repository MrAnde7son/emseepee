
# Agent Tools MCP Gateway (TypeScript, ESM)

This is a minimal **MCP server** that acts as a central tools gateway.

It exposes MCP tools you can plug into Cursor (or any MCP client) and:

- Route tool usage through a single gateway layer
- Apply simple per-tool / per-role policy decisions
- Log every intercepted tool call (POC behavior)

For now it provides two example tools:

- `file_read_gateway` – pretend file-read tool that logs the call
- `web_search_gateway` – pretend web-search tool that logs the call

You can later replace the stub logic with real calls to your HTTP gateway.

## Install

1. In the project folder:

   npm install
   npm run build

2. This will produce `dist/index.js` which is the MCP server entrypoint.

## Run directly (debug)

   node dist/index.js

You should see the line:

   Agent Tools MCP Gateway server starting...

The process then waits for MCP messages on stdio.

## Connect from Cursor via mcp.json

Create a project-level `.cursor/mcp.json` in the repo where you run this server:

{
  "mcpServers": {
    "agent-tools-gateway": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}

Then open Cursor and ensure the `agent-tools-gateway` MCP server is visible and enabled.

## Behavior

- Tools are registered via the MCP TypeScript SDK
- A tiny in-memory registry defines tool metadata and allowed roles
- A simple policy engine runs for each call
- Each tool call is logged to stdout with:
  - tool name
  - arguments
  - (fake) agent id / role
  - environment
  - decision and reason

Both tools currently just echo back a text message with the policy decision.
