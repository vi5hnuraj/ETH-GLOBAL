import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import api, { getCachedUserDetailSync, USER_CACHE_STALE_MS, refreshUserCache } from './api.js';

let activeWallet = null;

export const mpcChain = {
  chainId: Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_BASE_CHAIN_ID || 84532),
  rpcUrl: import.meta.env.VITE_RPC_URL || import.meta.env.VITE_BASE_RPC_URL || "https://sepolia.base.org"
};

/**
 * Dynamically resolves the active wallet provider (custom server-side MPC).
 */
export const getActiveMpcWallet = () => {
  if (activeWallet) return activeWallet;
  const user = getCachedUserDetailSync();
  if (user) {
    // The cached user detail never self-invalidates in the sync path, so a
    // wallet regenerated server-side (Profile "Generate platform Wallet",
    // provisioning heal) may linger as a stale address indefinitely. Kick off
    // a background refresh when the cache is old; subsequent reads then mirror
    // the live provider_user_id / internal wallet address.
    const address = user.internalWalletAddress || user.internal_wallet_address;
    const walletId = user.walletId || user.wallet_id || user.provider_user_id;
    if (address) {
      try {
        const raw = localStorage.getItem('globalpay_user_cache');
        if (raw) {
          const rec = JSON.parse(raw);
          if (!rec.timestamp || Date.now() - rec.timestamp > USER_CACHE_STALE_MS) {
            refreshUserCache();
          }
        }
      } catch { /* unreadable cache: refresh attempts below */ }
      return {
        address: address,
        walletId: walletId,
        walletClientType: 'mpc',
        switchChain: async () => {},
        getEthereumProvider: async () => {
          throw new Error('Direct ethereum provider is not available for mpc wallets on client.');
        }
      };
    }
  }
  return null;
};

export const setPrivyWallet = (wallet) => {
  // No-op since Privy is uninstalled
};

/**
 * Backwards-compatible mock connector function (simply returns active signer state)
 */
export const connectMpcWallet = async (token) => {
  const wallet = getActiveMpcWallet();
  if (wallet) return wallet;
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      const liveWallet = getActiveMpcWallet();
      if (liveWallet) {
        clearInterval(interval);
        resolve(liveWallet);
      }
      attempts++;
      if (attempts > 50) {
        clearInterval(interval);
        reject(new Error("Timeout waiting for MPC wallet initialization."));
      }
    }, 100);
  });
};

/**
 * Returns the EVM address of the active wallet
 */
export const getAddress = () => {
  const wallet = getActiveMpcWallet();
  if (!wallet) return "";
  return wallet.address;
};

/**
 * Signs and sends an on-chain transaction using Go MPC (via backend)
 * The backend runs the policy-authorized MPC broadcast (no arbitrary
 * txPayload/nonce/gas/data is trusted from the client).
 */
export const sendTransaction = async (txOpts) => {
  const wallet = getActiveMpcWallet();
  if (!wallet) throw new Error("Wallet not connected.");
  
  const res = await api.post('/auth/mpc-send', {
    to: txOpts.to,
    value: txOpts.value?.toString() || '0'
  });
  return {
    hash: res.data.txHash,
    wait: async () => {
      return { status: 1 };
    }
  };
};

/**
 * Signs a raw transaction without broadcasting — returns RLP-encoded signed tx hex
 * Used for scheduled payments (sign now, broadcast later)
 */
export const signRawTransaction = async (txOpts) => {
  const wallet = getActiveMpcWallet();
  if (!wallet) throw new Error("Wallet not connected.");

  const res = await api.post('/auth/mpc-sign', {
    txPayload: {
      to: txOpts.to,
      value: txOpts.value?.toString() || '0',
      data: txOpts.data || '',
      gasLimit: txOpts.gasLimit ? Number(txOpts.gasLimit) : undefined
    }
  });
  return res.data.signature;
};

/**
 * Signs a cryptographic message using the active wallet
 */
export const signMessage = async (message) => {
  throw new Error("Client-side message signing is not supported for server-managed MPC wallets.");
};

/**
 * Returns the Web3Provider Signer instance
 */
export const getSigner = () => {
  return null;
};

/**
 * Returns the Web3Provider instance
 */
export const getProvider = () => {
  return new ethers.providers.JsonRpcProvider(mpcChain.rpcUrl);
};

/**
 * Check connection status
 */
export const isMpcConnected = () => {
  return !!getActiveMpcWallet();
};

export const getMpcAccount = () => {
  const wallet = getActiveMpcWallet();
  if (!wallet) return null;
  return {
    address: wallet.address,
    sendTransaction: async (txOpts) => {
      const tx = await sendTransaction(txOpts);
      return { transactionHash: tx.hash };
    }
  };
};

export const getMpcWallet = () => getActiveMpcWallet();

// ==================== Backward Compatibility Hooks ====================

export const useAddress = () => {
  const checkDisconnected = () => typeof window !== 'undefined' && (
    localStorage.getItem('external_wallet_disconnected') === 'true' ||
    localStorage.getItem('wallet_disconnected') === 'true' ||
    sessionStorage.getItem('wallet_disconnected') === 'true'
  );

  const [address, setAddress] = useState(() => {
    const wallet = getActiveMpcWallet();
    return (wallet && !checkDisconnected()) ? wallet.address : "";
  });

  useEffect(() => {
    const wallet = getActiveMpcWallet();
    const live = (wallet && !checkDisconnected()) ? wallet.address : "";
    if (live !== address) setAddress(live);
  }, [address]);

  return checkDisconnected() ? "" : address;
};

export const useBalance = (tokenAddress) => {
  const [data, setData] = useState({ displayValue: "0", symbol: "ETH" });
  const [isLoading, setIsLoading] = useState(true);
  const address = useAddress();

  useEffect(() => {
    if (!address) {
      setData({ displayValue: "0", symbol: "ETH" });
      setIsLoading(false);
      return;
    }

    const fetchBalance = async () => {
      try {
        const provider = getProvider();
        if (!tokenAddress) {
          const bal = await provider.getBalance(address);
          setData({
            displayValue: ethers.utils.formatEther(bal),
            symbol: "ETH"
          });
        } else {
          const abi = ["function balanceOf(address) view returns (uint256)"];
          const contract = new ethers.Contract(tokenAddress, abi, provider);
          const bal = await contract.balanceOf(address);
          setData({
            displayValue: ethers.utils.formatUnits(bal, 18),
            symbol: "USDC"
          });
        }
      } catch (err) {
        console.warn("🤖 [MPC WALLET] Balance query failed:", err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [address, tokenAddress]);

  return { data, isLoading };
};

export const useNetwork = () => {
  const switchChain = async (chainId) => {};
  return [
    { data: { chain: { id: mpcChain.chainId } } },
    switchChain
  ];
};

export const useSDK = () => {
  return {
    getSigner: async () => {
      return null;
    },
    getProvider: () => {
      return getProvider();
    }
  };
};

export const useContract = (contractAddress) => {
  return { contract: contractAddress || null };
};

export const useTransferToken = () => {
  return {
    mutateAsync: async (transferOpts) => {
      console.log("Mock transferToken called:", transferOpts);
    },
    isLoading: false,
    error: null
  };
};

export const useContractRead = () => {
  return { data: ethers.BigNumber.from(0), isLoading: false, error: null };
};

export const useContractWrite = () => {
  return {
    mutateAsync: async () => {
      console.log("Mock contract write executed.");
    },
    isLoading: false,
    error: null
  };
};

export const useDisconnect = () => {
  return async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('external_wallet_disconnected', 'true');
      localStorage.setItem('wallet_disconnected', 'true');
      sessionStorage.setItem('wallet_disconnected', 'true');
    }
  };
};

// Custom Connect Wallet button component
export const ConnectWallet = ({ className, btnTitle, onClick }) => {
  const address = useAddress();

  if (!address) {
    return React.createElement(
      'button',
      {
        onClick: () => {
          if (onClick) return onClick();
          if (typeof window !== 'undefined') {
            localStorage.removeItem('external_wallet_disconnected');
            localStorage.removeItem('wallet_disconnected');
            sessionStorage.removeItem('wallet_disconnected');
          }
          window.location.href = '/profile';
        },
        className: `bg-zinc-800 hover:bg-zinc-700 text-white font-medium px-4 py-2 rounded-lg border border-zinc-700 text-sm ${className || ''}`
      },
      btnTitle || 'Link MPC Wallet'
    );
  }

  return React.createElement(
    'button',
    {
      className: `bg-zinc-800 text-white font-medium px-4 py-2 rounded-lg border border-zinc-700 text-sm ${className || ''}`
    },
    `${address.slice(0, 6)}...${address.slice(-4)}`
  );
};
