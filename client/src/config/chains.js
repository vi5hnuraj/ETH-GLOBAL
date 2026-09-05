// client/src/config/chains.js
// Base Sepolia Testnet Configuration

const chainId = Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_BASE_CHAIN_ID || 84532);
const rpcUrl = import.meta.env.VITE_RPC_URL || import.meta.env.VITE_BASE_RPC_URL || "https://sepolia.base.org";
const chainName = import.meta.env.VITE_CHAIN_NAME || "Base Sepolia";
const explorerUrl = import.meta.env.VITE_EXPLORER_URL || import.meta.env.VITE_BASE_EXPLORER_URL || "https://sepolia.basescan.org/";
const symbol = import.meta.env.VITE_CHAIN_SYMBOL || "ETH";

export const activeChain = {
  chainId: chainId,
  rpc: [rpcUrl],
  nativeCurrency: {
    decimals: 18,
    name: symbol,
    symbol: symbol,
  },
  shortName: "base-sepolia",
  slug: "base-sepolia",
  testnet: true,
  chain: chainName,
  name: chainName,
  explorers: [
    {
      name: `${chainName} Explorer`,
      url: explorerUrl,
      standard: "EIP309"
    }
  ]
};
