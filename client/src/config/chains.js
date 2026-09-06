// client/src/config/chains.js
// Arc Testnet Configuration (Circle L1 with USDC Native Gas)

const chainId = Number(import.meta.env.VITE_ARC_CHAIN_ID || import.meta.env.VITE_CHAIN_ID || 5042002);
const rpcUrl = import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_RPC_URL || "https://rpc.testnet.arc.io";
const chainName = import.meta.env.VITE_ARC_CHAIN_NAME || import.meta.env.VITE_CHAIN_NAME || "Arc Testnet";
const explorerUrl = import.meta.env.VITE_ARC_EXPLORER_URL || import.meta.env.VITE_EXPLORER_URL || "https://testnet.arcscan.app/";
const symbol = import.meta.env.VITE_CHAIN_SYMBOL || "USDC";

export const activeChain = {
  chainId: chainId,
  rpc: [
    rpcUrl,
    "https://rpc.blockdaemon.testnet.arc.io",
    "https://rpc.drpc.testnet.arc.io",
    "https://rpc.quicknode.testnet.arc.io"
  ],
  nativeCurrency: {
    decimals: 18,
    name: "USDC",
    symbol: symbol,
  },
  shortName: "arc-testnet",
  slug: "arc-testnet",
  testnet: true,
  chain: chainName,
  name: chainName,
  explorers: [
    {
      name: `ArcScan Explorer`,
      url: explorerUrl,
      standard: "EIP309"
    }
  ]
};
