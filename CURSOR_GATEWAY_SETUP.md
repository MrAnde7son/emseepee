# Ensuring Cursor Uses Gateway Tools Instead of Native Tools

## Current Situation

Cursor provides both:
- **Native file tools**: `read_file`, `write`, `grep`, `glob_file_search`, etc.
- **MCP Gateway tools**: `mcp_agent-tools-gateway_file_read_gateway`, `mcp_agent-tools-gateway_file_write_gateway`, etc.

There is **no built-in Cursor setting** to disable native tools or force exclusive use of MCP tools. However, you can ensure gateway tools are used through the following approaches:

## Solution 1: Explicit Instructions to AI Assistant

The most reliable way is to **explicitly instruct the AI assistant** to use gateway tools. You can do this by:

1. **In your conversation**: Start with a message like:
   ```
   "Please use the MCP gateway tools (file_read_gateway, file_write_gateway, file_search_gateway) 
   for all file operations instead of the native file tools."
   ```

2. **In a project-level instruction file**: Create `.cursorrules` or add to your README with instructions for the AI to prefer gateway tools.

## Solution 2: Verify MCP Server Configuration

Ensure your MCP server is properly configured and connected:

1. **Create `.cursor/mcp.json`** in your project root (or workspace root):
```json
{
  "mcpServers": {
    "agent-tools-gateway": {
      "command": "node",
      "args": ["/Users/imizrahi/Downloads/agent-tools-gateway/dist/index.js"],
      "cwd": "/Users/imizrahi/Downloads/agent-tools-gateway"
    }
  }
}
```

2. **Verify in Cursor**:
   - Open Cursor Settings
   - Go to MCP Servers section
   - Ensure `agent-tools-gateway` is listed and **enabled**
   - Check that tools are visible (you should see `file_read_gateway`, `file_write_gateway`, `file_search_gateway`)

3. **Test the connection**:
   - The MCP server should start automatically when Cursor loads
   - Check Cursor's MCP logs/console for any connection errors

## Solution 3: Make Gateway Tools More Attractive

The AI assistant will naturally prefer tools that:
- Have clear, descriptive names
- Have good descriptions
- Are explicitly mentioned in context

Your gateway tools already have good descriptions. You can enhance them by ensuring they're the **only** file operation tools available, but this requires the AI to choose them.

## Solution 4: Tool Name Matching (Future Enhancement)

Consider renaming your gateway tools to match native tool names more closely, or use tool aliases if MCP supports them. However, this may not be possible with the current MCP SDK.

## Solution 5: Policy-Based Enforcement

Your gateway already has policy enforcement. You could:
1. Make the gateway tools perform **additional validation** that native tools don't
2. Add **audit logging** that's required for compliance
3. Add **rate limiting** or other controls

This makes gateway tools functionally different (and necessary) rather than just alternatives.

## Recommended Approach

**Combine Solutions 1 and 2**:
1. Set up the MCP server configuration properly
2. Explicitly instruct the AI assistant at the start of each session or in project documentation
3. Monitor tool usage through your gateway logs to verify compliance

## Verifying Gateway Tool Usage

You can verify that gateway tools are being used by:
1. Checking your gateway logs (stdout from the MCP server process)
2. Looking for log entries like `[MCP-GATEWAY] file_read_gateway call`
3. Monitoring Cursor's tool call history (if available in Cursor's UI)

## Current Limitations

- Cursor doesn't provide a UI setting to disable native tools
- The AI assistant has access to both tool sets simultaneously
- Tool selection is based on AI decision-making, not hard configuration
- You must rely on explicit instructions or make gateway tools functionally necessary

## Next Steps

1. ✅ Ensure `.cursor/mcp.json` exists and is configured correctly
2. ✅ Verify MCP server is running and tools are visible in Cursor
3. ✅ Add explicit instructions to use gateway tools in your project
4. ✅ Monitor gateway logs to verify tool usage
5. ⚠️ Consider implementing real file I/O in gateway tools (currently stubs) if you want them to be the only functional option

