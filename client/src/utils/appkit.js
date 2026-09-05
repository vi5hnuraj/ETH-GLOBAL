import { createAppKit } from '@reown/appkit/react';
import { Ethers5Adapter } from '@reown/appkit-adapter-ethers5';
import { defineChain } from 'viem';

export const activeChain = defineChain({
  id: Number(import.meta.env.VITE_CHAIN_ID || 84532),
  name: import.meta.env.VITE_CHAIN_NAME || 'Base Sepolia',
  nativeCurrency: { 
    name: import.meta.env.VITE_CHAIN_SYMBOL || 'ETH', 
    symbol: import.meta.env.VITE_CHAIN_SYMBOL || 'ETH', 
    decimals: 18 
  },
  rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL || 'https://sepolia.base.org'] } },
  blockExplorers: { 
    default: { 
      name: `${import.meta.env.VITE_CHAIN_NAME || 'Base Sepolia'} Explorer`, 
      url: import.meta.env.VITE_EXPLORER_URL || 'https://sepolia.basescan.org/' 
    } 
  }
});

export const appkit = createAppKit({
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '8fe9b4cfa486d6e1632640d06975e3b7',
  adapters: [new Ethers5Adapter()],
  networks: [activeChain],
  metadata: {
    name: 'GlobalPay',
    description: 'GlobalPay — AI agent payment infrastructure on Base',
    url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
    icons: []
  },
  features: { analytics: false },
  themeMode: 'dark',
  themeVariables: { '--w3m-accent': '#06b6d4' }
});
