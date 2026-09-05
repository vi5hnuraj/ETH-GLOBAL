import '../utils/appkit';
import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react';

/**
 * useExternalWallet — the browser-side "External Wallet" via Web3Modal/AppKit.
 * Connects MetaMask / WalletConnect / injected wallets and returns the linked
 * EVM address. Distinct from the server-managed internal MPC wallet.
 */
export const useExternalWallet = () => {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();

  const connect = async () => {
    try {
      await open();
      return true;
    } catch (err) {
      console.error('External wallet connect failed:', err);
      return false;
    }
  };

  return { address, isConnected, connect, disconnect };
};
