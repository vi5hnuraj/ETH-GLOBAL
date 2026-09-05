/**
 * Provider-neutral integration adapter for an audited external 2-of-3 MPC
 * system. It deliberately contains no key shares, threshold math, mock
 * signatures, or synthetic transaction results.
 */
import {
  assertBroadcastAllowed,
  requestMpc,
  resolveChainId
} from '../wallets/mpcWalletService.js';
import { assertMpcSigningAllowed } from './mpcRuntime.js';

const serviceUrl = () => process.env.MPC_SERVICE_URL || '';

const required = (value, name) => {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
};

const validatedThreshold = ({ threshold, parties }) => {
  if (Number(threshold) !== 2 || Number(parties) !== 3) {
    throw new Error('GlobalPay only permits external 2-of-3 MPC wallets.');
  }
};

const endpoint = (path) => {
  const base = required(serviceUrl(), 'MPC_SERVICE_URL');
  return `${base.replace(/\/$/, '')}${path}`;
};

const response = async (res, operation) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`External MPC ${operation} failed: ${res.status} ${text}`);
  }
  return res.json();
};

/**
 * The provider exposes the complete integration contract. The provider itself
 * must durably verify request signatures/replay nonces, organization/RBAC and
 * API-key scopes, policy decisions, and audit records before signing.
 */
export const createAuditedMpcProvider = ({ request = requestMpc } = {}) => ({
  name: 'external-audited-mpc',
  threshold: { required: 2, parties: 3 },

  async createWallet({ ownerId, name, metadata = {}, threshold = 2, parties = 3 }) {
    validatedThreshold({ threshold, parties });
    const chainId = resolveChainId();
    return response(await request(endpoint('/api/v1/wallets'), {
      method: 'POST', body: { ownerId: required(ownerId, 'ownerId'), name, metadata, threshold: 2, parties: 3, chainId }
    }), 'wallet creation');
  },

  async getWallet(walletId) {
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}`)), 'wallet lookup');
  },

  async getWalletAddress(walletId) {
    const wallet = await this.getWallet(walletId);
    return required(wallet.address, 'external MPC wallet address');
  },

  async getBalance(walletId) {
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}/balance`)), 'balance lookup');
  },

  async authorizeSigning({ walletId, authorization }) {
    assertMpcSigningAllowed();
    required(authorization?.organizationId, 'authorization.organizationId');
    required(authorization?.actorId, 'authorization.actorId');
    required(authorization?.idempotencyKey, 'authorization.idempotencyKey');
    required(authorization?.nonce, 'authorization.nonce');
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}/signing-jobs/authorize`), {
      method: 'POST', body: { authorization, chainId: resolveChainId() }
    }), 'signing authorization');
  },

  async signTransaction({ walletId, authorizationId, transaction, idempotencyKey }) {
    assertMpcSigningAllowed();
    required(authorizationId, 'authorizationId');
    required(idempotencyKey, 'idempotencyKey');
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}/signing-jobs/${encodeURIComponent(authorizationId)}/sign`), {
      method: 'POST', body: { transaction, idempotencyKey, chainId: resolveChainId() }
    }), 'transaction signing');
  },

  async broadcastTransaction({ walletId, authorizationId, signedTransaction, idempotencyKey }) {
    const chainId = resolveChainId();
    assertMpcSigningAllowed();
    assertBroadcastAllowed(chainId);
    required(authorizationId, 'authorizationId');
    required(signedTransaction, 'signedTransaction');
    required(idempotencyKey, 'idempotencyKey');
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}/signing-jobs/${encodeURIComponent(authorizationId)}/broadcast`), {
      method: 'POST', body: { signedTransaction, idempotencyKey, chainId }
    }), 'transaction broadcast');
  },

  async getTransactionStatus({ walletId, operationId }) {
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}/operations/${encodeURIComponent(required(operationId, 'operationId'))}`)), 'transaction status');
  },

  async recoverKeyShares({ walletId, recoveryRequest }) {
    required(recoveryRequest?.approvalId, 'recoveryRequest.approvalId');
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}/recovery`), {
      method: 'POST', body: { recoveryRequest }
    }), 'key/share recovery');
  },

  async rotateKeyShares({ walletId, rotationRequest }) {
    required(rotationRequest?.approvalId, 'rotationRequest.approvalId');
    return response(await request(endpoint(`/api/v1/wallets/${encodeURIComponent(required(walletId, 'walletId'))}/rotation`), {
      method: 'POST', body: { rotationRequest }
    }), 'key/share rotation');
  },

  async healthCheck() {
    return response(await request(endpoint('/api/v1/health')), 'health check');
  }
});
