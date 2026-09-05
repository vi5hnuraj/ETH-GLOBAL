/**
 * OpenAPI 3.0 specification for the GlobalPay AI Agent Platform.
 * Served at GET /api/openapi.json and referenced from the developer docs.
 */

const SERVER_URL = process.env.PUBLIC_API_URL || process.env.VITE_API_URL || 'https://api.globalpay.dev';

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'GlobalPay API — Bank for Bots',
    version: '1.1.0',
    description:
      'Headless wallets + API keys for autonomous AI agents on BOT Chain. Agents authenticate with a gpay_sk_ API key and pay gas-free from their wallet.'
  },
  servers: [{ url: SERVER_URL }],
  tags: [
    { name: 'Agents', description: 'Create and manage AI agents' },
    { name: 'Payments', description: 'Agent-scoped payments' },
    { name: 'Developer Platform', description: 'Dashboard, analytics, billing, webhooks, settings (gpay_dev_ key, scope-enforced)' },
    { name: 'Marketplace', description: 'AI Service Marketplace & Autonomous Billing: publish services (agent gpay_sk_ key or developer gpay_dev_ key), browse, report metered usage, auto-generated invoices, BOT settlement, revenue' },
    { name: 'Autonomous Commerce', description: 'Autonomous AI Commerce: company procurement policies, provider capability profiles, recommendation engine, purchase sessions, reputation, cost optimization, compliance' },
    { name: 'Organizations', description: 'Multi-tenant organizations + RBAC (members, invitations, roles, settings, audit). Org resolution order: path :orgId, X-Organization-Id header, ?organizationId, X-Organization-Slug, API key org, or the developer personal org.' },
    { name: 'Platform', description: 'Operational endpoints (health, feature flags, environment, maintenance)' }
  ],
  components: {
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'Bearer gpay_sk_... agent key'
      },
      developerApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description:
          'Bearer gpay_dev_... developer key. Scopes (resource:action): agents:create/read/update/delete, payments:create/read/refund/cancel, wallets:read/write, transactions:read, webhooks:read/create/update/delete, billing:read/manage, settings:read/manage (or the "*" wildcard for full access). Legacy scopes history:read and webhooks:manage remain accepted. Requests are rejected with 403 when the key lacks the required scope.'
      }
    },
    schemas: {
      Agent: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Agent identifier (agt_…)' },
          wallet: { type: 'string', description: 'Agent wallet address (0x…)' },
          walletAddress: { type: 'string', description: 'Agent wallet address (0x…)' },
          walletId: { type: 'string', description: 'Wallet provider id' },
          apiKey: { type: 'string', description: 'One-time agent API key (gpay_sk_…)' },
          apiKeyPrefix: { type: 'string', description: 'Prefix of the agent key' },
          network: { type: 'string', description: 'Network name (BOT Chain)' },
          chainId: { type: 'integer', description: 'Network chain id' }
        }
      },
      Balance: {
        type: 'object',
        properties: {
          wallet: { type: 'string', description: 'Wallet address queried' },
          balance: { type: 'string', description: 'Formatted BOT balance' },
          wei: { type: 'string', description: 'Raw balance in wei' }
        }
      },
      Payment: {
        type: 'object',
        properties: {
          txHash: { type: 'string', description: 'Transaction hash on BOT Chain' },
          from: { type: 'string', description: 'Sender address' },
          to: { type: 'string', description: 'Recipient address' },
          amount: { type: 'string', description: 'Payment amount in BOT' },
          token: { type: 'string', description: 'Token symbol (BOT)' },
          explorerUrl: { type: 'string', description: 'Link to the transaction explorer' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Human-readable error message' }
        }
      }
    }
  },
  paths: {
    '/agents/create': {
      post: {
        tags: ['Agents'],
        security: [{ developerApiKey: [] }],
        summary: 'Create an AI agent (headless wallet + API key)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  developerId: { type: 'string', description: 'Owner id (optional)' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Agent created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } }
          },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/agents/balance': {
      get: {
        tags: ['Agents'],
        security: [{ apiKey: [] }],
        summary: 'Get the agent wallet balance',
        responses: {
          '200': { description: 'Balance', content: { 'application/json': { schema: { $ref: '#/components/schemas/Balance' } } } },
          '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Per-agent rate limit or monthly quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/agents/pay': {
      post: {
        tags: ['Payments'],
        security: [{ apiKey: [] }],
        summary: 'Send a payment from the agent wallet',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to', 'amount'],
                properties: {
                  to: { type: 'string', description: 'Destination EVM address' },
                  amount: { type: 'string', description: 'Amount in BOT' },
                  wei: { type: 'string', description: 'Raw wei (mutually exclusive with amount)' },
                  token: { type: 'string', default: 'BOT' },
                  note: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Payment broadcast', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } },
          '400': { description: 'Invalid destination or amount', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Per-agent rate limit or monthly quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/agents/history': {
      get: {
        tags: ['Payments'],
        security: [{ apiKey: [] }],
        summary: 'List recent agent transactions',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
        ],
        responses: {
          '200': { description: 'Transaction history', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Payment' } } } } },
          '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Per-agent rate limit or monthly quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/agents/stats': {
      get: {
        tags: ['Agents'],
        security: [{ apiKey: [] }],
        summary: 'Payment statistics for the agent',
        responses: {
          '200': {
            description: 'Statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalPayments: { type: 'integer', description: 'Total number of confirmed payments' },
                    totalVolumeBOT: { type: 'string', description: 'Total BOT volume sent (formatted)' },
                    uniqueRecipients: { type: 'integer', description: 'Number of unique destination addresses' },
                    last7DaysVolumeBOT: { type: 'string', description: 'BOT volume in the last 7 days' },
                    last7DaysPayments: { type: 'integer', description: 'Payment count in the last 7 days' }
                  }
                }
              }
            }
          },
          '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Per-agent rate limit or monthly quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/agents/rotate-key': {
      post: {
        tags: ['Agents'],
        security: [{ apiKey: [] }],
        summary: 'Rotate the agent API key (old key is invalidated immediately)',
        responses: {
          '200': {
            description: 'New agent API key',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apiKey: { type: 'string', description: 'New one-time agent API key (gpay_sk_…)' },
                    apiKeyPrefix: { type: 'string', description: 'First 16 chars of the new key' }
                  }
                }
              }
            }
          },
          '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Per-agent rate limit or monthly quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/platform/health': {
      get: {
        tags: ['Platform'],
        summary: 'Live service status (API, database, RPC, workers)',
        description: 'Public operational health. Returns component statuses and overall state.',
        responses: {
          '200': { description: 'Health summary' },
          '500': { description: 'Health check failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/platform/flags': {
      get: {
        tags: ['Platform'],
        summary: 'Effective feature flags',
        responses: {
          '200': { description: 'Feature flag map' }
        }
      }
    },
    '/platform/environment': {
      get: {
        tags: ['Platform'],
        summary: 'Active runtime environment (development/production)',
        responses: {
          '200': { description: 'Environment + network configuration' }
        }
      }
    },
    '/developers/audit/export': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['settings:manage', 'settings:read'] }],
        summary: 'Export audit logs as CSV or JSON',
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'], default: 'json' } }
        ],
        responses: {
          '200': { description: 'CSV text or JSON array of audit log rows' },
          '429': { description: 'Developer quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/developers/quota': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['agents:read'] }],
        summary: 'Monthly request quota usage for the current org/developer',
        responses: {
          '200': { description: 'Quota usage' },
          '429': { description: 'Developer quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/developers/platform/maintenance': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['settings:manage'] }],
        summary: 'Toggle maintenance mode (operator action)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } }
          }
        },
        responses: {
          '200': { description: 'Maintenance state' },
          '429': { description: 'Developer quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/developers/agents/{agentId}/history': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['history:read', 'transactions:read'] }],
        summary: 'Agent transaction history with pagination',
        parameters: [
          { name: 'agentId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } }
        ],
        responses: {
          '200': { description: 'Paginated transaction history' },
          '429': { description: 'Developer quota exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/developers/scopes': {
      get: {
        tags: ['Developer Platform'],
        summary: 'List the supported developer API key scopes',
        responses: {
          '200': { description: 'Scope catalog' }
        }
      }
    },
    '/developers/agents': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['agents:read'] }],
        summary: 'List agents with live statistics',
        responses: {
          '200': { description: 'Agents' },
          '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Key lacks the agents:read scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      },
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['agents:create'] }],
        summary: 'Create an AI agent (headless wallet + one-time agent API key)',
        description: 'Returns the agentId, wallet address and a one-time gpay_sk_… agent key (shown exactly once).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Agent created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } } },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'Missing or invalid API key', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Key lacks the agents:create scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },
    '/developers/billing': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['billing:read', 'billing:manage'] }],
        summary: 'Current billing plan and invoices',
        responses: {
          '200': { description: 'Billing' },
          '403': { description: 'Key lacks the billing:read or billing:manage scope' }
        }
      }
    },
    '/developers/webhooks': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['webhooks:read', 'webhooks:manage'] }],
        summary: 'List webhook endpoints',
        responses: {
          '200': { description: 'Webhook endpoints' },
          '403': { description: 'Key lacks the webhooks:read or webhooks:manage scope' }
        }
      }
    },
    '/developers/api-keys': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['settings:manage'] }],
        summary: 'List developer API keys',
        responses: {
          '200': { description: 'API keys' },
          '403': { description: 'Key lacks the settings:manage scope' }
        }
      }
    },
    '/developers/api-keys/{id}': {
      patch: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['settings:manage'] }],
        summary: 'Update an API key (name, scopes, expiration, IP allowlist)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'scopes'],
                properties: {
                  name: { type: 'string' },
                  scopes: { type: 'array', items: { type: 'string' } },
                  expiresAt: { type: 'string', format: 'date-time' },
                  ipAllowlist: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Updated API key' },
          '403': { description: 'ROLE_FORBIDDEN / missing scope' },
          '409': { description: 'DUPLICATE_KEY_NAME' },
          '422': { description: 'VALIDATION' }
        }
      },
      delete: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['settings:manage'] }],
        summary: 'Revoke an API key permanently',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Key revoked' },
          '403': { description: 'ROLE_FORBIDDEN / missing scope' }
        }
      }
    },
    '/developers/usage': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['agents:read'] }],
        summary: 'API usage metrics for the current organization',
        description: 'Requests today/this month, success and error rates, latency, status buckets, top errors and endpoints.',
        responses: {
          '200': { description: 'Usage metrics' },
          '403': { description: 'Key lacks the agents:read scope' }
        }
      }
    },
    '/developers/requests': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['agents:read'] }],
        summary: 'List API request logs with filters',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'perPage', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'statusCode', in: 'query', schema: { type: 'integer' } },
          { name: 'method', in: 'query', schema: { type: 'string' } },
          { name: 'endpoint', in: 'query', schema: { type: 'string' } },
          { name: 'source', in: 'query', schema: { type: 'string' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } }
        ],
        responses: {
          '200': { description: 'Paginated request logs' },
          '403': { description: 'Key lacks the agents:read scope' }
        }
      }
    },
    '/developers/requests/export': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['agents:read'] }],
        summary: 'Export request logs as CSV or JSON',
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' } },
          { name: 'statusCode', in: 'query', schema: { type: 'integer' } },
          { name: 'method', in: 'query', schema: { type: 'string' } },
          { name: 'endpoint', in: 'query', schema: { type: 'string' } },
          { name: 'source', in: 'query', schema: { type: 'string' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } }
        ],
        responses: { '200': { description: 'CSV text or JSON array of request log rows' } }
      }
    },
    '/developers/audit': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: ['settings:manage'] }],
        summary: 'List audit trail for the organization',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'perPage', in: 'query', schema: { type: 'integer', default: 100 } }
        ],
        responses: {
          '200': { description: 'Audit logs' },
          '403': { description: 'Key lacks the settings:manage scope' }
        }
      }
    },

    // ---- Organizations + RBAC ----
    '/developers/orgs': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'List my organizations (org switcher)',
        description: 'Includes the lazily-provisioned personal org plus every org where the developer is an active member.',
        responses: {
          '200': { description: 'Organizations' },
          '401': { description: 'Missing or invalid API key' }
        }
      },
      post: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Create an organization',
        description: 'The creator becomes the owner. Returns the org. Also lazily provisions the personal org if missing.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Acme Corp' },
                  slug: { type: 'string', description: 'URL-safe unique slug (auto-generated if omitted)' },
                  avatarUrl: { type: 'string' },
                  metadata: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Organization created' },
          '400': { description: 'Validation error' },
          '409': { description: 'Slug already taken (SLUG_TAKEN)' }
        }
      }
    },
    '/developers/orgs/current': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Resolve the active organization',
        description: 'Returns the resolved org, the caller membership role and the permissions granted to that role.',
        responses: {
          '200': { description: 'Active organization, membership + permissions' },
          '403': { description: 'Not a member (ORG_FORBIDDEN)' },
          '404': { description: 'Unknown organization (ORG_NOT_FOUND)' }
        }
      }
    },
    '/developers/orgs/{orgId}': {
      patch: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Update organization profile (org.manage — owner only)',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated organization' }, '403': { description: 'ROLE_FORBIDDEN' } }
      },
      delete: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete an empty organization (org.manage — owner only)',
        description: 'Fails with 409 ORG_HAS_RESOURCES while the org still owns agents, API keys, webhooks or subscriptions.',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '403': { description: 'ROLE_FORBIDDEN' },
          '409': { description: 'ORG_HAS_RESOURCES' }
        }
      }
    },
    '/developers/orgs/{orgId}/members': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'List organization members (members.read)',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Members' }, '403': { description: 'ROLE_FORBIDDEN' } }
      }
    },
    '/developers/orgs/{orgId}/members/{memberId}/role': {
      post: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Change a member role (members.manage — owner/admin)',
        description: 'The owner role is immutable (OWNER_IMMUTABLE). Roles: admin, developer, billing_manager, viewer.',
        parameters: [
          { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'memberId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role: { type: 'string' } } } } }
        },
        responses: { '200': { description: 'Role updated' }, '400': { description: 'OWNER_IMMUTABLE / VALIDATION' }, '403': { description: 'ROLE_FORBIDDEN' } }
      }
    },
    '/developers/orgs/{orgId}/members/{memberId}': {
      delete: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Remove a member (members.manage — owner/admin)',
        parameters: [
          { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'memberId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Removed' }, '400': { description: 'OWNER_IMMUTABLE' }, '403': { description: 'ROLE_FORBIDDEN' } }
      }
    },
    '/developers/orgs/{orgId}/leave': {
      post: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Leave an organization',
        description: 'The owner cannot leave (OWNER_IMMUTABLE) — transfer ownership first.',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Left the organization' }, '400': { description: 'OWNER_IMMUTABLE' } }
      }
    },
    '/developers/orgs/{orgId}/transfer': {
      post: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Transfer ownership to an existing member (org.manage — owner only)',
        description: 'The old owner is demoted to admin.',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['toDeveloperId'], properties: { toDeveloperId: { type: 'string' } } } } }
        },
        responses: { '200': { description: 'Ownership transferred' }, '403': { description: 'ROLE_FORBIDDEN' } }
      }
    },
    '/developers/orgs/{orgId}/invitations': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'List pending invitations (invitations.read — owner/admin)',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Invitations' }, '403': { description: 'ROLE_FORBIDDEN' } }
      },
      post: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Invite a member (invitations.manage — owner/admin)',
        description: 'Roles: admin, developer, billing_manager, viewer (owner is never invitable). Duplicate pending invite → 409.',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['email', 'role'], properties: { email: { type: 'string', format: 'email' }, role: { type: 'string' } } }
            }
          }
        },
        responses: { '201': { description: 'Invitation created with accept URL' }, '400': { description: 'VALIDATION' }, '403': { description: 'ROLE_FORBIDDEN' }, '409': { description: 'DUPLICATE_INVITATION' } }
      }
    },
    '/developers/orgs/{orgId}/invitations/{token}': {
      delete: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Cancel a pending invitation (invitations.manage — owner/admin)',
        parameters: [
          { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'token', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Cancelled' }, '403': { description: 'ROLE_FORBIDDEN' } }
      }
    },
    '/developers/orgs/{orgId}/invitations/{token}/accept': {
      post: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Accept an invitation (no membership required — the token is the proof)',
        description: 'The invitee is identified by their X-Developer-Id. Expired → 400 INVITATION_EXPIRED.',
        parameters: [
          { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'token', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Joined the organization' }, '400': { description: 'INVITATION_EXPIRED / INVALID_INVITATION' } }
      }
    },
    '/developers/orgs/{orgId}/invitations/{token}/decline': {
      post: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Decline an invitation (no membership required)',
        parameters: [
          { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'token', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Declined' } }
      }
    },
    '/developers/invitations': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'My pending invitations (matched by ?email)',
        parameters: [{ name: 'email', in: 'query', required: true, schema: { type: 'string', format: 'email' } }],
        responses: { '200': { description: 'Pending invitations for the given email' } }
      }
    },
    '/developers/orgs/{orgId}/settings': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Get organization settings (settings.read)',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Settings' }, '403': { description: 'ROLE_FORBIDDEN' } }
      },
      patch: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Update organization settings (settings.manage — owner/admin)',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Updated settings' }, '403': { description: 'ROLE_FORBIDDEN' } }
      }
    },
    '/developers/orgs/{orgId}/audit-logs': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'List organization audit logs (audit.read — owner/admin)',
        parameters: [
          { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
        ],
        responses: { '200': { description: 'Audit logs' }, '403': { description: 'ROLE_FORBIDDEN' } }
      }
    },
    '/developers/orgs/{orgId}/roles': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Role catalog with descriptions and permission lists',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Roles catalog' } }
      }
    },
    '/developers/orgs/{orgId}/permissions': {
      get: {
        tags: ['Organizations'],
        security: [{ developerApiKey: [] }],
        summary: 'Permission catalog + the caller role and its permissions',
        parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Permission catalog' } }
      }
    },
    // ==================== Service Marketplace ====================
    '/agents/services': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'List services owned by the calling agent',
        responses: { '200': { description: 'Services' } }
      },
      post: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Publish a service (per_unit, per_hour, flat… pricing; unitPrice in BOT as decimal string)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '201': { description: 'Created service' } }
      }
    },
    '/agents/services/{serviceId}': {
      patch: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Update a service (title, description, category, pricingModel, unitPrice, unitLabel, isActive, metadata)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated service' } }
      },
      delete: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Delete a service (must have no invoices)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } }
      }
    },
    '/agents/marketplace': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Browse the marketplace (excludes own services). Query: q, category, sort=price|created, order=asc|desc, page, limit',
        responses: { '200': { description: 'Marketplace listing' } }
      }
    },
    '/agents/marketplace/{serviceId}': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Get a marketplace service (non-own)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Service' } }
      }
    },
    '/agents/usage': {
      post: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Report metered usage; auto-creates an invoice for the agent',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '201': { description: 'Usage recorded + invoice created' } }
      },
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'List usage reports for the calling agent (consumer and provider sides)',
        responses: { '200': { description: 'Usage reports' } }
      }
    },
    '/agents/invoices': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'List invoices for the calling agent',
        responses: { '200': { description: 'Invoices' } }
      }
    },
    '/agents/invoices/{invoiceId}/pay': {
      post: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Pay an invoice: BOT transfer to provider MPC wallet (balance-gated), idempotent via invoice code',
        parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Paid' } }
      }
    },
    '/agents/revenue': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Revenue & stats for the calling agent (services, units, invoices, gross)',
        responses: { '200': { description: 'Revenue stats' } }
      }
    },
    '/developers/services': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List services across the developer organization (services.read)',
        responses: { '200': { description: 'Services' } }
      },
      post: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Publish a service for an owned agent (services.manage)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '201': { description: 'Created service' } }
      }
    },
    '/developers/marketplace': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Browse the marketplace scoped to the developer organization (marketplace.read)',
        responses: { '200': { description: 'Marketplace listing' } }
      }
    },
    '/developers/marketplace/revenue': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Marketplace revenue/analytics for the developer organization (marketplace.read)',
        responses: { '200': { description: 'Revenue stats' } }
      }
    },
    '/developers/usage-reports': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List usage reports across the organization (usage.read)',
        responses: { '200': { description: 'Usage reports' } }
      }
    },
    '/developers/invoices': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List invoices across the organization (invoices.read)',
        responses: { '200': { description: 'Invoices' } }
      }
    },
    '/developers/invoices/{invoiceId}': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Get a single invoice (invoices.read)',
        parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Invoice' } }
      }
    },
    '/developers/invoices/{invoiceId}/pay': {
      post: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Pay an invoice on behalf of a consumer agent (invoices.pay)',
        parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Paid' } }
      }
    },
    // ==================== Autonomous Commerce ====================
    '/agents/commerce/policy': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Get the procurement policy for the calling agent organization (auto-creates a default)',
        responses: { '200': { description: 'Procurement policy' } }
      },
      put: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Upsert procurement policy: budget, regions, approved/blocked providers, GPU/VRAM/availability/trust/latency floors, auto-purchase, approval threshold',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Saved policy' } }
      }
    },
    '/agents/services/{serviceId}/capabilities': {
      put: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Upsert the capability profile for one of the calling agent services (models, GPU, regions, latency, uptime, rating)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Saved capability profile' } }
      }
    },
    '/agents/marketplace/recommend': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Recommend providers for a task, scored against the organization procurement policy (cost/trust/latency/availability)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Recommendations' } }
      }
    },
    '/agents/marketplace/sessions': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'List purchase sessions the calling agent participates in',
        responses: { '200': { description: 'Sessions' } }
      },
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Create a purchase session (policy gate: budget + approval threshold)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '201': { description: 'Session' } }
      }
    },
    '/agents/marketplace/sessions/{sessionId}': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Get a purchase session',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Session' } }
      },
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Reserved for session lifecycle actions',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Action' } }
      }
    },
    '/developers/commerce/policy': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Get the organization procurement policy (policy.read)',
        responses: { '200': { description: 'Procurement policy' } }
      },
      put: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Upsert the organization procurement policy (policy.manage)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Saved policy' } }
      }
    },
    '/developers/services/{serviceId}/capabilities': {
      put: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Update a service capability profile (agentId required; services.manage)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Saved capability profile' } }
      }
    },
    '/developers/marketplace/recommend': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Recommend providers for a task in the organization (commerce.read)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '200': { description: 'Recommendations' } }
      }
    },
    '/developers/commerce/sessions': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'List purchase sessions in the organization (sessions.read)',
        responses: { '200': { description: 'Sessions' } }
      },
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a purchase session under the organization policy (sessions.manage)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '201': { description: 'Session' } }
      }
    },
    '/developers/commerce/sessions/{sessionId}': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Get a purchase session (sessions.read)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Session' } }
      }
    },
    '/developers/commerce/optimization': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'AI cost-optimization: cheaper equivalent-capability alternatives with estimated monthly savings (commerce.read)',
        responses: { '200': { description: 'Recommendations' } }
      }
    },
    '/developers/commerce/dashboard': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Autonomous commerce operating dashboard: sessions, pending approvals, monthly spend/savings, provider trust, insights (commerce.read)',
        responses: { '200': { description: 'Dashboard' } }
      }
    },
    '/developers/commerce/graph': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Commerce knowledge graph: agent-to-service consumption and agent-to-agent purchase edges (commerce.read)',
        responses: { '200': { description: 'Graph' } }
      }
    },
    '/developers/commerce/reports/monthly': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Monthly procurement report: spend, revenue, sessions, top providers, compliance events (commerce.read)',
        responses: { '200': { description: 'Report' } }
      }
    },
    '/developers/commerce/compliance': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Compliance audit trail for autonomous commerce actions (policy, sessions, capabilities, usage, invoices)',
        responses: { '200': { description: 'Compliance logs' } }
      }
    },

    // ==================== V3 Business Network ====================
    '/developers/business/directory': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List companies in the business network directory (network.read)',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name, slug, or sector' }
        ],
        responses: { '200': { description: 'Directory entries', content: { 'application/json': { schema: { type: 'object', properties: { companies: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' }, sector: { type: 'string' } } } } } } } } } }
      }
    },
    '/developers/business/directory/{slug}': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Get a public company profile by slug (network.read)',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Company profile' } }
      }
    },
    '/developers/business/profile/extended': {
      patch: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Update extended company profile fields (network.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Updated profile' } }
      }
    },
    '/developers/business/relationships': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List business relationships (network.read)',
        responses: { '200': { description: 'Relationships list' } }
      }
    },
    '/developers/business/relationships/refresh': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Trigger a relationship graph refresh (network.manage)',
        responses: { '200': { description: 'Refresh initiated' } }
      }
    },
    '/developers/business/partnerships': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List partnership proposals and statuses (partnerships.read)',
        responses: { '200': { description: 'Partnerships list' } }
      }
    },
    '/developers/business/partnerships/{partnershipId}/respond': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Accept or decline a partnership proposal (partnerships.manage)',
        parameters: [{ name: 'partnershipId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { decision: { type: 'string', enum: ['accept', 'decline'] } } } } } },
        responses: { '200': { description: 'Response recorded' } }
      }
    },
    '/developers/business/projects': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List collaboration projects (projects.read)',
        responses: { '200': { description: 'Projects list' } }
      },
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a collaboration project (projects.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, slug: { type: 'string' } }, required: ['name'] } } } },
        responses: { '201': { description: 'Project created' } }
      }
    },
    '/developers/business/projects/{projectId}': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Get project detail with participants (projects.read)',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Project detail' } }
      }
    },
    '/developers/business/projects/{projectId}/participants': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Add a participant organization to a project (projects.manage)',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { orgId: { type: 'string' }, role: { type: 'string' } }, required: ['orgId'] } } } },
        responses: { '201': { description: 'Participant added' } }
      }
    },
    '/developers/business/workflow-marketplace': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Browse workflow templates in the marketplace (workflows.read)',
        responses: { '200': { description: 'Workflow templates' } }
      }
    },
    '/developers/business/workflow-marketplace/publish': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Publish a workflow template (workflows.publish)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Workflow published' } }
      }
    },
    '/developers/business/workflow-marketplace/{templateId}/install': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Install a workflow template into a project (workflows.install)',
        parameters: [
          { name: 'templateId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { projectId: { type: 'string' } } } } } },
        responses: { '201': { description: 'Workflow installed' } }
      }
    },
    '/developers/business/workflow-marketplace/installed': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List installed workflow templates (workflows.read)',
        responses: { '200': { description: 'Installed workflows' } }
      }
    },
    '/developers/business/trust-score': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Get organization trust score and reputation metrics (trust.read)',
        responses: { '200': { description: 'Trust score data' } }
      }
    },
    '/developers/business/trust-score/refresh': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Trigger trust score recomputation (network.manage)',
        responses: { '200': { description: 'Recomputation scheduled' } }
      }
    },
    '/developers/business/insights': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Get business insights and metrics (analytics.read)',
        responses: { '200': { description: 'Business insights' } }
      }
    },
    '/developers/business/network-dashboard': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Network-level dashboard metrics (analytics.read)',
        responses: { '200': { description: 'Network dashboard data' } }
      }
    },
    '/developers/business/activity': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Recent activity feed for the organization (audit.read)',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
        ],
        responses: { '200': { description: 'Activity feed' } }
      }
    },
    '/developers/business/activity/global': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Global activity feed across the network (analytics.read)',
        responses: { '200': { description: 'Global activity feed' } }
      }
    },
    '/developers/business/workspaces': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List enterprise workspaces (workspaces.read)',
        responses: { '200': { description: 'Workspaces list' } }
      },
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Create an enterprise workspace (workspaces.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, slug: { type: 'string' }, settings: { type: 'object' } }, required: ['name'] } } } },
        responses: { '201': { description: 'Workspace created' } }
      }
    },
    '/developers/business/workspaces/{workspaceId}': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Get workspace detail (workspaces.read)',
        parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Workspace detail' } }
      }
    },
    '/developers/business/workspaces/{workspaceId}/invite': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Invite an org to a workspace (workspaces.manage)',
        parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { orgId: { type: 'string' }, role: { type: 'string' } } } } } },
        responses: { '201': { description: 'Invitation sent' } }
      }
    },

    // ==================== Agent Marketplace ====================
    '/developers/agent-marketplace/agents-publishable': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List agents eligible for marketplace publishing (marketplace.read)',
        responses: { '200': { description: 'Publishable agents' } }
      }
    },
    '/developers/agent-marketplace/listings': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List your marketplace listings (marketplace.read)',
        responses: { '200': { description: 'Listings' } }
      },
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a new marketplace listing (marketplace.publish)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Listing created' } }
      }
    },
    '/developers/agent-marketplace/listing/{listingId}': {
      patch: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Update a listing (marketplace.publish)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Listing updated' } }
      },
      delete: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete a listing (marketplace.publish)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Listing deleted' } }
      }
    },
    '/developers/agent-marketplace/listing/{listingId}/versions': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Publish a new version of a listing (services.manage)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Version published' } }
      },
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List versions of a listing (marketplace.read)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Versions list' } }
      }
    },
    '/developers/agent-marketplace/browse': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Browse the agent marketplace (marketplace.read)',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
          { name: 'category', in: 'query', schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Browse results' } }
      }
    },
    '/developers/agent-marketplace/browse/{listingId}': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Get marketplace listing detail (marketplace.read)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Listing detail' } }
      }
    },
    '/developers/agent-marketplace/browse/{listingId}/reviews': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List reviews for a marketplace listing (marketplace.read)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Reviews' } }
      }
    },
    '/developers/agent-marketplace/install': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Install a marketplace listing (marketplace.install)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Installation created' } }
      }
    },
    '/developers/agent-marketplace/installations': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List installed agents (sessions.read)',
        responses: { '200': { description: 'Installations list' } }
      }
    },
    '/developers/agent-marketplace/installations/{installationId}': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Get installation detail (sessions.read)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Installation detail' } }
      },
      patch: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Update an installation (sessions.manage)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Installation updated' } }
      }
    },
    '/developers/agent-marketplace/installations/{installationId}/cancel': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Cancel an installation (sessions.manage)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Installation cancelled' } }
      }
    },
    '/developers/agent-marketplace/installations/{installationId}/invoke': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Invoke an installed agent (agents.execute)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Invocation result' } }
      }
    },
    '/developers/agent-marketplace/installations/{installationId}/review': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Submit a review for an installation (marketplace.read)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Review submitted' } }
      }
    },
    '/developers/agent-marketplace/subscriptions': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List marketplace subscriptions (billing.read)',
        responses: { '200': { description: 'Subscriptions list' } }
      }
    },
    '/developers/agent-marketplace/installations/{installationId}/subscription': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Change subscription tier (billing.manage)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Subscription changed' } }
      }
    },
    '/developers/agent-marketplace/installations/{installationId}/subscription/renew': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Renew a subscription (billing.manage)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Subscription renewed' } }
      }
    },
    '/developers/agent-marketplace/store/dashboard': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Provider dashboard metrics (revenue.read)',
        responses: { '200': { description: 'Provider dashboard data' } }
      }
    },
    '/developers/agent-marketplace/consumer/dashboard': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Consumer dashboard (usage.read)',
        responses: { '200': { description: 'Consumer dashboard data' } }
      }
    },

    // ==================== Network Workflows ====================
    '/developers/network/workflow-templates': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List workflow templates (sessions.read)',
        responses: { '200': { description: 'Workflow templates' } }
      },
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a workflow template (sessions.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Template created' } }
      }
    },
    '/developers/network/workflow-templates/{templateId}': {
      patch: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Update a workflow template (sessions.manage)',
        parameters: [{ name: 'templateId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Template updated' } }
      },
      delete: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete a workflow template (sessions.manage)',
        parameters: [{ name: 'templateId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Template deleted' } }
      }
    },
    '/developers/network/workflow-templates/{templateId}/deploy': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Deploy a workflow template as a runnable workflow (sessions.manage)',
        parameters: [{ name: 'templateId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Workflow deployed' } }
      }
    },
    '/developers/network/workflows': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List workflow runs (sessions.read)',
        responses: { '200': { description: 'Workflow runs' } }
      },
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Run a workflow (sessions.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Workflow run started' } }
      }
    },
    '/developers/network/workflows/{runId}': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Get workflow run detail (sessions.read)',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Workflow run detail' } }
      }
    },
    '/developers/network/workflows/{runId}/cancel': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Cancel a workflow run (sessions.manage)',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Workflow run cancelled' } }
      }
    },
    '/developers/network/smart-procurement': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Smart procurement: AI-recommended provider + cost analysis (commerce.read)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Procurement recommendation' } }
      }
    },
    '/developers/network/route': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Failover routing for service requests (sessions.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Routing decision' } }
      }
    },
    '/developers/network/profiles': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List public company profiles (marketplace.read)',
        responses: { '200': { description: 'Public profiles' } }
      }
    },
    '/developers/network/procurement/dashboard': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Procurement dashboard (commerce.read)',
        responses: { '200': { description: 'Procurement dashboard data' } }
      }
    },
    '/developers/network/analytics': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Network-level analytics (analytics.read)',
        responses: { '200': { description: 'Network analytics' } }
      }
    },
    '/developers/network/profile': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Get company profile (network.read)',
        responses: { '200': { description: 'Company profile' } }
      },
      put: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Upsert company profile (network.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Profile upserted' } }
      }
    },
    '/developers/network/analytics/timeline': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Network analytics timeline (commerce.read)',
        responses: { '200': { description: 'Timeline data' } }
      }
    },
    '/developers/network/analytics/activity': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Network activity feed (commerce.read)',
        responses: { '200': { description: 'Activity feed' } }
      }
    },
    '/developers/network/analytics/health': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Network health metrics (commerce.read)',
        responses: { '200': { description: 'Health metrics' } }
      }
    },
    '/developers/network/analytics/leaderboard': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Network provider leaderboard (commerce.read)',
        responses: { '200': { description: 'Leaderboard' } }
      }
    },

    // ==================== Developer Platform (missing from initial spec) ====================
    '/developers/dashboard': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Developer dashboard overview (agents.read)',
        responses: { '200': { description: 'Dashboard data with agents, usage, billing' } }
      }
    },
    '/developers/analytics': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Analytics overview (usage.read)',
        responses: { '200': { description: 'Analytics data' } }
      }
    },
    '/developers/revenue': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Revenue overview (billing.manage)',
        responses: { '200': { description: 'Revenue data' } }
      }
    },
    '/developers/requests': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'List API request logs with filters (usage.read)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'perPage', in: 'query', schema: { type: 'integer' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'method', in: 'query', schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Request logs' } }
      }
    },
    '/developers/requests/export': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Export request logs as CSV or JSON (usage.read)',
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'json'] } }
        ],
        responses: { '200': { description: 'Exported file' } }
      }
    },
    '/developers/monitoring': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Real-time monitoring metrics (usage.read)',
        responses: { '200': { description: 'Monitoring data' } }
      }
    },
    '/developers/settings': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Get developer settings (settings.read)',
        responses: { '200': { description: 'Settings object' } }
      },
      put: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Update developer settings (settings.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Settings updated' } }
      }
    },
    '/developers/billing/subscribe': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Subscribe to a billing plan (billing.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { plan: { type: 'string' } } } } } },
        responses: { '200': { description: 'Subscription created' } }
      }
    },
    '/developers/api-keys/{id}/rotate': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Rotate an API key — old key invalidated (keys.manage)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'New key returned (shown once)' } }
      }
    },
    '/developers/api-keys/{id}/revoke': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Revoke an API key (keys.manage)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Key revoked' } }
      }
    },
    '/developers/api-keys/{id}': {
      delete: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete an API key permanently (keys.manage)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Key deleted' } }
      }
    },
    '/developers/webhooks/events': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'List available webhook event types (webhooks.read)',
        responses: { '200': { description: 'Event types' } }
      }
    },
    '/developers/webhooks': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'List webhook endpoints (webhooks.read)',
        responses: { '200': { description: 'Webhook endpoints' } }
      },
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a webhook endpoint (webhooks.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' }, events: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { '201': { description: 'Webhook created' } }
      }
    },
    '/developers/webhooks/{id}': {
      put: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Update a webhook endpoint (webhooks.manage)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Webhook updated' } }
      },
      delete: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete a webhook endpoint (webhooks.manage)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Webhook deleted' } }
      }
    },
    '/developers/webhooks/deliveries': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'List webhook delivery attempts (webhooks.read)',
        responses: { '200': { description: 'Delivery logs' } }
      }
    },
    '/developers/webhooks/deliveries/{id}/retry': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Retry a failed webhook delivery (webhooks.manage)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Retry triggered' } }
      }
    },
    '/developers/webhooks/verify': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Verify webhook signature (webhooks.read)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Verification result' } }
      }
    },
    '/developers/agents/{agentId}': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Get agent detail (agents.read)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Agent detail' } }
      },
      delete: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete an agent (agents.manage)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Agent deleted' } }
      }
    },
    '/developers/agents/{agentId}/suspend': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Suspend an agent (agents.manage)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Agent suspended' } }
      }
    },
    '/developers/agents/{agentId}/resume': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Resume a suspended agent (agents.manage)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Agent resumed' } }
      }
    },
    '/developers/agents/{agentId}/balance': {
      get: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Get agent wallet balance (wallets.read)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Balance' } }
      }
    },
    '/developers/agents/{agentId}/pay': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Send payment from agent wallet (payments.create)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { to: { type: 'string' }, amount: { type: 'string' } } } } } },
        responses: { '200': { description: 'Payment sent' } }
      }
    },
    '/developers/agents/{agentId}/rotate-key': {
      post: {
        tags: ['Developer Platform'],
        security: [{ developerApiKey: [] }],
        summary: 'Rotate agent API key (agents.manage)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'New key (shown once)' } }
      }
    },
    '/developers/marketplace/recommend': {
      post: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'AI-recommended providers for a task (commerce.read)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { task: { type: 'string' } } } } } },
        responses: { '200': { description: 'Recommended providers' } }
      }
    },
    '/developers/services': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List services across the organization (services.read)',
        responses: { '200': { description: 'Service list' } }
      },
      post: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a new service (services.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, unitPrice: { type: 'number' } } } } } },
        responses: { '201': { description: 'Service created' } }
      }
    },
    '/developers/services/{serviceId}': {
      patch: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Update a service (services.manage)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Service updated' } }
      },
      delete: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete a service (services.manage)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Service deleted' } }
      }
    },
    '/developers/services/{serviceId}/capabilities': {
      put: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Update service capability profile (services.manage)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { models: { type: 'array', items: { type: 'string' } }, gpu: { type: 'string' }, regions: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { '200': { description: 'Capabilities updated' } }
      }
    },
    '/developers/usage-reports': {
      get: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List usage reports across the organization (usage.read)',
        responses: { '200': { description: 'Usage reports' } }
      },
      post: {
        tags: ['Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Report metered usage (usage.write)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { serviceId: { type: 'string' }, units: { type: 'number' } } } } } },
        responses: { '201': { description: 'Usage reported, invoice auto-created' } }
      }
    },
    '/developers/commerce/sessions': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a purchase session (sessions.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Session created' } }
      }
    },
    '/developers/commerce/prepaid': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a prepaid purchase intent (sessions.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Prepaid intent created' } }
      }
    },
    '/developers/commerce/prepaid/{sessionId}/confirm': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Confirm a prepaid purchase (sessions.manage)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Purchase confirmed' } }
      }
    },
    '/developers/commerce/sessions/{sessionId}/start': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Start a purchase session (sessions.manage)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Session started' } }
      }
    },
    '/developers/commerce/sessions/{sessionId}/cancel': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ developerApiKey: [] }],
        summary: 'Cancel a purchase session (sessions.manage)',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Session cancelled' } }
      }
    },

    // ==================== Agent-scoped endpoints (missing from initial spec) ====================
    '/agents/services': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'List services owned by the calling agent',
        responses: { '200': { description: 'Agent services' } }
      },
      post: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Create a service as an agent (services.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, unitPrice: { type: 'number' } } } } } },
        responses: { '201': { description: 'Service created' } }
      }
    },
    '/agents/services/{serviceId}': {
      patch: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Update a service (title, description, category, pricingModel, unitPrice, unitLabel, isActive, metadata)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Service updated' } }
      },
      delete: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Delete a service',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Service deleted' } }
      }
    },
    '/agents/marketplace': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Browse the marketplace (excludes own services). Query: q, category, sort=price|created, order=asc|desc, page, limit',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['price', 'created'] } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ],
        responses: { '200': { description: 'Marketplace listings' } }
      }
    },
    '/agents/marketplace/{serviceId}': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Get a marketplace service detail (non-own)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Service detail' } }
      }
    },
    '/agents/usage': {
      post: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Report metered usage; auto-creates an invoice for the agent',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { serviceId: { type: 'string' }, units: { type: 'number' } } } } } },
        responses: { '201': { description: 'Usage reported' } }
      },
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'List usage reports for the calling agent',
        responses: { '200': { description: 'Usage reports' } }
      }
    },
    '/agents/invoices': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'List invoices for the calling agent',
        responses: { '200': { description: 'Invoice list' } }
      }
    },
    '/agents/invoices/{invoiceId}/pay': {
      post: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Pay an invoice: BOT transfer to provider MPC wallet (balance-gated), idempotent via invoice code',
        parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Invoice paid, tx hash returned' } }
      }
    },
    '/agents/revenue': {
      get: {
        tags: ['Marketplace'],
        security: [{ apiKey: [] }],
        summary: 'Revenue & stats for the calling agent (services, units, invoices, gross)',
        responses: { '200': { description: 'Revenue stats' } }
      }
    },
    '/agents/commerce/policy': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Get the procurement policy for the calling agent organization (auto-creates a default)',
        responses: { '200': { description: 'Procurement policy' } }
      },
      put: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Update procurement policy',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Policy updated' } }
      }
    },
    '/agents/services/{serviceId}/capabilities': {
      put: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Upsert the capability profile for one of the calling agent services (models, GPU, regions, latency, uptime, rating)',
        parameters: [{ name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Capabilities upserted' } }
      }
    },
    '/agents/marketplace/recommend': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Recommend providers for a task, scored against the organization procurement policy (cost/trust/latency/availability)',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { task: { type: 'string' } } } } } },
        responses: { '200': { description: 'Ranked recommendations' } }
      }
    },
    '/agents/marketplace/sessions': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'List purchase sessions the calling agent participates in',
        responses: { '200': { description: 'Session list' } }
      },
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Create a purchase session',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Session created' } }
      }
    },
    '/agents/marketplace/sessions/{sessionId}': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Get a purchase session',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Session detail' } }
      }
    },
    '/agents/marketplace/sessions/{sessionId}/start': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Start a purchase session',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Session started' } }
      }
    },
    '/agents/marketplace/sessions/{sessionId}/cancel': {
      post: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Cancel a purchase session',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Session cancelled' } }
      }
    },
    '/agents/reputation': {
      get: {
        tags: ['Autonomous Commerce'],
        security: [{ apiKey: [] }],
        summary: 'Get agent reputation and trust score',
        responses: { '200': { description: 'Reputation data' } }
      }
    },

    // ==================== Agent Marketplace (developer-scoped, missing) ====================
    '/developers/agent-marketplace/agents/{agentId}/publish': {
      post: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Publish an agent to the marketplace (services.manage)',
        parameters: [{ name: 'agentId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, price: { type: 'number' } } } } } },
        responses: { '201': { description: 'Agent published as listing' } }
      }
    },
    '/developers/agent-marketplace/listing/{listingId}': {
      delete: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Delete a marketplace listing (services.manage)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Listing deleted' } }
      }
    },
    '/developers/agent-marketplace/listing/{listingId}/versions': {
      get: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'List versions of a listing (services.read)',
        parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Version list' } }
      }
    },
    '/developers/agent-marketplace/installations/{installationId}': {
      patch: {
        tags: ['AI Agent Marketplace'],
        security: [{ developerApiKey: [] }],
        summary: 'Update an installation (sessions.manage)',
        parameters: [{ name: 'installationId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Installation updated' } }
      }
    },
    '/developers/network/workflow-templates': {
      get: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'List workflow templates (sessions.read)',
        responses: { '200': { description: 'Template list' } }
      },
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Create a workflow template (sessions.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Template created' } }
      }
    },
    '/developers/network/workflows': {
      post: {
        tags: ['Business Network'],
        security: [{ developerApiKey: [] }],
        summary: 'Run a workflow (sessions.manage)',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Workflow run started' } }
      }
    }
  }
};
