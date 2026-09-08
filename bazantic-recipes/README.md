# GlobalPay Bazantic Recipes

These machine-readable recipes teach external AI agents how to use the existing
GlobalPay APIs. They are intentionally orchestration documents, not duplicate
wallet, marketplace, payment, or invoice implementations.

## Complete Loop

```text
Bazantic recipe
  -> GlobalPay marketplace
  -> Trust Engine powered by The Graph
  -> Arc USDC settlement
  -> existing service gateway
  -> invoice, usage, webhook, reputation
```

Recipes:

- `create-agent.json`: provision an agent and MPC wallet.
- `publish-service.json`: publish a discoverable service.
- `recommend-provider.json`: rank providers with Trust Engine signals.
- `buy-service.json`: analyze, pay, and invoke a service.
- `verify-payment.json`: verify payment and read invoice/usage results.
- `monitor-provider.json`: monitor provider activity and endpoint health.

## External discovery

The machine-readable capability manifest is available at:

```text
/.well-known/globalpay-agent.json
```

It points external agents to this cookbook, Trust Engine endpoints, and Arc
settlement. A Bazantic-compatible gateway can use this manifest as the public
entry point before selecting a recipe.

## Trust Engine requirement

`buy-service` and `recommend-provider` must run provider analysis before
payment. Provider analysis is live only when GlobalPay has a configured The
Graph provider and Subgraph query schema. The service returns raw indexed
payment evidence; GlobalPay's LLM decides which provider to select.
