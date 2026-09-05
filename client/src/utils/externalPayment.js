import { ethers } from 'ethers';
import { appkit } from './appkit.js';

const ETH_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_BASE_CHAIN_ID || 84532);
const ETH_RPC = import.meta.env.VITE_RPC_URL || import.meta.env.VITE_BASE_RPC_URL || 'https://sepolia.base.org';
const ETH_EXPLORER = import.meta.env.VITE_EXPLORER_URL || import.meta.env.VITE_BASE_EXPLORER_URL || 'https://sepolia.basescan.org/';
const ETH_CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Base Sepolia';

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

// Ensure the connected browser wallet operates on Base Sepolia (84532). Uses the
// raw EIP-1193 request() API directly (reliable across MetaMask/OKX/WC).
// Returns true when the wallet was already on Base Sepolia, false after a switch.
const ensureETHChain = async (rawProvider) => {
  try {
    const rawChainId = await rawProvider.request({ method: 'eth_chainId' });
    if (parseInt(String(rawChainId), 16) === ETH_CHAIN_ID) return true;
  } catch {
    // Chain id unavailable — proceed to switch below.
  }

  const hexId = `0x${ETH_CHAIN_ID.toString(16)}`;
  const addParams = {
    chainId: hexId,
    chainName: ETH_CHAIN_NAME,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: [ETH_RPC],
    blockExplorerUrls: [ETH_EXPLORER],
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

// Send a native ETH transfer from the connected browser wallet (MetaMask /
// OKX / WalletConnect via AppKit). `rawProvider` is the EIP-1193 provider
// exposed by AppKit — it is NOT an ethers provider, so we wrap it with
// ethers Web3Provider only AFTER the chain is correct (ethers v5 caches the
// detected network on the wrapper, so a stale wrapper would throw).
export const sendExternalTransfer = async (rawProvider, { to, valueWei, gasLimit }) => {
  if (!rawProvider) {
    throw new Error('External wallet not connected. Connect your MetaMask / OKX wallet first.');
  }

  await ensureETHChain(rawProvider);

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
      `Insufficient external wallet balance (${got} ETH). You need ${need} ETH including transaction fee.`
    );
  }

  return signer.sendTransaction({ to, value: valueWei, gasLimit: gas, gasPrice });
};

// Resolve the connected wallet's signer (after chain ensure) — used for the
// "linked wallet" identity check before sending.
export const getExternalSigner = async (rawProvider) => {
  if (!rawProvider) return null;
  await ensureETHChain(rawProvider);
  const provider = new ethers.providers.Web3Provider(rawProvider);
  return provider.getSigner();
};