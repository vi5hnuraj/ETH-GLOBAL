import { ethers } from 'ethers';
import { appkit, arcTestnet } from './appkit.js';

const ARC_CHAIN_ID = Number(import.meta.env.VITE_ARC_CHAIN_ID || import.meta.env.VITE_CHAIN_ID || 5042002);
const ARC_RPC = import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io';
const ARC_EXPLORER = import.meta.env.VITE_ARC_EXPLORER_URL || import.meta.env.VITE_EXPLORER_URL || 'https://testnet.arcscan.app';
const ARC_CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Arc Testnet';

// Resolve the currently-connected browser wallet's EIP-1193 provider from the
// AppKit singleton at call time. Unlike a React hook value, this is never a
// stale closure, so it is safe to read immediately after a connect completes.
export const getExternalProvider = () => {
  try {
    return appkit?.getProvider?.('eip155') || null;
  } catch {
    return null;
  }
};

// Poll for the provider to be registered after opening the connect modal.
export const waitForExternalProvider = async (maxAttempts = 25) => {
  for (let i = 0; i < maxAttempts; i++) {
    const p = getExternalProvider();
    if (p) return p;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
};

// Ensure the connected browser wallet operates on Arc Testnet (5042002). Uses the
// raw EIP-1193 request() API directly (reliable across MetaMask/OKX/WC/Rabby).
// Returns true when the wallet was already on Arc Testnet, false after a switch.
export const ensureArcChain = async (rawProvider) => {
  try {
    const rawChainId = await rawProvider.request({ method: 'eth_chainId' });
    if (parseInt(String(rawChainId), 16) === ARC_CHAIN_ID) return true;
  } catch {
    // Chain id unavailable — proceed to switch below.
  }

  const hexId = `0x${ARC_CHAIN_ID.toString(16)}`;
  const addParams = {
    chainId: hexId,
    chainName: ARC_CHAIN_NAME,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: [ARC_RPC],
    blockExplorerUrls: [ARC_EXPLORER],
  };

  try {
    await rawProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
  } catch (switchErr) {
    if (switchErr.code !== 4902 && !/already imported|ALREADY_ADDED/i.test(switchErr.message || '')) {
      throw switchErr;
    }
    await rawProvider.request({ method: 'wallet_addEthereumChain', params: [addParams] });
    await rawProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
  }

  // Give the wallet a moment to settle on the new chain before signing.
  await new Promise((r) => setTimeout(r, 900));
  return false;
};

export const ensureBOTChain = ensureArcChain; // Backwards compatibility alias

// Send a native USDC transfer from the connected browser wallet (MetaMask /
// Rabby / Coinbase / WalletConnect via AppKit). On Arc, USDC is the native gas token.
export const sendExternalTransfer = async (rawProvider, { to, valueWei, gasLimit }) => {
  if (!rawProvider) {
    throw new Error('External wallet not connected. Connect your MetaMask / Arc wallet first.');
  }

  await ensureArcChain(rawProvider);

  const provider = new ethers.providers.Web3Provider(rawProvider);
  const signer = provider.getSigner();

  const gasPrice = await signer.getGasPrice();
  const gas = gasLimit || 21000;
  const gasWei = gasPrice.mul(gas);
  const balance = await signer.getBalance();

  if (balance.lt(valueWei.add(gasWei))) {
    const got = ethers.utils.formatUnits(balance, 18);
    const need = ethers.utils.formatUnits(valueWei.add(gasWei), 18);
    throw new Error(
      `Insufficient Arc wallet balance (${got} USDC). You need ${need} USDC including native gas fee.`
    );
  }

  return signer.sendTransaction({ to, value: valueWei, gasLimit: gas, gasPrice });
};

// Resolve the connected wallet's signer (after chain ensure) — used for the
// "linked wallet" identity check before sending.
export const getExternalSigner = async (rawProvider) => {
  if (!rawProvider) return null;
  await ensureArcChain(rawProvider);
  const provider = new ethers.providers.Web3Provider(rawProvider);
  return provider.getSigner();
};