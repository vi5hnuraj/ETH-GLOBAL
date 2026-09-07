import { createAppKit } from '@reown/appkit/react';
import { Ethers5Adapter } from '@reown/appkit-adapter-ethers5';
import { defineChain } from '@reown/appkit/networks';

export const arcTestnet = defineChain({
  id: 5042002,
  caipNetworkId: 'eip155:5042002',
  chainNamespace: 'eip155',
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_ARC_RPC_URL || 'https://rpc.testnet.arc.io'],
      webSocket: ['wss://rpc.testnet.arc.io'],
    },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: import.meta.env.VITE_ARC_EXPLORER_URL || 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

export const arcMainnet = defineChain({
  id: 5042001,
  caipNetworkId: 'eip155:5042001',
  chainNamespace: 'eip155',
  name: 'Arc Mainnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  rpcUrls: {
    default: {
      http: ['https://rpc.arc.io'],
    },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://arcscan.app' },
  },
  testnet: false,
});

export const appkit = createAppKit({
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '8fe9b4cfa486d6e1632640d06975e3b7',
  adapters: [new Ethers5Adapter()],
  networks: [arcTestnet, arcMainnet],
  metadata: {
    name: 'GlobalPay — Arc L1 Stablecoin Payments & AI Agents',
    description: 'Programmable USDC money flows, autonomous AI agents, and AppKit on Arc',
    url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
    icons: []
  },
  features: { analytics: false },
  themeMode: 'dark',
  themeVariables: { '--w3m-accent': '#06b6d4' }
});
