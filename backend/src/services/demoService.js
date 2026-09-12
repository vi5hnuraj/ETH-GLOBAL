/**
 * Demo Service — one-click autonomous demo that performs the full lifecycle.
 *
 * Flow:
 * 1. Create Agent (or reuse existing)
 * 2. Fund Wallet (or check balance)
 * 3. World Verify (check status)
 * 4. Discover providers via The Graph
 * 5. Rank providers (Trust Engine)
 * 6. Execute Arc settlement
 * 7. Verify Graph indexing
 * 8. Generate invoice + credits
 *
 * Returns a structured demo report with evidence at every stage.
 */
import logger from '../utils/logger.js';
import { supabase } from '../config/supabaseClient.js';
import { askTrustEngine, verifySettlement, getGraphStatus } from './graphIntelligenceService.js';
import { listMarketplace } from './marketplaceService.js';
import { createPrepaidIntent, confirmPrepaidPurchase } from './commerceService.js';
import { getArcBalance, getArcNetworkStatus } from './arcService.js';
import { getVerificationStatus } from './worldAgentKitService.js';

/**
 * Run the full autonomous demo.
 * Returns a structured report with evidence at every stage.
 */
export const runAutonomousDemo = async ({ developerId, organizationId } = {}) => {
  const report = {
    stages: [],
    success: false,
    timestamp: new Date().toISOString()
  };

  const addStage = (name, status, detail, evidence = null) => {
    report.stages.push({ name, status, detail, evidence, timestamp: new Date().toISOString() });
  };

  try {
    // ── Stage 1: Infrastructure Check ─────────────────────────────
    addStage('infrastructure', 'running', 'Checking Arc, The Graph, and database...');

    const arcStatus = await getArcNetworkStatus();
    addStage('infrastructure', 'complete', `Arc connected: chain ${arcStatus.chainId}, block #${arcStatus.blockNumber}`, arcStatus);

    const graphStatus = await getGraphStatus();
    addStage('infrastructure', 'complete', `The Graph synced: ${graphStatus.paymentCount} payments indexed at block #${graphStatus.indexedBlock}`, graphStatus);

    // ── Stage 2: Agent Discovery ──────────────────────────────────
    addStage('agent', 'running', 'Finding consumer agent...');

    const { data: agents } = await supabase
      .from('ai_agents')
      .select('id, agent_id, agent_name, wallet_id, developer_id, organization_id, wallet_address, world_verified, human_backed, agent_book_id')
      .order('created_at', { ascending: true })
      .limit(5);

    const payableAgents = (agents || []).filter((agent) => agent.wallet_id);
    if (!payableAgents.length) {
      addStage('agent', 'failed', 'No consumer agent with an MPC wallet found. Create or fund an agent wallet first.');
      return report;
    }

    let consumerAgent = payableAgents[0];
    const displayAgentName = /\$\(date|\$\{/.test(String(consumerAgent.agent_name || '')) ? 'Funded consumer agent' : (consumerAgent.agent_name || consumerAgent.agent_id);
    addStage('agent', 'complete', `Using agent: ${displayAgentName}`, {
      agentId: consumerAgent.agent_id,
      wallet: consumerAgent.wallet_address,
      worldVerified: consumerAgent.world_verified
    });

    // ── Stage 3: World Verification Check ─────────────────────────
    addStage('world', 'running', 'Checking World AgentKit verification...');

    const verification = await getVerificationStatus(consumerAgent.agent_id);
    if (verification?.world_verified) {
      addStage('world', 'complete', 'Agent is World verified — publishing allowed', {
        verified: true,
        agentBookId: verification.agent_book_id || null,
        agentBookRegistered: Boolean(verification.agent_book_id)
      });
    } else {
      addStage('world', 'pending', 'Agent not World verified — buying still works, publishing requires verification', {
        verified: false,
        note: 'World AgentKit is an authorization gate, not a trust signal'
      });
    }

    // ── Stage 4: Marketplace Discovery ────────────────────────────
    addStage('marketplace', 'running', 'Discovering marketplace services...');

    const marketplace = await listMarketplace({ perPage: 100 });
    const services = (marketplace.services || []).filter((s) => s.provider?.wallet);
    addStage('marketplace', 'complete', `Found ${services.length} services with provider wallets`, {
      serviceCount: services.length,
      services: services.slice(0, 5).map((s) => ({ title: s.title, price: s.unitPrice, provider: s.provider?.name }))
    });

    // ── Stage 5: Trust Engine — Provider Ranking ──────────────────
    addStage('trust', 'running', 'Analyzing providers via The Graph...');

    const trustResult = await askTrustEngine('Which provider is safest?');
    const topProvider = trustResult.recommendation;
    addStage('trust', 'complete', `Top provider: trust ${topProvider?.trustScore}/100, risk ${topProvider?.riskLevel}`, {
      providerId: topProvider?.providerId,
      trustScore: topProvider?.trustScore,
      riskLevel: topProvider?.riskLevel,
      reasoning: topProvider?.reasoning?.slice(0, 3)
    });

    // ── Stage 6: Service Selection ────────────────────────────────
    addStage('select', 'running', 'Selecting best service...');

    const matchingService = services.find((s) =>
      String(s.provider?.wallet).toLowerCase() === String(topProvider?.providerId).toLowerCase()
    ) || services[0];

    if (!matchingService) {
      addStage('select', 'failed', 'No matching service found for the top provider.');
      return report;
    }

    addStage('select', 'complete', `Selected: ${matchingService.title} (${matchingService.unitPrice} USDC)`, {
      serviceId: matchingService.serviceId,
      title: matchingService.title,
      price: matchingService.unitPrice
    });

    const requiredAmount = Number(matchingService.unitPrice || 0);
    let consumerBalance = null;
    try {
      for (const candidate of payableAgents) {
        const balance = candidate.wallet_address ? await getArcBalance(candidate.wallet_address) : null;
        if (balance && Number(balance.balanceUsdc || 0) >= requiredAmount) {
          consumerAgent = candidate;
          consumerBalance = balance;
          if (candidate.agent_id !== agents?.[0]?.agent_id) {
            addStage('agent', 'complete', `Using funded agent: ${candidate.agent_name || candidate.agent_id}`, {
              agentId: candidate.agent_id,
              wallet: candidate.wallet_address,
              balanceUSDC: balance.balanceUsdc
            });
          }
          break;
        }
      }
    } catch (err) {
      addStage('agent', 'failed', `Unable to check consumer wallet balance: ${err.message}`);
      return report;
    }
    const availableAmount = Number(consumerBalance?.balanceUsdc || 0);
    if (!consumerBalance || availableAmount < requiredAmount) {
      addStage('settlement', 'failed', `Insufficient USDC balance. Required ${requiredAmount.toFixed(4)} USDC; available ${availableAmount.toFixed(4)} USDC.`, {
        requiredUSDC: requiredAmount,
        availableUSDC: availableAmount,
        wallet: consumerAgent.wallet_address
      });
      return report;
    }

    // ── Stage 7: Arc Settlement ───────────────────────────────────
    addStage('settlement', 'running', 'Executing Arc payment...');

    let settlement = null;
    try {
      const intent = await createPrepaidIntent({
        developerId,
        organizationId,
        consumerAgent,
        service: { ...matchingService, service_id: matchingService.serviceId },
        quantity: '1',
        reason: 'Autonomous demo — one-click lifecycle verification'
      });

      settlement = await confirmPrepaidPurchase({ sessionId: intent.session.sessionId, organizationId });

      if (settlement.success) {
        addStage('settlement', 'complete', `Payment settled: ${settlement.txHash}`, {
          txHash: settlement.txHash,
          amount: settlement.amountBOT,
          explorerUrl: `https://testnet.arcscan.app/tx/${settlement.txHash}`
        });
      } else {
        addStage('settlement', 'failed', `Payment failed: ${settlement.failureReason}`, settlement);
      }
    } catch (err) {
      addStage('settlement', 'failed', `Settlement error: ${err.message}`);
    }

    // ── Stage 8: Graph Verification ───────────────────────────────
    if (settlement?.success) {
      addStage('verify', 'running', 'Verifying payment on The Graph...');

      try {
        const verification = await verifySettlement(settlement.txHash);
        if (verification.verified) {
          addStage('verify', 'complete', `Payment indexed at block #${verification.settlement?.blockNumber}`, {
            verified: true,
            blockNumber: verification.settlement?.blockNumber,
            entityId: verification.settlement?.id
          });
        } else {
          addStage('verify', 'pending', 'Payment submitted — awaiting Graph indexing');
        }
      } catch (err) {
        addStage('verify', 'failed', `Graph verification error: ${err.message}`);
      }
    }

    // ── Final Report ──────────────────────────────────────────────
    report.success = settlement?.success || false;
    report.summary = {
      arc: { chainId: arcStatus.chainId, blockNumber: arcStatus.blockNumber },
      graph: { paymentCount: graphStatus.paymentCount, indexedBlock: graphStatus.indexedBlock },
      world: { verified: verification?.world_verified || false },
      settlement: settlement?.success ? { txHash: settlement.txHash, amount: settlement.amountBOT } : null,
      provider: topProvider ? { trustScore: topProvider.trustScore, riskLevel: topProvider.riskLevel } : null
    };

    return report;
  } catch (err) {
    logger.error('[DEMO] Autonomous demo failed:', err.message);
    addStage('error', 'failed', `Demo failed: ${err.message}`);
    return report;
  }
};
