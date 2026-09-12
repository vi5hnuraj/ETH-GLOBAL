# GlobalPay Graph MCP

GlobalPay exposes its live Arc Subgraph as reusable MCP tools for AI clients.

## Standard MCP (stdio)

This is the recommended integration for Claude Desktop, Cursor, and MCP-compatible clients.

```json
{
  "mcpServers": {
    "globalpay-graph": {
      "command": "node",
      "args": ["/absolute/path/to/backend/mcp/graph-mcp-stdio.js"],
      "env": {
        "GRAPH_QUERY_URL": "https://api.studio.thegraph.com/query/1758639/globalpay-arc/version/latest",
        "GRAPH_API_KEY": "YOUR_GRAPH_API_KEY",
        "GRAPH_DEPLOYMENT_ID": "QmPzoTATA5b9aYPCvDGMdD7Xe6uejX3nXiPXhEDLuRpCbu",
        "GRAPH_NETWORK": "Arc Testnet"
      }
    }
  }
}
```

Tools exposed through the standard MCP protocol:

- `graph_status`: live indexed block and payment count.
- `analyze_provider`: trust, settlement, buyer, and risk evidence for a wallet.
- `ask_trust_engine`: natural-language provider ranking over live Graph data.

## HTTP Adapter

`graph-mcp-server.js` remains available for local HTTP integrations:

```bash
GRAPH_QUERY_URL="..." GRAPH_API_KEY="..." node mcp/graph-mcp-server.js
```

The HTTP adapter exposes `/health`, `/mcp/tools`, and `/mcp/call` on port `8931`.

Never commit `GRAPH_API_KEY` or any wallet/database secret.
