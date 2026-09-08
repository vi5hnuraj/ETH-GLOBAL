#!/usr/bin/env node
/**
 * Bazantic External Agent Demo
 *
 * Demonstrates that another AI can consume GlobalPay's Bazantic recipes.
 * Reads the capability manifest + buy-service recipe, then executes each
 * step against the live API, printing Trust Engine reasoning at every stage.
 *
 * Usage:
 *   GLOBALPAY_BASE_URL=http://localhost:5550 \
 *   GLOBALPAY_DEV_KEY=gpay_sk_... \
 *   GLOBALPAY_DEV_ID=dev_xxx \
 *   GLOBALPAY_ORG_ID=uuid \
 *   node scripts/bazantic-agent-demo.mjs [--capability "OCR"] [--execute]
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE = process.env.GLOBALPAY_BASE_URL || 'http://localhost:5550';
const API_KEY = process.env.GLOBALPAY_DEV_KEY;
const DEV_ID = process.env.GLOBALPAY_DEV_ID;
const ORG_ID = process.env.GLOBALPAY_ORG_ID;
const CAPABILITY = process.argv.includes('--capability')
  ? process.argv[process.argv.indexOf('--capability') + 1]
  : 'OCR';
const EXECUTE = process.argv.includes('--execute');

if (!API_KEY || !DEV_ID || !ORG_ID) {
  console.error('❌ Missing env vars: GLOBALPAY_DEV_KEY, GLOBALPAY_DEV_ID, GLOBALPAY_ORG_ID');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'X-Developer-Id': DEV_ID,
  'X-Organization-Id': ORG_ID,
  'Content-Type': 'application/json'
};

const step = (n, label) => console.log(`\n━━━ Step ${n}: ${label} ━━━`);

const api = async (method, path, body) => {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.message || json.error || JSON.stringify(json)}`);
  return json;
};

// ── Load manifest + recipe ───────────────────────────────────────────
const manifest = JSON.parse(readFileSync(resolve(__dirname, '..', '.well-known', 'globalpay-agent.json'), 'utf-8'));
const recipe = JSON.parse(readFileSync(resolve(__dirname, '..', 'bazantic-recipes', 'buy-service.json'), 'utf-8'));

console.log('🤖 Bazantic External Agent Demo');
console.log(`   Manifest: ${manifest.name} — ${manifest.description}`);
console.log(`   Recipe: ${recipe.id} — ${recipe.purpose}`);
console.log(`   Capability: ${CAPABILITY}`);
console.log(`   Mode: ${EXECUTE ? 'live execution' : 'dry-run (use --execute to confirm payment)'}`);

// ── Step 1: Discover marketplace providers ──────────────────────────
step(1, 'Marketplace Discovery');
const searchPath = recipe.steps[0].path.replace('{capability}', encodeURIComponent(CAPABILITY));
const marketplace = await api('GET', searchPath);
const services = marketplace.services || [];
console.log(`   Found ${services.length} service(s) matching "${CAPABILITY}"`);
for (const s of services.slice(0, 5)) {
  console.log(`   • ${s.title} (${s.serviceId}) — ${s.unitPrice} ${s.currency || 'USDC'} — provider wallet: ${s.provider?.wallet || 'unknown'}`);
}

// ── Step 2: Trust Engine provider analysis ──────────────────────────
step(2, 'Trust Engine — Provider Analysis (The Graph)');
const providerWallets = services.map((s) => s.provider?.wallet).filter(Boolean);
const analysisBody = { providerIds: providerWallets };
const analysis = await api('POST', recipe.steps[1].path, analysisBody);
const providers = analysis.providers || [];
console.log(`   ${providers.length} provider(s) analyzed from Graph evidence`);
for (const p of providers.slice(0, 5)) {
  console.log(`   • ${p.providerId?.slice(0, 18)}… trust ${p.trustScore ?? 'N/A'}/100, ${p.successfulPayments ?? 0}/${p.paymentCount ?? 0} successful, ${p.settlementVolume?.toFixed(4) ?? 0} USDC`);
}

// ── Step 3: Trust Engine natural-language query ──────────────────────
step(3, 'Trust Engine — Natural-Language Query');
const nlQuery = { question: `Which provider is safest for ${CAPABILITY}?`, providerIds: providerWallets };
const nlResult = await api('POST', '/api/developers/graph/ask', nlQuery);
console.log(`   Intent: ${nlResult.intent}`);
console.log(`   Answer:\n   ${nlResult.answer?.split('\n').join('\n   ')}`);

// ── Step 4: Select provider ──────────────────────────────────────────
step(4, 'Provider Selection');
const chosenWallet = nlResult.recommendation?.providerId || providers[0]?.providerId;
const chosenService = services.find((s) => String(s.provider?.wallet).toLowerCase() === chosenWallet);
if (!chosenService) {
  console.error('   ❌ No matching service found for the recommended provider wallet.');
  process.exit(1);
}
console.log(`   Selected: ${chosenService.title} (${chosenService.serviceId})`);
console.log(`   Provider wallet: ${chosenWallet}`);
console.log(`   Cost: ${chosenService.unitPrice} ${chosenService.currency || 'USDC'}`);

if (!EXECUTE) {
  console.log('\n   ── DRY RUN COMPLETE ──');
  console.log('   Pass --execute to confirm payment and settle on Arc.');
  process.exit(0);
}

// ── Step 5: Find consumer agent ──────────────────────────────────────
step(5, 'Resolve Consumer Agent');
const agentsRes = await api('GET', '/api/developers/agents');
const consumerAgent = (agentsRes.agents || [])[0];
if (!consumerAgent) {
  console.error('   ❌ No agents found under this developer. Create one first.');
  process.exit(1);
}
console.log(`   Consumer: ${consumerAgent.agentId} — wallet ${consumerAgent.wallet || 'unknown'}`);

// ── Step 6: Create prepaid intent ───────────────────────────────────
step(6, 'Create Prepaid Purchase Intent');
const prepaidBody = {
  serviceId: chosenService.serviceId,
  consumerAgentId: consumerAgent.agentId,
  quantity: '1',
  reason: `External AI agent purchase of ${CAPABILITY} via Bazantic recipe`
};
const prepaid = await api('POST', recipe.steps[2].path, prepaidBody);
const sessionId = prepaid.session?.sessionId;
console.log(`   Session: ${sessionId}`);

// ── Step 7: Confirm + settle on Arc ─────────────────────────────────
step(7, 'Confirm & Settle (Arc + The Graph)');
const confirmPath = recipe.steps[3].path.replace('{sessionId}', sessionId);
const confirm = await api('POST', confirmPath);
console.log(`   Success: ${confirm.success}`);
if (confirm.success) {
  console.log(`   TX Hash: ${confirm.txHash}`);
  console.log(`   Invoice: ${confirm.invoice?.invoiceId}`);
  console.log(`   Credits: ${confirm.credits}`);
  console.log(`   Amount: ${confirm.amountBOT} USDC`);
  console.log(`   Explorer: https://testnet.arcscan.app/tx/${confirm.txHash}`);

  // ── Step 8: Verify via Trust Engine ─────────────────────────────
  step(8, 'Post-Purchase Graph Verification');
  const postAnalysis = await api('POST', '/api/developers/graph/provider-analysis', { providerIds: [chosenWallet] });
  const updatedProvider = (postAnalysis.providers || [])[0];
  if (updatedProvider) {
    console.log(`   Updated trust: ${updatedProvider.trustScore}/100, ${updatedProvider.successfulPayments} successful`);
    console.log(`   Reasoning: ${updatedProvider.reasoning?.[0] || 'N/A'}`);
  }
} else {
  console.log(`   Failure reason: ${confirm.failureReason}`);
}

console.log('\n✅ Bazantic external agent demo complete.');
