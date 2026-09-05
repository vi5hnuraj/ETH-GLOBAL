/**
 * WalletService — abstraction over embedded/server wallet providers.
 *
 * GlobalPay never hardcodes Privy (or any single provider). All agent-wallet
 * operations go through this interface, so we can swap the underlying provider
 * (Privy Server Wallets today → BO Wallet embedded SDK / any future provider)
 * without touching the agent API layer.
 *
 * A provider must implement:
 *   createWallet({ name, ownerId }) -> Promise<{ walletId, address, provider }>
 *   getAddress(walletId)            -> Promise<string>
 *   getBalance(address)             -> Promise<{ wei: string, formatted: string }>
 *   sendPayment({ walletId, to, wei, token }) -> Promise<{ txHash, network }>
 */

import { createMpcWalletService } from './mpcWalletService.js';
import { createAuditedMpcProvider } from '../mpc/auditedMpcProvider.js';

export const getWalletService = () => {
  return createMpcWalletService();
};

/** Full provider contract for the future audited-MPC integration. */
export const getMpcProvider = () => createAuditedMpcProvider();

export const WALLET_PROVIDER = 'mpc';
