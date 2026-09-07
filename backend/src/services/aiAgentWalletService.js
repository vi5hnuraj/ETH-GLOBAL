/**
 * Compatibility layer — legacy `/api/agent/wallet/*` endpoints delegate to the
 * new AgentService / WalletService platform. Kept so existing consumers are not
 * broken while the platform is migrated to /api/agents/*.
 */

import {
  createAgent,
  getAgentByApiKey,
  getAgentBalance as getAgentBalanceService,
  agentPay,
  getAgentHistory,
  generateApiKey,
  hashApiKey
} from './agentService.js';

export { generateApiKey, hashApiKey };

export const createAiWallet = async ({ name, ownerEmail }) => {
  const result = await createAgent({ name, description: null, developerId: ownerEmail || null });
  return {
    agentId: result.agentId,
    name,
    ownerEmail: ownerEmail || null,
    walletAddress: result.wallet,
    apiKey: result.apiKey,
    apiKeyPrefix: result.apiKeyPrefix,
    network: result.network,
    chainId: result.chainId
  };
};

export { getAgentByApiKey };

export const getAgentBalance = async (agent) => {
  const result = await getAgentBalanceService(agent);
  return {
    wei: result.wei,
    formatted: result.balance.replace(' USDC', '')
  };
};

export const sendAgentPayment = async (agent, { destinationAddress, amount, wei, note }) => {
  const result = await agentPay(agent, {
    to: destinationAddress,
    amount,
    wei,
    token: 'USDC',
    note
  });
  return {
    txHash: result.txHash,
    from: result.from,
    to: result.to,
    amount: result.amount,
    gasSpent: null,
    explorerUrl: result.explorerUrl,
    transactionId: result.transactionId
  };
};

export const getAgentLedger = async (agent, limit) => {
  return getAgentHistory(agent, { limit });
};
