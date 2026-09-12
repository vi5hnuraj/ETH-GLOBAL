/**
 * AI Assistant Service — the natural-language interface to GlobalPay.
 *
 * Interprets a human request, selects the appropriate Bazantic recipe,
 * executes each step against live platform services, and returns a
 * structured response with human-readable reasoning backed by The Graph.
 *
 * No LLM required — deterministic intent classification + recipe execution.
 */
import logger from '../utils/logger.js';
import { askTrustEngine, analyzeProviders, getGraphStatus, verifySettlement } from './graphIntelligenceService.js';
import { listMarketplace } from './marketplaceService.js';
import { createPrepaidIntent, confirmPrepaidPurchase, getMonthlySpendWei } from './commerceService.js';
import { getArcBalance, getArcNetworkStatus } from './arcService.js';
import { supabase } from '../config/supabaseClient.js';

// ==================== Intent Classification ====================

const INTENTS = [
  // Purchase intents
  { id: 'purchase_safest', patterns: /(?:buy|purchase|get|acquire|order)\s+(?:the\s+)?(?:safest|best|most\s+trusted|most\s+reliable)/i },
  { id: 'purchase_cheapest', patterns: /(?:buy|purchase|get|acquire|order)\s+(?:the\s+)?(?:cheapest|lowest|most\s+affordable|least\s+expensive)/i },
  { id: 'purchase_under', patterns: /(?:buy|purchase|get)\s+.+?(?:under|below|less\s+than)\s+[\d.]+\s*(?:usdc|dollar|\$)/i },
  { id: 'purchase_generic', patterns: /(?:buy|purchase|get|acquire|order)\s+.+/i },
  { id: 'verify_payment', patterns: /(?:verify|check|confirm|inspect)\s+(?:my\s+)?(?:last\s+)?(?:payment|transaction|tx|settlement|invoice)/i },
  { id: 'show_spending', patterns: /(?:show|what(?:'s| is)|how much)\s+(?:my\s+)?(?:spending|spend|spent).*(?:month|today|week)?/i },
  { id: 'compare_providers', patterns: /compare\s+(?:providers?|services?)(?:\s+by\s+(?:trust|price|reliability))?/i },
  { id: 'run_workflow', patterns: /(?:run|start|execute)\s+(?:my\s+)?(?:document|ocr|resume|data)\s+workflow/i },
  // Lifecycle intents (checked before discovery to avoid false matches)
  { id: 'how_much_earned', patterns: /(?:how\s+much\s+(?:have\s+i\s+)?earned|total\s+revenue|my\s+earnings)/i },
  // Discovery intents
  { id: 'find_safest', patterns: /(?:safest|best|most\s+trusted|most\s+reliable|who\s+should\s+i)\s*(?:provider|ai|agent|service)?/i },
  { id: 'find_cheapest', patterns: /(?:cheapest|lowest|most\s+affordable|least\s+expensive)\s*(?:provider|ai|agent|service)?/i },
  { id: 'find_earners', patterns: /(?:who\s+)?(?:earned|earner|most\s+usdc|top\s+earner|revenue|highest\s+volume)/i },
  { id: 'find_risky', patterns: /(?:risky|risk|fraud|suspicious|dangerous|wash|scam)/i },
  { id: 'find_active', patterns: /(?:recent|active|latest|most\s+active|newest)/i },
  { id: 'find_success_rate', patterns: /(?:success\s+rate|reliable|reliability|above|exceeds|over)\s+\d+/i },
  // Lifecycle intents
  { id: 'check_verified', patterns: /(?:am\s+i|is\s+my\s+agent|are\s+we)\s+(?:verified|confirmed|approved|human)/i },
  { id: 'why_cant_publish', patterns: /(?:why\s+(?:can(?:'t|t|'t)?|cannot|can\s+i\s+not)\s+(?:i\s+)?publish|publish\s+(?:blocked|denied|locked|fail)|can(?:'t|t|'t)?\s+publish|unable\s+to\s+publish)/i },
  { id: 'what_do_i_need', patterns: /(?:what\s+do\s+i\s+need|what(?:'s| is)\s+required|before\s+(?:selling|publishing))/i },
  { id: 'show_services', patterns: /(?:show|list|what(?:'s| are))\s+(?:my\s+)?(?:published\s+)?services/i },
  // Verification + payment
  { id: 'show_balance', patterns: /(?:show|check|what(?:'s| is))\s+(?:my\s+)?(?:balance|wallet|funds|money)/i },
  { id: 'show_reputation', patterns: /(?:show|what(?:'s| is))\s+(?:my\s+)?(?:reputation|trust\s+score|provider\s+score)/i },
  { id: 'help', patterns: /(?:help|what\s+can\s+you|commands|capabilities|what\s+do\s+you)/i },
];

const classifyIntent = (text) => {
  for (const intent of INTENTS) {
    if (intent.patterns.test(text)) return intent.id;
  }
  return 'help';
};

const extractCapability = (text) => {
  const match = text.match(/(?:for|about|related\s+to)\s+(\w+(?:\s+\w+)?)/i);
  if (match) return match[1].trim().replace(/\s+(provider|service|agent)s?$/i, '');
  // Try to extract from common patterns: "buy OCR", "purchase GPU inference"
  const capabilityMatch = text.match(/(?:buy|purchase|get|find)\s+(?:the\s+)?(?:safest|best|cheapest)?\s*(\w+(?:\s+\w+)?)/i);
  if (capabilityMatch) return capabilityMatch[1].trim().replace(/\s+(provider|service|agent)s?$/i, '');
  return null;
};

const extractPriceThreshold = (text) => {
  const match = text.match(/(?:under|below|less\s+than|<)\s+([\d.]+)\s*(?:usdc|dollar|\$)?/i);
  return match ? Number(match[1]) : null;
};

// ==================== Step Tracking ====================

const createStepTracker = () => {
  const steps = [];
  const add = (phase, label, detail, status = 'complete') => {
    steps.push({ phase, label, detail, status, timestamp: new Date().toISOString() });
  };
  const fail = (phase, label, detail) => {
    steps.push({ phase, label, detail, status: 'failed', timestamp: new Date().toISOString() });
  };
  return { steps, add, fail };
};

// ==================== Intent Handlers ====================

const handlePurchase = async (text, { consumerAgentId, developerId, organizationId }, tracker) => {
  const capability = extractCapability(text) || 'OCR';
  const priceThreshold = extractPriceThreshold(text);

  // Step 1: Observe — query The Graph
  tracker.add('observe', 'Querying The Graph', `Analyzing provider settlement history for "${capability}"...`);
  const graphResult = await askTrustEngine(
    text.includes('safest') || text.includes('best') || text.includes('trusted')
      ? `Which provider is safest for ${capability}?`
      : text.includes('cheapest') || text.includes('lowest')
        ? `Which provider is most affordable for ${capability}?`
        : `Which provider is best for ${capability}?`
  );
  const topProvider = graphResult.recommendation;
  if (!topProvider) {
    tracker.fail('observe', 'No providers found', 'The Graph has no indexed settlement history for any provider.');
    return { message: 'No providers with Graph evidence found. The Trust Engine refuses to recommend without verifiable on-chain history.', steps: tracker.steps, answer: graphResult.answer };
  }

  // Step 2: Decide — rank and explain
  tracker.add('decide', 'Ranking providers', `Selected ${topProvider.providerId?.slice(0, 18)}… — trust ${topProvider.trustScore}/100, risk ${topProvider.riskLevel}`);

  // Step 2b: Discover marketplace service matching capability
  const marketplace = await listMarketplace({ search: capability, perPage: 100 });
  const services = (marketplace.services || []).filter((s) => s.provider?.wallet);

  // Prefer services without endpoint URLs (skip health check) or from the top provider.
  const candidates = services.filter((s) => {
    const wallet = String(s.provider?.wallet || '').toLowerCase();
    return wallet === String(topProvider.providerId || '').toLowerCase();
  });
  // If the top provider's service has an unreachable endpoint, include alternatives.
  const allCandidates = [...candidates, ...services.filter((s) => !candidates.includes(s))];

  // Price threshold filter
  const affordable = priceThreshold
    ? allCandidates.filter((s) => Number(s.unitPrice || 0) <= priceThreshold)
    : allCandidates;

  // Sort: prefer no endpoint (skips health check), then by trust score
  const sorted = [...affordable].sort((a, b) => {
    const aNoEndpoint = !a.endpointUrl ? 0 : 1;
    const bNoEndpoint = !b.endpointUrl ? 0 : 1;
    return aNoEndpoint - bNoEndpoint;
  });

  if (!sorted.length) {
    tracker.fail('decide', 'No eligible service', priceThreshold ? `No service under ${priceThreshold} USDC found.` : `No marketplace services available for "${capability}".`);
    return { message: `No eligible marketplace service found. ${priceThreshold ? `All services exceed your ${priceThreshold} USDC budget.` : 'Try a different capability.'}`, steps: tracker.steps, answer: graphResult.answer };
  }

  // Resolve consumer agent
  if (!consumerAgentId) {
    const { data: agents } = await supabase.from('ai_agents').select('*').limit(1);
    consumerAgentId = agents?.[0]?.agent_id;
  }
  let consumerAgent = null;
  if (consumerAgentId) {
    const { data: agent } = await supabase.from('ai_agents').select('*').eq('agent_id', consumerAgentId).maybeSingle();
    consumerAgent = agent;
  }
  if (!consumerAgent) {
    const { data: agents } = await supabase.from('ai_agents').select('*').limit(1);
    consumerAgent = agents?.[0] || null;
    consumerAgentId = agents?.[0]?.agent_id;
  }
  if (!consumerAgentId) {
    tracker.fail('act', 'No consumer agent', 'No agent found to execute the purchase. Create an agent first.');
    return { message: 'No agent available to execute the purchase. Create an agent in the Developer Console first.', steps: tracker.steps };
  }

  // Step 3: Act — try each candidate until one settles successfully
  let settlement = null;
  let matchingService = null;
  for (const candidate of sorted.slice(0, 3)) {
    tracker.add('act', 'Creating purchase intent', `Service: ${candidate.title} (${candidate.unitPrice} USDC)`);
    let intent;
    try {
      intent = await createPrepaidIntent({
        developerId,
        organizationId,
        consumerAgent,
        service: { ...candidate, service_id: candidate.serviceId },
        quantity: '1',
        reason: `AI Assistant: ${text}`
      });
    } catch (err) {
      const msg = String(err.message || err);
      if (msg.includes('unreachable') || msg.includes('ENOTFOUND') || msg.includes('SERVICE_UNHEALTHY')) {
        tracker.add('act', 'Service offline', `${candidate.title} endpoint unreachable — trying alternative...`);
        continue;
      }
      tracker.fail('act', 'Settlement failed', msg);
      return { message: `Payment failed: ${msg}. The Trust Engine recommendation stands — try again when funds are available.`, steps: tracker.steps, answer: graphResult.answer };
    }

    tracker.add('act', 'Settling on Arc', `Executing MPC-signed payment via GlobalPayPaymentManager...`);
    let result;
    try {
      result = await confirmPrepaidPurchase({ sessionId: intent.session.sessionId, organizationId });
    } catch (err) {
      const msg = String(err.message || err);
      // confirmPrepaidPurchase throws on service health check failure
      if (msg.includes('unreachable') || msg.includes('ENOTFOUND') || msg.includes('SERVICE_UNHEALTHY')) {
        tracker.add('act', 'Service offline', `${candidate.title} endpoint unreachable — trying alternative...`);
        continue;
      }
      tracker.fail('act', 'Settlement failed', msg);
      return { message: `Payment failed: ${msg}. The Trust Engine recommendation stands — try again when funds are available.`, steps: tracker.steps, answer: graphResult.answer };
    }

    if (result.success) {
      settlement = result;
      matchingService = candidate;
      break;
    }
    // If endpoint unreachable, try next candidate silently
    if (result.failureReason?.includes('unreachable') || result.failureReason?.includes('ENOTFOUND')) {
      tracker.add('act', 'Service offline', `${candidate.title} endpoint unreachable — trying alternative...`);
      continue;
    }
    // Other failures are terminal
    tracker.fail('act', 'Settlement failed', result.failureReason || 'Payment could not be completed.');
    return { message: `Payment failed: ${result.failureReason}. The Trust Engine recommendation stands — try again when funds are available.`, steps: tracker.steps, answer: graphResult.answer };
  }

  if (!settlement || !matchingService) {
    tracker.fail('act', 'All services offline', 'All matching services have unreachable endpoints.');
    return { message: 'All matching services are currently offline. The Trust Engine recommendation stands — try again when providers restore service.', steps: tracker.steps, answer: graphResult.answer };
  }

  // Step 4: Verify — check Graph indexing
  tracker.add('verify', 'Verifying on The Graph', `Polling for PaymentCreated + PaymentReleased...`);
  const verification = await verifySettlement(settlement.txHash);

  // Build final answer — explain the full decision chain with all sponsors
  const answer = [
    `🔍 Discovery`,
    `Found ${sorted.length} provider(s) for "${capability}".`,
    '',
    `🧠 The Graph — Provider Intelligence`,
    `I analyzed settlement history for each provider:`,
    ...topProvider.reasoning.map((line) => `• ${line}`),
    `Risk: ${topProvider.riskLevel} · Confidence: ${Math.round(topProvider.confidence * 100)}%`,
    '',
    `✅ Selection`,
    `I selected ${matchingService.title} — Trust Engine score ${topProvider.trustScore}/100.`,
    '',
    `💳 Arc — Settlement`,
    `Payment settled on Arc Testnet.`,
    `Transaction: ${settlement.txHash}`,
    `Explorer: https://testnet.arcscan.app/tx/${settlement.txHash}`,
    '',
    `📊 The Graph — Verification`,
    verification.verified ? `Payment indexed at block #${verification.settlement?.blockNumber}. Entity: ${verification.settlement?.id || 'indexed'}` : 'Payment submitted — awaiting Graph indexing.',
    '',
    settlement.invoice?.invoiceId ? `📄 Invoice: ${settlement.invoice.invoiceId}` : '',
    settlement.credits ? `💎 Credits granted: ${settlement.credits}` : ''
  ].filter(Boolean).join('\n');

  return {
    message: `Completed: purchased ${matchingService.title} for ${settlement.amountBOT || matchingService.unitPrice} USDC.`,
    answer,
    steps: tracker.steps,
    data: {
      provider: topProvider,
      service: { title: matchingService.title, serviceId: matchingService.serviceId, price: matchingService.unitPrice },
      settlement: { txHash: settlement.txHash, amount: settlement.amountBOT, explorerUrl: `https://testnet.arcscan.app/tx/${settlement.txHash}` },
      verification: verification.verified ? { verified: true, block: verification.settlement?.blockNumber, entityId: verification.settlement?.id } : null,
      invoice: settlement.invoice || null,
      credits: settlement.credits || null
    }
  };
};

const handleFindProviders = async (text, tracker) => {
  const intent = classifyIntent(text);
  const capability = extractCapability(text);

  tracker.add('observe', 'Querying The Graph', 'Loading provider settlement history...');

  let question;
  if (intent === 'find_earners') question = `Who earned the most USDC${capability ? ` for ${capability}` : ''}?`;
  else if (intent === 'find_risky') question = 'Are there any fraud signals?';
  else if (intent === 'find_active') question = 'Which provider was most recently active?';
  else if (intent === 'find_cheapest') question = 'Which provider has the most affordable services?';
  else if (intent === 'find_success_rate') question = text;
  else question = `Which provider is safest${capability ? ` for ${capability}` : ''}?`;

  let providerIds;
  if (capability) {
    const marketplace = await listMarketplace({ search: capability, perPage: 100 });
    providerIds = [...new Set((marketplace.services || []).map((service) => service.provider?.wallet).filter(Boolean))];
  }
  const result = await askTrustEngine(question, providerIds);
  const graphBackedProviders = (result.providers || []).filter((provider) => Number(provider.paymentCount || 0) > 0);

  tracker.add('decide', 'Analyzing results', `${graphBackedProviders.length} provider(s) with indexed evidence analyzed`);

  const topProviders = graphBackedProviders.slice(0, 5);
  const providerLines = topProviders.map((p, i) => {
    const worldBadge = p.humanBacked ? '✓ Human Verified (World)' : '⚠ Unverified';
    return `${i + 1}. ${worldBadge}\n   Trust ${p.trustScore}/100 · ${p.successfulPayments}/${p.paymentCount} successful · ${p.settlementVolume?.toFixed(4)} USDC · ${p.uniquePayers} buyer(s) · risk ${p.riskLevel}`;
  }).join('\n\n');

  return {
    message: topProviders.length ? result.answer : 'No matching providers have indexed Graph settlement evidence yet.',
    answer: topProviders.length ? result.answer : 'No matching providers have indexed settlement evidence on The Graph yet. GlobalPay will not recommend a provider without verifiable on-chain history.',
    steps: tracker.steps,
    data: {
      intent: result.intent,
       providers: topProviders,
       recommendation: topProviders[0] || null,
      providerSummary: providerLines
    }
  };
};

const handleVerifyPayment = async (text, tracker) => {
  tracker.add('observe', 'Looking up recent transactions', 'Querying service invoices...');

  // Find the most recent paid invoice
  const { data: invoices } = await supabase
    .from('service_invoices')
    .select('invoice_id, tx_hash, amount_wei, status, paid_at, service_code, provider_agent_code')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1);

  if (!invoices?.length) {
    tracker.fail('observe', 'No payments found', 'No paid invoices in the database.');
    return { message: 'No recent payments found to verify. Make a purchase first.', steps: tracker.steps };
  }

  const invoice = invoices[0];
  tracker.add('verify', 'Verifying on The Graph', `Checking tx ${invoice.tx_hash?.slice(0, 18)}...`);

  const verification = await verifySettlement(invoice.tx_hash);

  return {
    message: verification.verified
      ? `Payment verified: ${invoice.invoice_id} — ${verification.settlement?.status} at block #${verification.settlement?.blockNumber}`
      : `Payment ${invoice.tx_hash} not yet indexed by The Graph. Status: pending.`,
    answer: verification.verified
      ? `✅ Invoice ${invoice.invoice_id} verified on The Graph.\n• TX: ${invoice.tx_hash}\n• Status: ${verification.settlement?.status}\n• Block: #${verification.settlement?.blockNumber}\n• Amount: ${Number(invoice.amount_wei || 0) / 1e18} USDC\n• Paid: ${invoice.paid_at}`
      : `⏳ Invoice ${invoice.invoice_id} — transaction ${invoice.tx_hash} not yet indexed. The Graph may need more time.`,
    steps: tracker.steps,
    data: {
      invoice: { id: invoice.invoice_id, txHash: invoice.tx_hash, status: invoice.status, paidAt: invoice.paid_at },
      verification: verification.verified ? { verified: true, block: verification.settlement?.blockNumber, status: verification.settlement?.status } : { verified: false }
    }
  };
};

const handleCheckVerified = async (tracker, consumerAgentId) => {
  tracker.add('observe', 'Checking verification status', 'Querying World AgentKit...');
  let query = supabase.from('ai_agents').select('agent_id, agent_name, world_verified, human_backed, agent_book_id, wallet_address');
  if (consumerAgentId) query = query.eq('agent_id', consumerAgentId);
  const { data: agents } = await query.limit(1);
  const agent = agents?.[0];
  if (!agent) return { message: 'No agent found. Create one first.', answer: '❌ No agent found. Create an AI agent in the Agent Studio first.', steps: tracker.steps };
  if (agent.world_verified) {
    return { message: 'World ID verified.', answer: `✅ Your agent ${agent.agent_name || agent.agent_id} is verified via World ID.\n\n• World Verified: Yes\n• AgentBook Registered: ${agent.agent_book_id ? 'Yes' : 'No — wallet registration is still required'}\n• Human-backed: ${agent.human_backed ? 'Yes' : 'Pending'}\n• Wallet: ${agent.wallet_address?.slice(0, 10)}…\n\nWorld ID unlocks publishing. AgentBook is wallet-specific and is only marked registered after this wallet completes the AgentBook flow. The Graph separately measures settlement trust.`, steps: tracker.steps };
  }
  return { message: 'Agent is not verified.', answer: `❌ Your agent ${agent.agent_name || agent.agent_id} is NOT verified.\n\n• World Verified: No\n• Wallet: ${agent.wallet_address?.slice(0, 10)}…\n\nTo publish services, you must verify with World ID first.\nGo to: /developer/world-verification`, steps: tracker.steps };
};

const handleWhyCantPublish = async (tracker) => {
  tracker.add('observe', 'Checking publish eligibility', 'Querying verification status...');
  const { data: agents } = await supabase.from('ai_agents').select('agent_id, agent_name, world_verified').limit(1);
  const agent = agents?.[0];
  if (!agent) return { message: 'No agent found.', answer: '❌ Create an AI agent first. Then verify with World ID to unlock publishing.', steps: tracker.steps };
  if (agent.world_verified) return { message: 'Agent is verified — publishing is unlocked.', answer: '✅ You are verified! Publishing is unlocked. Go to /developer/marketplace/services/publish to publish a service.', steps: tracker.steps };
  return { message: 'World verification required.', answer: `🔒 Publishing requires World AgentKit verification.\n\nWhy? World AgentKit proves you are a real human, not a bot.\nThis prevents spam, wash trading, and fake providers.\n\nSteps:\n1. Go to /developer/world-verification\n2. Click "Verify with World"\n3. Complete World ID verification\n4. Publishing unlocks automatically\n\nThe Graph still decides trust based on your settlement history.\nWorld just proves WHO you are.`, steps: tracker.steps };
};

const handleWhatDoINeed = async (tracker) => {
  const { data: agents } = await supabase.from('ai_agents').select('agent_id, agent_name, world_verified, wallet_address').limit(1);
  const agent = agents?.[0];
  const checks = [];
  if (!agent) checks.push('❌ Create an AI agent');
  else checks.push(`✅ Agent created (${agent.agent_name || agent.agent_id})`);
  if (!agent?.wallet_address) checks.push('❌ Wallet not created');
  else checks.push(`✅ Wallet: ${agent.wallet_address.slice(0, 10)}…`);
  if (!agent?.world_verified) checks.push('❌ World verification required to publish');
  else checks.push('✅ World verified');
  return { message: 'Here is what you need.', answer: `📋 To sell AI services:\n\n${checks.join('\n')}\n\nTo buy AI services:\n✅ Only an agent with a wallet is needed (no verification required)\n\nWorld = identity (who you are)\nThe Graph = trust (how good you are)\nArc = payments (how you get paid)`, steps: tracker.steps };
};

const handleShowServices = async (tracker) => {
  tracker.add('observe', 'Looking up published services', 'Querying marketplace...');
  const { data: agents } = await supabase.from('ai_agents').select('agent_id').limit(1);
  const agentId = agents?.[0]?.agent_id;
  if (!agentId) return { message: 'No agent found.', answer: '❌ No agent found. Create one first.', steps: tracker.steps };
  const { data: services } = await supabase.from('provider_services').select('title, category, unit_price, unit_label, is_active').eq('agent_id', agentId);
  if (!services?.length) return { message: 'No published services.', answer: '📭 No services published yet. Verify with World ID and publish your first AI service.', steps: tracker.steps };
  const list = services.map((s, i) => `${i + 1}. ${s.title} (${s.category}) — ${Number(s.unit_price).toFixed(4)} USDC/${s.unit_label || 'unit'} ${s.is_active ? '✅' : '⏸️'}`).join('\n');
  return { message: `Found ${services.length} service(s).`, answer: `📦 Your Published Services:\n\n${list}`, steps: tracker.steps };
};

const handleHowMuchEarned = async (tracker) => {
  tracker.add('observe', 'Checking earnings', 'Querying invoices...');
  const { data: invoices } = await supabase.from('service_invoices').select('amount_wei, status').eq('status', 'paid');
  const total = (invoices || []).reduce((sum, inv) => sum + Number(inv.amount_wei || 0), 0) / 1e18;
  return { message: `Total earned: ${total.toFixed(4)} USDC`, answer: `💰 Total Earnings\n\n• ${total.toFixed(4)} USDC across ${(invoices || []).length} payment(s)\n\nRevenue comes from Arc settlements verified by The Graph.`, steps: tracker.steps };
};

const handleShowSpending = async (tracker, { organizationId }) => {
  tracker.add('observe', 'Checking spending', 'Querying prepaid purchase history...');
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  let query = supabase.from('service_invoices').select('amount_wei,status,created_at').eq('status', 'paid').gte('created_at', start.toISOString());
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data: invoices, error } = await query;
  if (error) tracker.add('observe', 'Spending lookup degraded', 'The invoice ledger did not return a complete result.');
  const total = (invoices || []).reduce((sum, inv) => sum + Number(inv.amount_wei || 0), 0) / 1e18;
  return { message: `Monthly spending: ${total.toFixed(4)} USDC`, answer: `💳 Spending this month\n\n• ${total.toFixed(4)} USDC paid\n• ${(invoices || []).length} settled purchase(s)\n\nPayments are settled on Arc and verified through The Graph.`, steps: tracker.steps, data: { spending: { monthToDateUSDC: total, settledPurchases: (invoices || []).length } } };
};

const handleRunWorkflow = async (tracker) => {
  tracker.add('decide', 'Workflow handoff', 'A workflow requires step selection, a paying agent, and a policy review before execution.');
  return {
    message: 'Workflow ready to configure.',
    answer: '⚙️ Workflow execution\n\nI can prepare the workflow, but I will not invent steps or providers from a chat request. Open the Workflow Builder to select live Marketplace services, choose the paying agent, and review the payment policy before execution.',
    steps: tracker.steps,
    data: { action: 'workflow_handoff', href: '/developer/network/workflows' }
  };
};

const handleBalance = async (text, tracker) => {
  tracker.add('observe', 'Checking wallet balance', 'Querying Arc network...');

  const status = await getArcNetworkStatus();
  const agents = await supabase.from('ai_agents').select('agent_id, agent_name, wallet_address').limit(5);
  const balances = [];

  for (const agent of (agents.data || [])) {
    if (agent.wallet_address) {
      try {
        const bal = await getArcBalance(agent.wallet_address);
        balances.push({ agent: agent.agent_name || agent.agent_id, address: agent.wallet_address, balance: bal.balanceUsdc });
      } catch { /* skip */ }
    }
  }

  const summary = balances.map((b) => `• ${b.agent}: ${b.balance} USDC`).join('\n') || 'No agent wallets found.';

  return {
    message: `Arc balances (chain ${status.chainId}):\n${summary}`,
    answer: `💰 Arc Wallet Balances\nNetwork: ${status.network} (Chain ${status.chainId})\nBlock: #${status.blockNumber}\n\n${summary}`,
    steps: tracker.steps,
    data: { network: status, balances }
  };
};

const handleHelp = (tracker) => ({
  message: 'I can help you interact with GlobalPay using natural language.',
  answer: `🤖 GlobalPay AI Assistant

I can help you with:

🔍 Provider Discovery
• "Who is the safest OCR provider?"
• "Show risky providers"
• "Which provider earned the most USDC?"

🛒 Purchases
• "Buy the safest OCR provider"
• "Purchase GPU inference under 0.001 USDC"

📋 Your Agent
• "Am I verified?"
• "Why can't I publish?"
• "What do I need before selling?"
• "Show my published services"
• "How much have I earned?"

💰 Wallet
• "Show my balance"
• "Check wallet funds"

✅ Verification
• "Verify my last payment"

Every response explains WHY — backed by The Graph, World AgentKit, and Arc.`,
  steps: tracker.steps,
  data: null
});

// ==================== Main Entry Point ====================

export const processAssistantMessage = async (text, context = {}) => {
  const { consumerAgentId, developerId, organizationId, mode = 'ask' } = context;
  const tracker = createStepTracker();
  const intent = classifyIntent(text);

  logger.info('[ASSISTANT] Intent:', intent, '| Text:', text);

  try {
    if (intent === 'purchase_safest' || intent === 'purchase_cheapest' || intent === 'purchase_under' || intent === 'purchase_generic') {
      if (mode !== 'act') {
        const analysisText = text.replace(/\b(?:buy|purchase|get|acquire|order)\b/gi, '').trim() || 'Which provider is safest?';
        const analysis = await handleFindProviders(analysisText, tracker);
        return { ...analysis, message: 'Analysis complete — no purchase was initiated.', answer: `🔍 Analysis only\n\n${analysis.answer}\n\nNo payment or purchase intent was created because Ask & Analyze mode is active.` };
      }
      return await handlePurchase(text, { consumerAgentId, developerId, organizationId }, tracker);
    }
    if (intent === 'find_safest' || intent === 'find_cheapest' || intent === 'find_earners' || intent === 'find_risky' || intent === 'find_active' || intent === 'find_success_rate') {
      return await handleFindProviders(text, tracker);
    }
    if (intent === 'verify_payment') {
      return await handleVerifyPayment(text, tracker);
    }
    if (intent === 'show_spending') {
      return await handleShowSpending(tracker, { organizationId });
    }
    if (intent === 'compare_providers') {
      return await handleFindProviders('Which provider is safest and most reliable?', tracker);
    }
    if (intent === 'run_workflow') {
      return await handleRunWorkflow(tracker);
    }
    if (intent === 'show_balance') {
      return await handleBalance(text, tracker);
    }
    if (intent === 'show_reputation') {
      return await handleFindProviders('Which provider is safest?', tracker);
    }
    if (intent === 'check_verified') {
      return await handleCheckVerified(tracker, consumerAgentId);
    }
    if (intent === 'why_cant_publish') {
      return await handleWhyCantPublish(tracker);
    }
    if (intent === 'what_do_i_need') {
      return await handleWhatDoINeed(tracker);
    }
    if (intent === 'show_services') {
      return await handleShowServices(tracker);
    }
    if (intent === 'how_much_earned') {
      return await handleHowMuchEarned(tracker);
    }
    return handleHelp(tracker);
  } catch (err) {
    logger.error('[ASSISTANT] Error:', err.message);
    tracker.fail('error', 'Processing failed', err.message);
    return {
      message: `I encountered an error: ${err.message}`,
      answer: `❌ Error: ${err.message}\n\nPlease try again or rephrase your request.`,
      steps: tracker.steps,
      data: null,
      error: err.message
    };
  }
};
