import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import CodeBlock from '../../components/dev/CodeBlock';
import CopyButton from '../../components/dev/CopyButton';
import { ENDPOINTS, BASE_URL } from '../../utils/endpointCatalog';
import { LANGUAGES, generateCode } from '../../utils/codeSnippets';
import developerApi from '../../utils/developerApi';
import useApi from '../../hooks/useApi';

const PROD_BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'https://api.globalpay.io/api';
const DEV_BASE = import.meta.env.PROD ? PROD_BASE : (import.meta.env.VITE_API_URL || 'http://localhost:5550/api');

const SECTION_NAV = [
  { id: 'overview', title: 'Overview' },
  { id: 'authentication', title: 'Authentication' },
  { id: 'api-keys', title: 'API Keys' },
  { id: 'organizations', title: 'Organizations' },
  { id: 'members', title: 'Members & RBAC' },
  { id: 'agents', title: 'AI Agents' },
  { id: 'marketplace', title: 'AI Marketplace' },
  { id: 'services', title: 'AI Services' },
  { id: 'workflows', title: 'Workflow Marketplace' },
  { id: 'commerce', title: 'Commerce & Purchases' },
  { id: 'usage', title: 'Usage Metering' },
  { id: 'invoices', title: 'Invoice Settlement' },
  { id: 'payments', title: 'Payments' },
  { id: 'wallets', title: 'Wallets' },
  { id: 'business-network', title: 'Business Network' },
  { id: 'projects', title: 'Projects' },
  { id: 'partnerships', title: 'Partnerships' },
  { id: 'workspaces', title: 'Workspaces' },
  { id: 'trust-score', title: 'Trust Score' },
  { id: 'revenue', title: 'Revenue APIs' },
  { id: 'analytics', title: 'Analytics' },
  { id: 'endpoints', title: 'Endpoints' },
  { id: 'errors', title: 'Errors' },
  { id: 'rate-limits', title: 'Rate Limits' },
  { id: 'sdk', title: 'SDKs' },
  { id: 'webhooks', title: 'Webhooks' },
  { id: 'playground', title: 'Developer Playground' },
];

const SDK_INSTALL = {
  javascript: `npm install globalpay`,
  python: `pip install globalpay`,
  go: `go get github.com/globalpay/globalpay-go`,
  java: `./build.sh   # no Maven required`,
  php: `composer require globalpay/globalpay-php`
};

const SDK_QUICKSTART = {
  javascript: `const { GlobalPay } = require('globalpay');

const gp = new GlobalPay();

// 1. Create a developer key (gpay_dev_…) in the API Management page.
// 2. Create an agent -> mints a wallet + a one-time agent key (gpay_sk_…)
const { agentId, walletAddress, walletId, apiKey } = await gp.agents.create({
  name: 'Travel AI'
});

// 2. Agent-scoped client from the one-time key
const agent = gp.agent(apiKey);

const balance  = await agent.balance();                       // 1.234567 USDC
const result   = await agent.pay({ to: '0x…', amount: '0.02' }); // { txHash, explorerUrl }
const history  = await agent.history({ limit: 50 });
const stats    = await agent.stats();
const rotated  = await agent.rotateKey(); // returns a new one-time apiKey

// ── V3: Marketplace & Services ──
const service = await gp.services.publish({
  name: 'Travel AI Booking Service',
  pricePerCall: 0.05,
  sla: 'professional'
});

const listings = await gp.marketplace.browse({ query: 'travel', serviceType: 'orchestrator' });
const install  = await gp.marketplace.install({ listingId: listings[0].listingId, projectId: 'proj_123' });

// Invoke an installed agent with smart-procurement routing
const invocation = await agent.invoke({
  agentId: install.agentId,
  payload: { action: 'book', destination: 'LAX' }
});

// Stateful session for multi-turn conversation
const session  = await agent.sessions.create({ agentId: install.agentId });
await session.invoke({ action: 'get_status' });

// ── V3: Commerce (Usage, Invoicing, Payments) ──
const usage    = await agent.reportUsage({ subscriptionId: 'sub_abc', units: 150 });
const invoice  = await agent.generateInvoice({ recipientId: 'org_xyz', items: [{ description: 'API usage', amount: 7.50, currency: 'USD' }] });
const paid     = await agent.payInvoice({ id: invoice.id });

// ── V3: Business Network ──
const networkProfile = await gp.network.profile();
const partnerStatus  = await gp.network.trustScore('directory_entity_id');
const projects       = await gp.projects.list({ orgId: 'org_xyz' });
const project        = await gp.projects.create({ name: 'My Project', orgId: 'org_xyz' });
  `,
  python: `from globalpay import GlobalPay, Agent

gp = GlobalPay()

# 1. Create an agent -> mints a wallet + one-time API key
created = gp.agents.create(name="Travel AI", developer_id="user_123")
api_key = created["apiKey"]  # shown exactly once

# 2. Agent-scoped client
agent = Agent(api_key)

balance = agent.balance()                    # "1.234567 USDC"
result  = agent.pay(to="0x…", amount="0.02") # { "txHash": "0x…", ... }
history = agent.history(limit=50)
stats   = agent.stats()
rotated = agent.rotate_key()

# ── V3: Marketplace & Services ──
service = gp.services.publish(name="Travel AI Booking Service", price_per_call=0.05, sla="professional")

listings = gp.marketplace.browse(query="travel", service_type="orchestrator")
install  = gp.marketplace.install(listing_id=listings[0]["listing_id"], project_id="proj_123")

# Invoke an installed agent with smart-procurement routing
invocation = agent.invoke(agent_id=install["agent_id"], payload={"action": "book", "destination": "LAX"})

# Stateful session for multi-turn conversation
session  = agent.sessions.create(agent_id=install["agent_id"])
session.invoke(payload={"action": "get_status"})

# ── V3: Commerce (Usage, Invoicing, Payments) ──
usage    = agent.report_usage(subscription_id="sub_abc", units=150)
invoice  = agent.generate_invoice(recipient_id="org_xyz", items=[{"description": "API usage", "amount": 7.50, "currency": "USD"}])
paid     = agent.pay_invoice(invoice_id=invoice["id"])

# ── V3: Business Network ──
network_profile = gp.network.profile()
partner_status  = gp.network.trust_score("directory_entity_id")
projects        = gp.projects.list(org_id="org_xyz")
project         = gp.projects.create(name="My Project", org_id="org_xyz")
`,
  go: `import "github.com/globalpay/globalpay-go/globalpay"

client := globalpay.NewClient("") // defaults to production
ctx := context.Background()

// 1. Create an agent -> mints a wallet + one-time API key
created, err := client.CreateAgent(ctx, "Travel AI", "Books flights", "user_123")
if err != nil { log.Fatal(err) }

// 2. Agent-scoped client from the one-time key
agent := client.Agent(created.APIKey)

bal, _ := agent.Balance(ctx)     // "1.234567 USDC"
result, _ := agent.Pay(ctx, globalpay.PayParams{To: "0x…", Amount: "0.02"})
history, _ := agent.History(ctx, 50)
stats, _ := agent.Stats(ctx)
rotated, _ := agent.RotateKey(ctx) // returns a new one-time apiKey

// ── V3: Marketplace & Services ──
svc, _ := gp.Services.Publish(ctx, globalpay.PublishParams{
    Name: "Travel AI Booking Service",
    PricePerCall: 0.05,
    SLA: "professional",
})

listings, _ := gp.Marketplace.Browse(ctx, globalpay.BrowseParams{Query: "travel", ServiceType: "orchestrator"})
install, _ := gp.Marketplace.Install(ctx, globalpay.InstallParams{
    ListingID: listings[0].ListingID, ProjectID: "proj_123",
})

// Invoke an installed agent with smart-procurement routing
invocation, _ := agent.Invoke(ctx, globalpay.InvokeParams{
    AgentID: install.AgentID,
    Payload: map[string]interface{}{"action": "book", "destination": "LAX"},
})

// Stateful session
session, _ := agent.Sessions.Create(ctx, globalpay.SessionParams{AgentID: install.AgentID})
session.Invoke(ctx, globalpay.InvokeParams{Payload: map[string]interface{}{"action": "get_status"}})

// ── V3: Commerce ──
usage, _ := agent.ReportUsage(ctx, globalpay.UsageParams{SubscriptionID: "sub_abc", Units: 150})
invoice, _ := agent.GenerateInvoice(ctx, globalpay.InvoiceParams{RecipientID: "org_xyz", Items: []globalpay.LineItem{
    {Description: "API usage", Amount: 7.50, Currency: "USD"},
}})
paid, _ := agent.PayInvoice(ctx, invoice.ID)

// ── V3: Business Network ──
netProfile, _ := gp.Network.Profile(ctx)
trust, _ := gp.Network.TrustScore(ctx, "directory_entity_id")
projects, _ := gp.Projects.List(ctx, "org_xyz")
project, _ := gp.Projects.Create(ctx, globalpay.ProjectParams{Name: "My Project", OrgID: "org_xyz"})
  `,
  java: `GlobalPay gp = new GlobalPay(); // defaults to production

// 1. Create an agent -> mints a wallet + one-time API key
String created = gp.createAgent("Travel AI", "Books flights", "user_123");
System.out.println(created);

// 2. Agent-scoped client from the one-time key
Agent agent = gp.agent(apiKey); // apiKey from the create response

    System.out.println(agent.balance());   // JSON
    System.out.println(agent.pay("0x…", "0.02", null, "USDC", null));
    System.out.println(agent.history(50));
    System.out.println(agent.stats());
    System.out.println(agent.rotateKey());

    // ── V3: Marketplace & Services ──
    Service service = gp.services().publish(new PublishParams()
        .name("Travel AI Booking Service")
        .pricePerCall(0.05)
        .sla("professional"));

    List<Listing> listings = gp.marketplace().browse("travel", "orchestrator");
    Install install = gp.marketplace().install(listings.get(0).listingId, "proj_123");

    // Invoke an installed agent with smart-procurement routing
    Invocation inv = agent.invoke(new InvokeParams()
        .agentId(install.agentId)
        .payload(Map.of("action", "book", "destination", "LAX")));

    // Stateful session
    Session session = agent.sessions().create(new SessionParams().agentId(install.agentId));
    session.invoke(new InvokeParams().payload(Map.of("action", "get_status")));

    // ── V3: Commerce (Usage, Invoicing, Payments) ──
    Usage usage = agent.reportUsage("sub_abc", 150);
    Invoice invoice = agent.generateInvoice("org_xyz", List.of(
        new LineItem("API usage", 7.50, "USD")));
    agent.payInvoice(invoice.id);

    // ── V3: Business Network ──
    NetworkProfile net = gp.network().profile();
    Double trust = gp.network().trustScore("directory_entity_id");
    List<Project> projects = gp.projects().list("org_xyz");
    Project project = gp.projects().create("My Project", "org_xyz");
    `,
  php: `use GlobalPay\\GlobalPay;

$gp = new GlobalPay(); // defaults to production

// 1. Create an agent -> mints a wallet + one-time API key
$created = $gp->createAgent('Travel AI', 'Books flights', 'user_123');

// 2. Agent-scoped client from the one-time key
$agent = $gp->agent($created['apiKey']);

echo $agent->balance()['balance'];              // "1.234567 USDC"
$agent->pay('0x…', '0.02');
$agent->history(50);
$agent->stats();
$agent->rotateKey();

// ── V3: Marketplace & Services ──
$service = $gp->services()->publish([
    'name' => 'Travel AI Booking Service',
    'pricePerCall' => 0.05,
    'sla' => 'professional'
]);

$listings = $gp->marketplace()->browse(['query' => 'travel', 'serviceType' => 'orchestrator']);
$install  = $gp->marketplace()->install($listings[0]['listingId'], 'proj_123');

// Invoke an installed agent with smart-procurement routing
$invocation = $agent->invoke($install['agentId'], ['action' => 'book', 'destination' => 'LAX']);

// Stateful session
$session = $agent->sessions()->create($install['agentId']);
$session->invoke(['action' => 'get_status']);

// ── V3: Commerce (Usage, Invoicing, Payments) ──
$usage = $agent->reportUsage('sub_abc', 150);
$invoice = $agent->generateInvoice('org_xyz', [
    ['description' => 'API usage', 'amount' => 7.50, 'currency' => 'USD']
]);
$agent->payInvoice($invoice['id']);

// ── V3: Business Network ──
$netProfile = $gp->network()->profile();
$trust = $gp->network()->trustScore('directory_entity_id');
$projects = $gp->projects()->list('org_xyz');
$project = $gp->projects()->create('My Project', 'org_xyz');
`
};

const DevDocs = () => {
  const [env, setEnv] = useState('development');
  const base = env === 'production' ? PROD_BASE : DEV_BASE;
  const [sdkLang, setSdkLang] = useState('javascript');
  const [rawLang, setRawLang] = useState('curl');
  const [rawEndpointId, setRawEndpointId] = useState('create-agent');
  const openapi = useApi({ fetcher: developerApi.openapi });
  const sdkCode = generateCode(ENDPOINTS.find(e => e.id === rawEndpointId) || ENDPOINTS[0], { base, apiKey: 'gpay_dev_…' });

  const EndpointSection = ({ e }) => (
    <div className="mb-6">
      <h3 className="font-mono text-sm font-bold text-white mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded mr-2 ${e.method === 'GET' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-blue-900/40 text-blue-400'}`}>
          {e.method}
        </span>
        {e.path}
      </h3>
      <p className="text-sm text-zinc-400 mb-3">{e.summary}</p>
      <p className="text-xs text-zinc-600 mb-3"><span className="text-zinc-400 font-medium">Auth:</span> <code className="text-zinc-400">{e.auth}</code></p>
      {e.params.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase text-zinc-600 font-medium mb-1">Parameters</p>
          <div className="space-y-1">
            {e.params.map((p) => (
              <div key={p.name} className="flex items-start gap-3 text-xs">
                <code className="font-mono text-zinc-300 w-40 shrink-0">{p.name} {p.required && <span className="text-red-400">*</span>}</code>
                <span className="text-zinc-600">{p.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <CodeBlock title="Example request" language="http" code={e.exampleRequest(base)} />
        <CodeBlock title="Response schema" language="json" code={e.exampleResponse(openapi.data)} />
      </div>
    </div>
  );

  return (
    <div className="flex gap-8">
      <aside className="hidden lg:block w-56 shrink-0">
        <nav className="sticky top-8 space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Documentation</p>
          {SECTION_NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="block px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-zinc-900">
              {n.title}
            </a>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Documentation</h1>
          <p className="text-sm text-zinc-500 mt-1">Build financial rails for autonomous AI agents on Arc Chain.</p>

          <div className="flex items-center gap-2 mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
            <span className="text-xs text-zinc-600 px-2">Base URL:</span>
            {['development', 'production'].map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${env === e ? 'bg-blue-600/30 text-blue-300' : 'text-zinc-500 hover:text-white'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <code className="font-mono text-xs text-blue-400 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-2">
              {base}
              <CopyButton text={base} label="" className="px-1.5 py-0.5" />
            </code>
          </div>
        </header>

        <section id="overview" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Overview</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            GlobalPay is <strong className="text-white">financial infrastructure for autonomous AI agents on Arc Chain</strong>.
            Create a headless wallet for your bot in one request — no human login required. There are two key types:
            a <strong className="text-violet-300">Developer key</strong> (<code className="text-violet-400">gpay_dev_…</code>) that manages agents and platform resources, and an{' '}
            <strong className="text-cyan-300">AI Agent Runtime key</strong> (<code className="text-cyan-400">gpay_sk_…</code>) used by the agent itself to pay, check balances, and read history.
          </p>
          <ol className="list-decimal list-inside text-sm text-zinc-400 space-y-2 mt-4">
            <li>Create an agent with <code className="text-blue-400">POST /developers/agents</code> (developer key) to mint a wallet + agent API key.</li>
            <li>Store the agent key server-side — it is returned only once.</li>
            <li>Send payments with <code className="text-blue-400">POST /agents/pay</code> using <code className="text-blue-400">Authorization: Bearer gpay_sk_…</code>.</li>
          </ol>
        </section>

        <section id="authentication" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Authentication</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-zinc-950/50 border border-violet-900/40 rounded-xl p-3">
              <p className="text-sm font-semibold text-violet-300 mb-1">Developer API</p>
              <p className="text-xs text-zinc-500 mb-2">Manage agents, keys, webhooks and billing. Scoped to specific permissions.</p>
              <CodeBlock title="Header" language="http" code={`Authorization: Bearer gpay_dev_xxxxxxxxxxxxx`} />
            </div>
            <div className="bg-zinc-950/50 border border-cyan-900/40 rounded-xl p-3">
              <p className="text-sm font-semibold text-cyan-300 mb-1">AI Agent Runtime API</p>
              <p className="text-xs text-zinc-500 mb-2">The agent itself. One key per agent, used to pay and read balance.</p>
              <CodeBlock title="Header" language="http" code={`Authorization: Bearer gpay_sk_xxxxxxxxxxxxx`} />
            </div>
          </div>
          <div className="text-sm text-zinc-500 mt-3">HTTP <code className="text-red-400">401</code> is returned for missing, invalid, or revoked keys.</div>
        </section>

        <section id="api-keys" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">API Keys</h2>
          <p className="text-sm text-zinc-400">
            Keys are hashed at rest (SHA-256) — GlobalPay never stores the raw secret. Two key types: a{' '}
            <strong className="text-violet-300">Developer key</strong> (<code className="text-blue-400">gpay_dev_…</code>) for the
            <code className="text-blue-400"> /developers/*</code> APIs, and an <strong className="text-cyan-300">Agent key</strong> (
            <code className="text-blue-400">gpay_sk_…</code>) returned when an agent is created — rotate it anytime via{' '}
            <code className="text-blue-400">POST /agents/rotate-key</code>; the previous key is immediately invalidated.
          </p>
        </section>

        <section id="organizations" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Organizations</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            GlobalPay is a multi-tenant platform. Every API resource is scoped to an {' '}
            <strong className="text-white">organization</strong> — a workspace that isolates agents, API
            keys, webhooks, billing, analytics and members. Organization context is resolved per-request
            in this order: path <code className="text-zinc-300">/orgs/{'{orgId}'}</code> → <code className="text-zinc-300">X-Organization-Id</code> header → query param → slug header → API key's org → personal org.
          </p>
          <div className="text-sm text-zinc-400 mt-4 space-y-1">
            <div><code className="text-blue-400">GET /developers/orgs</code> — List your organizations</div>
            <div><code className="text-blue-400">POST /developers/orgs</code> — Create an organization (scope: <code className="text-indigo-300">organizations.write</code>)</div>
            <div><code className="text-blue-400">GET /developers/orgs/current</code> — Resolve the active organization</div>
            <div><code className="text-blue-400">PATCH /developers/orgs/{'{orgId}'}</code> — Update name, avatar, metadata (scope: <code className="text-indigo-300">organizations.write</code>)</div>
            <div><code className="text-blue-400">DELETE /developers/orgs/{'{orgId}'}</code> — Delete an empty organization</div>
          </div>
        </section>

        <section id="members" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Members &amp; RBAC</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Invite team members to an organization and assign them one of five hierarchical roles:
            <code className="text-zinc-300">owner</code>, <code className="text-zinc-300">admin</code>, {' '}
            <code className="text-zinc-300">developer</code>, <code className="text-zinc-300">billing_manager</code>, {' '}
            <code className="text-zinc-300">viewer</code>. Each role is backed by an explicit permission set
            (see the RBAC matrix below). Role-based access control is enforced on every protected endpoint.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/orgs/{'{orgId}'}/members</code> — List members (scope: <code className="text-indigo-300">members.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/orgs/{'{orgId}'}/members</code> — Invite a member (scope: <code className="text-indigo-300">members.write</code>)</div>
            <div><code className="text-blue-400">PATCH /developers/orgs/{'{orgId}'}/members/{'{memberId}'}/role</code> — Change role</div>
            <div><code className="text-blue-400">DELETE /developers/orgs/{'{orgId}'}/members/{'{memberId}'}</code> — Remove member</div>
            <div><code className="text-blue-400">GET /developers/orgs/{'{orgId}'}/roles</code> — Role → permission catalog</div>
            <div><code className="text-blue-400">GET /developers/orgs/{'{orgId}'}/permissions</code> — Effective permissions for the current member</div>
          </div>
          <table className="mt-4 w-full table-auto text-left text-xs">
            <thead><tr className="text-zinc-600"><th className="pb-1">Role</th><th className="pb-1">Scope</th><th className="pb-1">Description</th></tr></thead>
            <tbody>
              <tr><td className="py-1 pr-2">owner</td><td className="py-1 pr-2 text-zinc-500">Full control</td><td className="py-1">Org settings, members, billing, agents, keys, webhooks</td></tr>
              <tr><td className="py-1 pr-2">admin</td><td className="py-1 pr-2 text-zinc-500">Management</td><td className="py-1">Members, agents, keys, webhooks, settings — no ownership transfer</td></tr>
              <tr><td className="py-1 pr-2">developer</td><td className="py-1 pr-2 text-zinc-500">Build &amp; transact</td><td className="py-1">Agents, keys, payments; read-only billing</td></tr>
              <tr><td className="py-1 pr-2">billing_manager</td><td className="py-1 pr-2 text-zinc-500">Billing focus</td><td className="py-1">Billing, invoices, usage; read-only agents/keys</td></tr>
              <tr><td className="py-1 pr-2">viewer</td><td className="py-1 pr-2 text-zinc-500">Read-only</td><td className="py-1">View across agents, analytics, usage, billing</td></tr>
            </tbody>
          </table>
        </section>

        <section id="agents" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">AI Agents</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            An AI agent is a headless wallet on Arc Chain with its own API key (<code className="text-cyan-400">gpay_sk_…</code>).
            Create one in a single request — the platform mints a wallet, generates an agent key, and returns
            everything needed to start transacting programmatically. Agent keys are scope-limited to the
            owning agent's own operations.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">POST /developers/agents</code> — Create an agent (scope: <code className="text-indigo-300">agents.write</code>)</div>
            <div><code className="text-blue-400">GET /developers/agents</code> — List agents (scope: <code className="text-indigo-300">agents.read</code>)</div>
            <div><code className="text-blue-400">GET /developers/agents/{'{agentId}'}</code> — Agent detail</div>
            <div><code className="text-blue-400">POST /developers/agents/{'{agentId}'}/suspend</code> — Suspend an agent</div>
            <div><code className="text-blue-400">POST /developers/agents/{'{agentId}'}/resume</code> — Resume an agent</div>
            <div><code className="text-blue-400">DELETE /developers/agents/{'{agentId}'}</code> — Delete an agent</div>
            <div><code className="text-blue-400">POST /developers/agents/{'{agentId}'}/rotate-key</code> — Rotate the agent key</div>
          </div>
          <p className="text-sm text-zinc-500 mt-4">Agent Runtime API (using <code className="text-cyan-400">gpay_sk_…</code>):</p>
          <div className="mt-2 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /agents/balance</code> — Read wallet balance</div>
            <div><code className="text-blue-400">POST /agents/pay</code> — Send a payment (scope: <code className="text-indigo-300">payments.send</code>)</div>
            <div><code className="text-blue-400">GET /agents/history</code> — Transaction history</div>
            <div><code className="text-blue-400">GET /agents/stats</code> — Payment statistics</div>
          </div>
        </section>

        <section id="marketplace" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">AI Marketplace</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            The AI Marketplace is a catalog of AI agents and AI services published by organizations.
            Discover, install, and rate agents and services. Published offerings are automatically
            discoverable by other organizations with monetized invocation and revenue attribution.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/marketplace</code> — Browse catalog (scope: <code className="text-indigo-300">marketplace.read</code>)</div>
            <div><code className="text-blue-400">GET /developers/marketplace/{'{serviceId}'}</code> — Service detail</div>
            <div><code className="text-blue-400">GET /developers/marketplace/revenue</code> — Marketplace revenue stats</div>
            <div><code className="text-blue-400">POST /developers/marketplace/recommend</code> — Get service recommendations</div>
          </div>
        </section>

        <section id="services" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">AI Services</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Publish AI services to the marketplace with metered usage billing. Each service defines
            capabilities (input/output schemas, pricing), and consumers report usage which auto-generates
            invoices and settles in USDC. Agent-scope keys (<code className="text-cyan-400">gpay_sk_…</code>)
            can also publish services and report usage directly.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/services</code> — List your services (scope: <code className="text-indigo-300">services.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/services</code> — Publish a service (scope: <code className="text-indigo-300">services.write</code>)</div>
            <div><code className="text-blue-400">PATCH /developers/services/{'{serviceId}'}</code> — Update a service</div>
            <div><code className="text-blue-400">DELETE /developers/services/{'{serviceId}'}</code> — Unpublish a service</div>
            <div><code className="text-blue-400">PUT /developers/services/{'{serviceId}'}/capabilities</code> — Update capabilities (scope: <code className="text-indigo-300">services.manage</code>)</div>
          </div>
          <p className="text-sm text-zinc-500 mt-4">Agent Runtime API for services:</p>
          <div className="mt-2 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /agents/services</code> — Agent's installed services</div>
            <div><code className="text-blue-400">POST /agents/services</code> — Create a service (agent key)</div>
            <div><code className="text-blue-400">GET /agents/services/{'{serviceId}'}</code> — Service detail</div>
            <div><code className="text-blue-400">PUT /agents/services/{'{serviceId}'}/capabilities</code> — Update capabilities</div>
          </div>
        </section>

        <section id="workflows" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Workflow Marketplace</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Reusable workflow templates that can be published to the Workflow Marketplace and installed
            into projects. Workflows define composable sequences of agent invocations and service calls.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/workflows</code> — Browse workflow templates (scope: <code className="text-indigo-300">workflows.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/workflows</code> — Publish a workflow (scope: <code className="text-indigo-300">workflows.publish</code>)</div>
            <div><code className="text-blue-400">POST /developers/workflows/{'{workflowId}'}/install</code> — Install into a project (scope: <code className="text-indigo-300">workflows.install</code>)</div>
          </div>
        </section>

        <section id="commerce" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Commerce &amp; Purchases</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Autonomous Commerce infrastructure: procurement policies, provider capability profiles,
            an AI recommendation engine, prepaid purchase sessions, reputation scoring, and cost
            optimization. All purchases are prepaid — payment is confirmed before any service
            access, invoice, or credits are granted.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/commerce/policy</code> — View procurement policy (scope: <code className="text-indigo-300">policy.read</code>)</div>
            <div><code className="text-blue-400">PUT /developers/commerce/policy</code> — Update policy (scope: <code className="text-indigo-300">policy.manage</code>)</div>
            <div><code className="text-blue-400">GET /developers/commerce/sessions</code> — List sessions (scope: <code className="text-indigo-300">sessions.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/commerce/sessions</code> — Create purchase intent (scope: <code className="text-indigo-300">sessions.manage</code>)</div>
            <div><code className="text-blue-400">POST /developers/commerce/prepaid</code> — Create prepaid purchase intent (scope: <code className="text-indigo-300">sessions.manage</code>)</div>
            <div><code className="text-blue-400">POST /developers/commerce/prepaid/{'{sessionId}'}/confirm</code> — Confirm + pay; grants invoice + credits only after payment (scope: <code className="text-indigo-300">sessions.manage</code>)</div>
            <div><code className="text-blue-400">POST /developers/commerce/sessions/{'{sessionId}'}/cancel</code> — Cancel an unpaid session</div>
            <div><code className="text-blue-400">GET /developers/commerce/dashboard</code> — Commerce dashboard</div>
            <div><code className="text-blue-400">GET /developers/commerce/optimization</code> — Cost optimization recommendations</div>
          </div>
        </section>

        <section id="usage" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Usage Metering</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Report metered usage for AI services and track API consumption. In the prepaid-only model,
            usage reports never create invoices — pricing is settled at purchase time.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/usage-reports</code> — List usage reports (scope: <code className="text-indigo-300">usage.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/usage-reports</code> — Report usage (scope: <code className="text-indigo-300">usage.write</code>)</div>
          </div>
        </section>

        <section id="invoices" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Invoice Settlement</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Automatic invoice generation from service usage and marketplace revenue. Invoices are settled
            in USDC.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/invoices</code> — List invoices (scope: <code className="text-indigo-300">invoices.read</code>)</div>
            <div><code className="text-blue-400">GET /developers/invoices/{'{invoiceId}'}</code> — Invoice detail</div>
            <div><code className="text-blue-400">POST /developers/invoices/{'{invoiceId}'}/pay</code> — Pay invoice (scope: <code className="text-indigo-300">invoices.pay</code>)</div>
          </div>
        </section>

        <section id="payments" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Payments</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Programmatic payments from agent wallets and developer accounts on Arc Chain.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">POST /agents/pay</code> — Send payment from agent wallet (scope: <code className="text-indigo-300">payments.send</code>, agent key)</div>
            <div><code className="text-blue-400">GET /agents/history</code> — Transaction history (scope: <code className="text-indigo-300">transactions.read</code>)</div>
            <div><code className="text-blue-400">GET /agents/balance</code> — Wallet balance (scope: <code className="text-indigo-300">wallets.read</code>)</div>
          </div>
        </section>

        <section id="wallets" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Wallets</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Every AI agent gets a headless wallet on Arc Chain, provisioned automatically when the agent
            is created. No human wallet or gas fee required.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/agents/{'{agentId}'}/balance</code> — Agent wallet balance (scope: <code className="text-indigo-300">wallets.read</code>)</div>
          </div>
        </section>

        <section id="business-network" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Business Network</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            The Business Network connects organizations through company profiles, relationship graphs,
            partnerships, referral recommendations, and real-time network analytics.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/network/profile</code> — Company profile (scope: <code className="text-indigo-300">network.read</code>)</div>
            <div><code className="text-blue-400">PUT /developers/network/profile</code> — Update profile (scope: <code className="text-indigo-300">network.manage</code>)</div>
            <div><code className="text-blue-400">GET /developers/business/directory</code> — Company directory</div>
            <div><code className="text-blue-400">GET /developers/business/relationships</code> — Relationship graph</div>
            <div><code className="text-blue-400">GET /developers/business/partnerships</code> — Partnerships list</div>
          </div>
        </section>

        <section id="projects" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Projects</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Collaboration projects group agents, services and workflows under a shared umbrella for
            cross-org coordination.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/business/projects</code> — List projects (scope: <code className="text-indigo-300">projects.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/business/projects</code> — Create a project (scope: <code className="text-indigo-300">projects.manage</code>)</div>
          </div>
        </section>

        <section id="partnerships" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Partnerships</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            AI-driven partnership recommendations based on transaction patterns and network analytics.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/business/partnerships</code> — List partnerships (scope: <code className="text-indigo-300">partnerships.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/business/partnerships</code> — Accept a partnership (scope: <code className="text-indigo-300">partnerships.manage</code>)</div>
          </div>
        </section>

        <section id="workspaces" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Workspaces</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Enterprise Workspaces provide isolated environments for large organizations with enhanced
            governance, compliance, and team-based resource management.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/enterprise/workspaces</code> — List workspaces (scope: <code className="text-indigo-300">workspaces.read</code>)</div>
            <div><code className="text-blue-400">POST /developers/enterprise/workspaces</code> — Create a workspace (scope: <code className="text-indigo-300">workspaces.manage</code>)</div>
          </div>
        </section>

        <section id="trust-score" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Trust Score</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            AI-driven trust scoring for agents, services, and partners based on transaction history,
            reputation, and network behavior.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/business/trust-score</code> — View trust scores (scope: <code className="text-indigo-300">trust.read</code>)</div>
          </div>
        </section>

        <section id="revenue" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Revenue APIs</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Revenue attribution across API usage, agent transactions, and wallet creation. Revenue is
            distributed to service publishers as USDC.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/revenue</code> — Revenue dashboard (scope: <code className="text-indigo-300">revenue.read</code>)</div>
            <div><code className="text-blue-400">GET /developers/marketplace/revenue</code> — Marketplace revenue stats</div>
          </div>
        </section>

        <section id="analytics" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Analytics</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Real-time analytics for API usage, agent performance, payment flows, and network activity.
          </p>
          <div className="mt-4 text-sm text-zinc-400 space-y-1">
            <div><code className="text-blue-400">GET /developers/analytics</code> — Usage analytics (scope: <code className="text-indigo-300">analytics.read</code>)</div>
            <div><code className="text-blue-400">GET /developers/usage</code> — API usage metrics</div>
            <div><code className="text-blue-400">GET /developers/monitoring</code> — Request monitoring</div>
            <div><code className="text-blue-400">GET /developers/requests</code> — Live request logs</div>
          </div>
        </section>

        <section id="endpoints" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Endpoints</h2>
          {ENDPOINTS.map((e) => <EndpointSection key={e.id} e={e} />)}
        </section>

        <section id="errors" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Errors</h2>
          <p className="text-sm text-zinc-400 mb-3">Errors return a JSON body with a human-readable message.</p>
          <CodeBlock title="Example" language="json" code={`{\n  "success": false,\n  "message": "A valid destination EVM address is required."\n}`} />
          <div className="text-sm text-zinc-500 mt-3 leading-relaxed">
            400 — validation failed · 401 — missing/invalid API key · 429 — rate limit · 500 — server error
          </div>
        </section>

        <section id="rate-limits" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Rate Limits</h2>
          <div className="text-sm text-zinc-400">
            Free tier: <code className="text-blue-400">30 requests / minute</code> per agent. Higher limits are available on Pro and Enterprise plans.
          </div>
        </section>

        <section id="sdk" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">SDKs</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Official client libraries for the GlobalPay Agent Payments API — JavaScript, Python, Go, Java and PHP. All zero-dependency.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {LANGUAGES.filter((l) => ['javascript', 'python', 'go', 'java', 'php'].includes(l.id)).map((l) => (
              <CodeBlock key={l.id} title={`Install · ${l.label}`} language="bash" code={SDK_INSTALL[l.id]} />
            ))}
          </div>

          <div className="flex gap-1 mb-3">
            {LANGUAGES.filter((l) => ['javascript', 'python', 'go', 'java', 'php'].includes(l.id)).map((l) => (
              <button
                key={l.id}
                onClick={() => setSdkLang(l.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${sdkLang === l.id ? 'bg-blue-600/30 text-blue-300' : 'text-zinc-500 hover:text-white'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <CodeBlock title={`Quickstart · ${sdkLang}`} language={sdkLang} code={SDK_QUICKSTART[sdkLang]} />

          <p className="text-sm text-zinc-500 mt-4">
            No SDK in your stack? Every endpoint is also a plain REST call — pick a language below for raw request code.
          </p>
          <div className="flex flex-wrap gap-2 mb-3 mt-2 items-center">
            <label className="text-xs text-zinc-500">Endpoint:</label>
            <select
              value={rawEndpointId}
              onChange={(e) => setRawEndpointId(e.target.value)}
              className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ENDPOINTS.map((e) => (
                <option key={e.id} value={e.id}>{e.method} {e.path} — {e.title}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1 mb-3">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                onClick={() => setRawLang(l.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${rawLang === l.id ? 'bg-blue-600/30 text-blue-300' : 'text-zinc-500 hover:text-white'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <CodeBlock title={`${ENDPOINTS.find(e => e.id === rawEndpointId)?.method || 'POST'} ${ENDPOINTS.find(e => e.id === rawEndpointId)?.path || '/developers/agents'} · ${env}`} language={rawLang} code={sdkCode[rawLang]} />
        </section>

        <section id="webhooks" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Webhooks</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Subscribe to events like <code className="text-blue-400">agent.created</code>,{' '}
            <code className="text-blue-400">payment.completed</code> and{' '}
            <code className="text-blue-400">api_key.rotated</code>. V3 adds events for services, marketplace,
            invoicing, purchase sessions, network, workflows, and agent lifecycle. Payloads are signed
            with an HMAC-SHA256 signature in the <code className="text-blue-400">x-globalpay-signature</code> header.
            Manage endpoints in the <Link to="/developer/webhooks" className="text-blue-400 hover:underline">Webhooks</Link> page.
          </p>
          <p className="text-sm text-zinc-400 mb-3">
            Verify every request before trusting it. The signature header looks like{' '}
            <code className="text-blue-400">t=1750000000,v1=ab12…</code> — recompute the HMAC over{' '}
            <code className="text-blue-400">`{'{timestamp}'}.{'{json_payload}'}`</code> with your endpoint secret and compare.
          </p>
          <CodeBlock title="Verify signature · Node.js" language="javascript" code={`const crypto = require('crypto');

function verifyWebhookSignature({ secret, signature, timestamp, payload }) {
  const expected = 't=' + timestamp + ',v1=' + crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// In your webhook handler:
// const body = JSON.parse(rawBody);
// const sig = req.headers['x-globalpay-signature'];
// const ts  = req.headers['x-globalpay-timestamp'];
// if (!verifyWebhookSignature({ secret: process.env.GLOBALPAY_WEBHOOK_SECRET,
//     signature: sig, timestamp: ts, payload: body })) { return res.sendStatus(401); }`} />
          <h3 className="text-md font-medium mt-6 mb-3">Supported Events</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm text-zinc-400">
            <div><code className="text-blue-400">agent.created</code> — Agent created</div>
            <div><code className="text-blue-400">wallet.created</code> — Wallet created</div>
            <div><code className="text-blue-400">payment.completed</code> — Payment completed</div>
            <div><code className="text-blue-400">payment.failed</code> — Payment failed</div>
            <div><code className="text-blue-400">api_key.rotated</code> — API key rotated</div>
            <div><code className="text-blue-400">service.created</code> — Service created</div>
            <div><code className="text-blue-400">service.updated</code> — Service updated</div>
            <div><code className="text-blue-400">usage.reported</code> — Usage reported</div>
            <div><code className="text-blue-400">invoice.created</code> — Invoice created</div>
            <div><code className="text-blue-400">invoice.paid</code> — Invoice paid</div>
            <div><code className="text-blue-400">invoice.failed</code> — Invoice failed</div>
            <div><code className="text-blue-400">marketplace.purchase</code> — Marketplace purchase</div>
            <div><code className="text-blue-400">policy.updated</code> — Policy updated</div>
            <div><code className="text-blue-400">capability.updated</code> — Capability updated</div>
            <div><code className="text-blue-400">purchase.session.created</code> — Session created</div>
            <div><code className="text-blue-400">purchase.session.approved</code> — Session approved</div>
            <div><code className="text-blue-400">purchase.session.started</code> — Session started</div>
            <div><code className="text-blue-400">purchase.session.cancelled</code> — Session cancelled</div>
            <div><code className="text-blue-400">purchase.session.completed</code> — Session completed</div>
            <div><code className="text-blue-400">purchase.session.invoice_generated</code> — Invoice generated</div>
            <div><code className="text-blue-400">purchase.session.paid</code> — Session paid</div>
            <div><code className="text-blue-400">purchase.session.closed</code> — Session closed</div>
            <div><code className="text-blue-400">profile.updated</code> — Profile updated</div>
            <div><code className="text-blue-400">workflow.template.created</code> — Workflow template created</div>
            <div><code className="text-blue-400">workflow.deployed</code> — Workflow deployed</div>
            <div><code className="text-blue-400">network.provider.switched</code> — Network provider switched</div>
            <div><code className="text-blue-400">agent.published</code> — Agent published</div>
            <div><code className="text-blue-400">agent.updated</code> — Agent updated</div>
            <div><code className="text-blue-400">agent.installed</code> — Agent installed</div>
            <div><code className="text-blue-400">agent.uninstalled</code> — Agent uninstalled</div>
            <div><code className="text-blue-400">agent.version.published</code> — Agent version published</div>
            <div><code className="text-blue-400">agent.subscription.changed</code> — Agent subscription changed</div>
            <div><code className="text-blue-400">agent.invoked</code> — Agent invoked</div>
            <div><code className="text-blue-400">agent.review.submitted</code> — Agent review submitted</div>
            <div><code className="text-blue-400">agent.removed</code> — Agent removed</div>
          </div>
          <p className="text-sm text-zinc-500 mt-4">
            Need a machine-readable spec? Download{' '}
            <a
              href={`${base.replace(/\/$/, '')}/openapi.json`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
              download="globalpay-openapi.json"
            >
              openapi.json
            </a>{' '}
            and feed it into any code generator or Postman.
          </p>
        </section>

        <section id="playground" className="mb-10 scroll-mt-8">
          <h2 className="text-lg font-semibold mb-3">Developer Playground</h2>
          <p className="text-sm text-zinc-400">
            Try every endpoint live, fill parameters, and generate ready-to-run code in six languages. Open the{' '}
            <Link to="/developer/playground" className="text-blue-400 hover:underline">Playground</Link>.
          </p>
        </section>
      </div>
    </div>
  );
};

export default DevDocs;
