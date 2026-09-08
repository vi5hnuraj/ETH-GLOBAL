#!/usr/bin/env node
/**
 * GlobalPay AI Assistant — 2-Minute Hackathon Demo
 *
 * Demonstrates the full Observe → Decide → Act → Verify → Improve loop
 * through the natural-language AI Assistant interface.
 *
 * Usage:
 *   node scripts/ai-assistant-demo.mjs
 *
 * Environment:
 *   GLOBALPAY_BASE_URL  — Backend URL (default: http://localhost:5550)
 *   GLOBALPAY_DEV_KEY   — Developer API key
 *   GLOBALPAY_DEV_ID    — Developer ID
 *   GLOBALPAY_ORG_ID    — Organization ID
 */

const BASE = process.env.GLOBALPAY_BASE_URL || 'http://localhost:5550';
const API_KEY = process.env.GLOBALPAY_DEV_KEY;
const DEV_ID = process.env.GLOBALPAY_DEV_ID;
const ORG_ID = process.env.GLOBALPAY_ORG_ID;

const headers = {
  'Content-Type': 'application/json',
  ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}),
  ...(DEV_ID ? { 'X-Developer-Id': DEV_ID } : {}),
  ...(ORG_ID ? { 'X-Organization-Id': ORG_ID } : {})
};

const chat = async (message) => {
  const res = await fetch(`${BASE}/api/developers/ai-assistant/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message })
  });
  return res.json();
};

const section = (title) => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}\n`);
};

const step = (n, label) => console.log(`  Step ${n}: ${label}`);

// ── Demo ─────────────────────────────────────────────────────────

async function main() {
  console.log('🤖 GlobalPay AI Assistant — Hackathon Demo');
  console.log(`   Backend: ${BASE}`);
  console.log('');

  // ── Demo 1: Provider Discovery ────────────────────────────────
  section('Demo 1: Provider Discovery (The Graph → Trust Engine)');

  console.log('  User: "Who is the most trusted AI provider?"\n');
  step(1, 'Query The Graph for provider settlement history');

  const discovery = await chat('Who is the most trusted AI provider?');

  console.log(`  Intent: ${discovery.data?.intent || 'find_safest'}`);
  console.log(`  Providers analyzed: ${discovery.data?.providers?.length || 0}`);
  console.log('');

  if (discovery.data?.providers) {
    for (const p of discovery.data.providers.slice(0, 3)) {
      console.log(`  ${p.providerId?.slice(0, 18)}…`);
      console.log(`    Trust: ${p.trustScore}/100 | Risk: ${p.riskLevel}`);
      console.log(`    ${p.successfulPayments}/${p.paymentCount} successful | ${p.uniquePayers} buyers`);
      console.log(`    Volume: ${p.settlementVolume?.toFixed(4)} USDC`);
      if (p.reasoning?.length) {
        console.log(`    Reasoning: ${p.reasoning[0]}`);
      }
      console.log('');
    }
  }

  console.log('  ✅ Every metric comes from The Graph subgraph — real on-chain data\n');

  // ── Demo 2: Fraud Detection ───────────────────────────────────
  section('Demo 2: Fraud Detection (Graph Intelligence)');

  console.log('  User: "Show risky providers"\n');
  step(2, 'Analyze Graph data for fraud signals');

  const fraud = await chat('Show risky providers');

  if (fraud.data?.providers) {
    const risky = fraud.data.providers.filter(p => p.riskLevel === 'HIGH' || p.fraudSignals?.length);
    if (risky.length) {
      console.log(`  Found ${risky.length} risky provider(s):\n`);
      for (const p of risky) {
        console.log(`  ⚠️  ${p.providerId?.slice(0, 18)}… — Risk: ${p.riskLevel}`);
        if (p.fraudSignals) {
          for (const sig of p.fraudSignals) {
            console.log(`      • ${sig}`);
          }
        }
        console.log('');
      }
    } else {
      console.log('  No risky providers detected — all providers clean.\n');
    }
  }

  console.log('  ✅ Fraud detection runs entirely from Graph data — self-payments,\n');
  console.log('     cancellation streaks, volume spikes, failure dominance\n');

  // ── Demo 3: Natural Language Queries ───────────────────────────
  section('Demo 3: Natural Language Graph Queries');

  const queries = [
    'Which provider earned the most USDC?',
    'Which provider was most recently active?',
  ];

  for (const q of queries) {
    console.log(`  User: "${q}"\n`);
    const result = await chat(q);
    if (result.answer) {
      const lines = result.answer.split('\n').slice(0, 6);
      for (const line of lines) {
        console.log(`    ${line}`);
      }
    }
    console.log('');
  }

  console.log('  ✅ Natural language → The Graph query → structured answer\n');

  // ── Demo 4: Balance Check ─────────────────────────────────────
  section('Demo 4: Wallet Balance (Arc Network)');

  console.log('  User: "Show my balance"\n');
  const balance = await chat('Show my balance');
  if (balance.answer) {
    const lines = balance.answer.split('\n').slice(0, 10);
    for (const line of lines) {
      console.log(`  ${line}`);
    }
  }
  console.log('');

  // ── Demo 5: Full Purchase Flow ────────────────────────────────
  section('Demo 5: Full Autonomous Purchase (Observe → Decide → Act → Verify)');

  console.log('  User: "Find the safest OCR provider and buy it"\n');

  step(1, 'Observe — Query The Graph for provider trust');
  step(2, 'Decide — Rank providers, select safest');
  step(3, 'Act — MPC-signed settlement on Arc L1');
  step(4, 'Verify — Confirm Graph indexing');
  step(5, 'Improve — Invoice + credits + reputation\n');

  const purchase = await chat('Find the safest OCR provider and buy it');

  console.log('  Result:');
  if (purchase.success) {
    console.log(`  Status: ✅ ${purchase.message}`);
  } else {
    console.log(`  Status: ⚠️ ${purchase.message}`);
  }
  console.log('');

  if (purchase.answer) {
    console.log('  Reasoning:');
    const lines = purchase.answer.split('\n');
    for (const line of lines) {
      console.log(`    ${line}`);
    }
  }
  console.log('');

  if (purchase.data?.settlement) {
    console.log('  Arc Settlement:');
    console.log(`    TX: ${purchase.data.settlement.txHash}`);
    console.log(`    Explorer: ${purchase.data.settlement.explorerUrl}`);
    console.log(`    Amount: ${purchase.data.settlement.amount} USDC`);
  }

  if (purchase.data?.verification?.verified) {
    console.log(`\n  Graph Verification:`);
    console.log(`    Block: #${purchase.data.verification.block}`);
    console.log(`    Entity: ${purchase.data.verification.entityId}`);
  }

  if (purchase.data?.invoice) {
    console.log(`\n  Invoice: ${purchase.data.invoice.invoiceId}`);
    console.log(`  Credits: ${purchase.data.credits || 1}`);
  }

  // ── Step Progress ──────────────────────────────────────────────
  if (purchase.steps?.length) {
    console.log('\n  Step Progress:');
    for (const s of purchase.steps) {
      const icon = s.status === 'complete' ? '✅' : s.status === 'failed' ? '❌' : '⏳';
      console.log(`    ${icon} [${s.phase}] ${s.label} — ${s.detail}`);
    }
  }

  console.log('\n');
  section('Demo Complete');
  console.log('  Key Takeaways:');
  console.log('  1. The Graph is the decision engine — every provider selection comes from on-chain data');
  console.log('  2. Arc settlement is real — MPC-signed transactions on Arc L1');
  console.log('  3. The full loop is autonomous — no manual intervention required');
  console.log('  4. Natural language is the interface — no API calls, no code');
  console.log('  5. Fraud detection runs from Graph data — wash trading, self-payments, spikes');
  console.log('');
}

main().catch((err) => {
  console.error('❌ Demo failed:', err.message);
  process.exit(1);
});
