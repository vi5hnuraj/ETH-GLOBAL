import React, { useState, useRef, useEffect } from 'react';
import { FiMessageSquare, FiSend, FiX, FiZap, FiCheckCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api, { getCachedUserDetail, getCachedUserDetailSync } from '../../utils/api';
import axios from 'axios';
import { ethers } from 'ethers';
import { getMpcAccount } from '../../utils/mpcWallet';
import ConfirmPaymentModal from '../ConfirmPaymentModal';

const AiRemittanceAgent = ({ user: initialUser, refreshData }) => {
  const [currentUser, setCurrentUser] = useState(() => initialUser || getCachedUserDetailSync());
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [cancelSelections, setCancelSelections] = useState({});
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: "👋 Hi! I'm your GlobalPay AI Agent. Powered by GlobalPay, I can execute global payments & vault actions for you instantly!\n\n💡 Type `/` or click the command icon below to choose from all tools.",
    }
  ]);

  // Draggable position state
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_agent_pos');
      return saved ? JSON.parse(saved) : { bottom: 24, right: 24 };
    } catch (e) {
      return { bottom: 24, right: 24 };
    }
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialBottom: 24, initialRight: 24 });

  useEffect(() => {
    if (initialUser) {
      setCurrentUser(initialUser);
    } else {
      getCachedUserDetail()
        .then(user => setCurrentUser(user))
        .catch(() => { });
    }
  }, [initialUser]);

  const handlePointerDown = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragRef.current = {
      isDragging: false,
      startX: clientX,
      startY: clientY,
      initialBottom: position.bottom,
      initialRight: position.right
    };

    const handlePointerMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const deltaX = dragRef.current.startX - moveX;
      const deltaY = dragRef.current.startY - moveY;

      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        dragRef.current.isDragging = true;
        setIsDragging(true);
      }

      if (dragRef.current.isDragging) {
        const newRight = Math.max(10, Math.min(window.innerWidth - 70, dragRef.current.initialRight + deltaX));
        const newBottom = Math.max(10, Math.min(window.innerHeight - 70, dragRef.current.initialBottom + deltaY));
        const newPos = { bottom: newBottom, right: newRight };
        setPosition(newPos);
      }
    };

    const handlePointerUp = () => {
      if (dragRef.current.isDragging) {
        localStorage.setItem('ai_agent_pos', JSON.stringify(position));
        setTimeout(() => setIsDragging(false), 50);
      }
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);
  };

  const handleToggle = () => {
    if (!isDragging && !dragRef.current.isDragging) {
      setIsOpen(!isOpen);
    }
  };

  const hasExternalWallet = !!(currentUser?.metamask || currentUser?.metamask_id || currentUser?.externalWallet);
  const hasMetaMask = !!window.ethereum;
  const hasMpc = !!getMpcAccount();

  const commandTools = [
    { command: '/send', title: 'Send USDC', prompt: 'Send 1 USDC to @username', desc: 'Transfer USDC to @username' },
    { command: '/balance', title: 'Check Balance', prompt: 'Show my balance', desc: 'View fiat & on-chain vault balances' },
    { command: '/history', title: 'Transaction History', prompt: 'Show my transactions', desc: 'View recent activity log' },
    { command: '/wallet', title: 'My Wallets', prompt: 'Show my wallet addresses', desc: 'Internal Vault & external wallet' },
    { command: '/find', title: 'Find User', prompt: 'Find user @username', desc: 'Search GlobalPay user' },
    ...(hasExternalWallet ? [{ command: '/schedule', title: 'Schedule Payment', prompt: 'Schedule 5 USDC to @username tomorrow at 3pm', desc: 'Queue future transfer (external wallet)' }] : []),
    { command: '/cancel', title: 'Cancel Schedule', prompt: 'Cancel my recent scheduled payment', desc: 'Cancel & refund a scheduled payment' },

    { command: '/invoice', title: 'Create Invoice', prompt: 'Create invoice 10 USDC for @username', desc: 'Generate payment invoice' },
    { command: '/help', title: 'Help', prompt: 'What can you do?', desc: 'List all available commands' },
  ];

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/') || val.includes(' /')) {
      setShowSuggestions(true);
    } else if (!val.trim()) {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (cmd) => {
    setInput(cmd.prompt);
    setShowSuggestions(false);
  };

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    setShowSuggestions(false);

    const userMessage = { id: Date.now(), sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await api.post('/agent/chat', {
        message: userMessage.text,
        timezoneOffset: new Date().getTimezoneOffset()
      });
      const { reply, executedTool, toolResult } = response.data || {};

      setIsTyping(false);

      if (reply) {
        const isAuth = (executedTool === 'schedulePayment' || executedTool === 'cancelSchedulePayment') && toolResult?.requiresAuth;
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: reply,
          isSuccess: toolResult?.success,
          isAction: isAuth ? true : toolResult?.actionRequired,
          isAuth,
          authData: isAuth ? toolResult : null,
          cancelPlan: toolResult?.cancelPlan ? (toolResult.cancelOptions || []) : null,
          transactionData: toolResult?.action
        }]);

        const mutatingTools = ['sendBot', 'payMerchant', 'payQR', 'schedulePayment', 'createInvoice', 'switchPrimary', 'cancelSchedulePayment'];
        if (refreshData && mutatingTools.includes(executedTool)) {
          refreshData();
        }
      } else {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'ai',
          text: "Command executed successfully!"
        }]);
      }
    } catch (error) {
      setIsTyping(false);
      console.error("AI Agent Error:", error.response?.data || error.message);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'ai',
        text: `❌ ${error.response?.data?.message || 'Failed to process AI command.'}`
      }]);
    }
  };

  const executeTransaction = async (data, messageId, walletType = 'internal') => {
    if (!currentUser) {
      toast.error('User data not found. Please log in.');
      return;
    }

    if (walletType === 'external') {
      await executeTransactionExternal(data, messageId);
      return;
    }

    const account = getMpcAccount();
    if (!account) {
      toast.error('Your Privy MPC wallet is not ready. Please reconnect and try again.');
      return;
    }

    // Ask for explicit sign-approval before broadcasting — same guarantee an
    // external wallet (MetaMask/OKX) popup provides on the other rail.
    setPendingConfirm({
      messageId,
      to: data.targetAddress,
      amount: Number(data.amount),
      tokenValueBig: BigInt(ethers.utils.parseUnits(Number(data.amount).toFixed(18), 18).toString()),
      data
    });
  };

  const performInternalSend = async ({ data, messageId, to, tokenValueBig }) => {
    const account = getMpcAccount();
    if (!account) {
      toast.error('Your Privy MPC wallet is not ready. Please reconnect and try again.');
      setPendingConfirm(null);
      return;
    }

    setIsSending(true);
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, isAction: false, text: m.text + '\n\n⏳ Awaiting MPC wallet approval...' } : m
    ));

    try {
      const result = await account.sendTransaction({ to, value: tokenValueBig });

      await api.post('/pay/paymentWrite', {
        date: new Date().toISOString(),
        to: data.recipient,
        amt: Number(data.amount),
        sender: currentUser._id || currentUser.id,
        keyword: 'AI Agent transfer',
        coin: data.currency || 'USDC',
        txHash: result.transactionHash,
        botAmountSnapshot: Number(data.amount),
        senderWalletType: 'internal',
        destinationAddress: data.targetAddress
      });

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Awaiting MPC wallet approval...', '') } : m
      ));

      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `✅ Payment confirmed! ${data.amount} ${data.currency || 'USDC'} was sent to ${data.recipient}.`,
        isSuccess: true
      }]);

      setPendingConfirm(null);
      setIsSending(false);
      if (refreshData) refreshData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transaction failed');
      setPendingConfirm(null);
      setIsSending(false);
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `❌ Transaction failed: ${err.response?.data?.message || 'Insufficient balance or invalid Pay Tag.'}`
      }]);
    }
  };

  const executeTransactionExternal = async (data, messageId) => {
    const mmProvider = getMetaMaskProvider();
    if (!mmProvider) {
      toast.error('MetaMask not detected. Please install or connect MetaMask.');
      return;
    }

    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, isAction: false, text: m.text + '\n\n⏳ Awaiting MetaMask approval...' } : m
    ));

    const chainIdHex = '0x' + Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_ARC_CHAIN_ID || 5042002).toString(16);

    try {
      let currentChainId;
      try {
        currentChainId = await mmProvider.request({ method: 'eth_chainId' });
      } catch (e) {
        currentChainId = null;
      }

      if (currentChainId !== chainIdHex) {
        try {
          await mmProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
        } catch (e) {
          if (e.code === 4902) {
            await mmProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainIdHex,
                rpcUrls: [import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io'],
                chainName: import.meta.env.VITE_ARC_CHAIN_NAME || import.meta.env.VITE_CHAIN_NAME || 'Arc Testnet',
                nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
                blockExplorerUrls: [import.meta.env.VITE_ARC_EXPLORER_URL || import.meta.env.VITE_EXPLORER_URL || 'https://testnet.arcscan.app']
              }]
            });
          }
        }
      }

      const accounts = await mmProvider.request({ method: 'eth_requestAccounts' });
      const fromAddr = accounts[0];

      const valueHex = ethers.utils.hexlify(
        ethers.utils.parseUnits(Number(data.amount).toFixed(18), 18)
      );

      const txHash = await mmProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: fromAddr,
          to: data.targetAddress,
          value: valueHex,
        }]
      });

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Awaiting MetaMask approval...', '\n\n⏳ Waiting for confirmation...') } : m
      ));

      const receipt = await waitForTxReceipt(mmProvider, txHash);

      if (Number(receipt.status) !== 1) {
        throw new Error('Transaction reverted on chain');
      }

      await api.post('/pay/paymentWrite', {
        date: new Date().toISOString(),
        to: data.recipient,
        amt: Number(data.amount),
        sender: currentUser._id || currentUser.id,
        keyword: 'AI Agent transfer',
        coin: data.currency || 'USDC',
        txHash,
        botAmountSnapshot: Number(data.amount),
        senderWalletType: 'external',
        destinationAddress: data.targetAddress
      });

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Waiting for confirmation...', '') } : m
      ));

      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `✅ Payment confirmed! ${data.amount} ${data.currency || 'USDC'} was sent to ${data.recipient}.`,
        isSuccess: true
      }]);

      if (refreshData) refreshData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Transaction failed');
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `❌ Transaction failed: ${err.response?.data?.message || err.message || 'Insufficient balance or invalid Pay Tag.'}`
      }]);
    }
  };

  const getMetaMaskProvider = () => {
    if (window.ethereum?.providers) {
      return window.ethereum.providers.find(p => p.isMetaMask);
    }
    if (window.ethereum?.isMetaMask) {
      return window.ethereum;
    }
    return null;
  };

  const waitForTxReceipt = (mmProvider, txHash, maxAttempts = 30) => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const check = async () => {
        try {
          const receipt = await mmProvider.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
          if (receipt) return resolve(receipt);
          if (++attempts >= maxAttempts) return reject(new Error('Tx not confirmed after 30s'));
          setTimeout(check, 1000);
        } catch (e) {
          reject(e);
        }
      };
      check();
    });
  };

  const executeAuth = async (data, messageId) => {
    const mmProvider = getMetaMaskProvider();
    if (!mmProvider) {
      toast.error('Install or connect MetaMask to schedule payments');
      return;
    }

    if (data.cancelAction) {
      await executeCancelAuth(data, messageId, mmProvider);
      return;
    }

    try {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isAction: false, text: m.text + '\n\n⏳ Sending funds to timelock contract via MetaMask...' } : m
      ));

      const chainIdHex = '0x' + Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_ARC_CHAIN_ID || 5042002).toString(16);

      let currentChainId;
      try {
        currentChainId = await mmProvider.request({ method: 'eth_chainId' });
      } catch (e) {
        currentChainId = null;
      }

      if (currentChainId !== chainIdHex) {
        try {
          await mmProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
        } catch (e) {
          if (e.code === 4902) {
            await mmProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainIdHex,
                rpcUrls: [import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io'],
                chainName: import.meta.env.VITE_ARC_CHAIN_NAME || import.meta.env.VITE_CHAIN_NAME || 'Arc Testnet',
                nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
                blockExplorerUrls: [import.meta.env.VITE_ARC_EXPLORER_URL || import.meta.env.VITE_EXPLORER_URL || 'https://testnet.arcscan.app']
              }]
            });
          }
        }
      }

      const accounts = await mmProvider.request({ method: 'eth_requestAccounts' });
      const fromAddr = accounts[0];

      const contractAddress = data.contractAddress;
      const releaseTime = data.releaseTime;
      const paymentIdHex = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(data.transferId));

      const managerAbi = [
        'function createScheduled(bytes32 id, address receiver, uint256 releaseTime) payable',
        'event PaymentCreated(bytes32 indexed id, uint8 indexed pType, address indexed sender, address receiver, uint256 amount, uint256 releaseTime)'
      ];
      const iface = new ethers.utils.Interface(managerAbi);
      const callData = iface.encodeFunctionData('createScheduled', [paymentIdHex, data.targetAddress, releaseTime]);

      const valueHex = ethers.utils.hexlify(
        ethers.utils.parseUnits(Number(data.amount).toFixed(18), 18)
      );

      const txHash = await mmProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: fromAddr,
          to: contractAddress,
          data: callData,
          value: valueHex,
        }]
      });

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Sending funds to timelock contract via MetaMask...', '\n\n⏳ Waiting for confirmation...') } : m
      ));

      const receipt = await waitForTxReceipt(mmProvider, txHash);

      if (Number(receipt.status) !== 1) {
        throw new Error('Transaction reverted on chain');
      }

      let contractPaymentId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === 'PaymentCreated') {
            contractPaymentId = parsed.args.id;
            break;
          }
        } catch (e) { continue; }
      }

      if (!contractPaymentId) {
        throw new Error('Could not find PaymentCreated event in tx logs');
      }

      await api.post('/pay/storeContractFunding', {
        transferId: data.transferId,
        txHash,
      });

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Waiting for confirmation...', '') } : m
      ));

      // Charge the scheduling + release fee to the sender (goes to the fee/relayer wallet).
      // Sender is charged exactly: amount + schedulingFee + releaseFee — nothing else.
      let feeTxHash = null;
      if (data.feeWallet && Number(data.feeTotal) > 0) {
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, text: m.text + `\n\n⏳ Sending transaction fee (${Number(data.feeTotal).toFixed(6)} USDC) via MetaMask...` } : m
        ));
        try {
          const feeValueHex = ethers.utils.hexlify(
            ethers.utils.parseUnits(Number(data.feeTotal).toFixed(18), 18)
          );
          feeTxHash = await mmProvider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: fromAddr,
              to: data.feeWallet,
              value: feeValueHex,
            }]
          });
          await waitForTxReceipt(mmProvider, feeTxHash);
        } catch (feeErr) {
          console.error('Fee transfer failed:', feeErr);
          setMessages(prev => [...prev, {
            id: Date.now(),
            sender: 'ai',
            text: `⚠️ Payment locked, but the transaction fee (${Number(data.feeTotal).toFixed(6)} USDC) could not be sent. Release may be delayed until the fee is covered.`
          }]);
          if (refreshData) refreshData();
          return;
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Sending funds to timelock contract via MetaMask...', '').replace(`\n\n⏳ Sending transaction fee (${Number(data.feeTotal).toFixed(6)} USDC) via MetaMask...`, '') } : m
      ));

      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `✅ Funds locked in GlobalPay Manager! Payment ID: ${contractPaymentId} — ${data.amount} USDC will be released to ${data.recipient} automatically at the scheduled time. No intermediary, no treasury.${feeTxHash ? `\n\n🧾 Transaction fee paid: ${Number(data.feeTotal).toFixed(6)} USDC` : ''}`,
        isSuccess: true
      }]);

      if (refreshData) refreshData();
    } catch (err) {
      try {
        await api.post('/pay/failContractFunding', { transferId: data.transferId });
      } catch { /* best effort cleanup */ }

      toast.error(err.response?.data?.message || err.message);
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `❌ Failed: ${err.response?.data?.message || err.message}`
      }]);
    }
  };

  const executeCancelAuth = async (data, messageId, mmProvider) => {
    try {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isAction: false, text: m.text + '\n\n⏳ Sending cancel transaction to contract via MetaMask...' } : m
      ));

      const chainIdHex = '0x' + Number(import.meta.env.VITE_CHAIN_ID || import.meta.env.VITE_ARC_CHAIN_ID || 5042002).toString(16);

      let currentChainId;
      try {
        currentChainId = await mmProvider.request({ method: 'eth_chainId' });
      } catch (e) {
        currentChainId = null;
      }

      if (currentChainId !== chainIdHex) {
        try {
          await mmProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
        } catch (e) {
          if (e.code === 4902) {
            await mmProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainIdHex,
                rpcUrls: [import.meta.env.VITE_ARC_RPC_URL || import.meta.env.VITE_RPC_URL || 'https://rpc.testnet.arc.io'],
                chainName: import.meta.env.VITE_ARC_CHAIN_NAME || import.meta.env.VITE_CHAIN_NAME || 'Arc Testnet',
                nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
                blockExplorerUrls: [import.meta.env.VITE_ARC_EXPLORER_URL || import.meta.env.VITE_EXPLORER_URL || 'https://testnet.arcscan.app']
              }]
            });
          }
        }
      }

      const accounts = await mmProvider.request({ method: 'eth_requestAccounts' });
      const fromAddr = accounts[0];

      const cancelIface = new ethers.utils.Interface([
        'function cancel(bytes32 id)',
        'event PaymentCancelled(bytes32 indexed id, uint256 refundAmount)'
      ]);
      const callData = cancelIface.encodeFunctionData('cancel', [data.contractPaymentId]);

      const txHash = await mmProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: fromAddr,
          to: data.contractAddress,
          data: callData,
          value: '0x0',
        }]
      });

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Sending cancel transaction to contract via MetaMask...', '\n\n⏳ Waiting for confirmation...') } : m
      ));

      const receipt = await waitForTxReceipt(mmProvider, txHash);

      if (Number(receipt.status) !== 1) {
        throw new Error('Cancel transaction reverted on chain');
      }

      let cancelledId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = cancelIface.parseLog(log);
          if (parsed.name === 'PaymentCancelled' && parsed.args.id.toLowerCase() === data.contractPaymentId.toLowerCase()) {
            cancelledId = parsed.args.id;
            break;
          }
        } catch (e) { continue; }
      }

      if (!cancelledId) {
        throw new Error('Could not find PaymentCancelled event matching this payment');
      }

      await api.post('/pay/cancelContractFunding', {
        transferId: data.transferId,
        cancelTxHash: txHash
      });

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: m.text.replace('\n\n⏳ Waiting for confirmation...', '') } : m
      ));

      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `✅ Payment cancelled and refunded! ${data.amount} USDC has been returned to your wallet.`,
        isSuccess: true
      }]);

      if (refreshData) refreshData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Cancel failed');
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `❌ Cancel failed: ${err.response?.data?.message || err.message}`
      }]);
    }
  };

  const toggleCancelSelection = (msgId, transferId) => {
    setCancelSelections(prev => {
      const cur = { ...(prev[msgId] || {}) };
      if (cur[transferId]) delete cur[transferId];
      else cur[transferId] = true;
      return { ...prev, [msgId]: cur };
    });
  };

  const executeSelectedCancels = async (msg) => {
    const sel = cancelSelections[msg.id] || {};
    const chosen = (msg.cancelPlan || []).filter(o => sel[o.transferId]);
    if (chosen.length === 0) return;
    setCancelSelections(prev => ({ ...prev, [msg.id]: {} }));
    for (const o of chosen) {
      try {
        await executeAuth({ ...o, cancelAction: true }, msg.id);
      } catch (e) {
        console.error('Cancel failed for a selection:', e);
      }
    }
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    const parts = [];
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30 text-xs ml-1 transition-all hover:bg-amber-500/20"
        >
          {match[1]}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={handleToggle}
        style={{ bottom: `${position.bottom}px`, right: `${position.right}px` }}
        className="fixed z-50 w-14 h-14 bg-gradient-to-r from-secondary via-amber-500 to-amber-600 hover:from-secondary hover:to-amber-500 text-white rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(0,229,155,0.35)] transition-transform hover:scale-105 active:scale-95 border border-secondary/30 cursor-grab active:cursor-grabbing select-none"
      >
        <FiZap size={24} className="text-white animate-pulse" />
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div
          style={{
            bottom: `${Math.min(window.innerHeight - 560, position.bottom + 65)}px`,
            right: `${Math.min(window.innerWidth - 400, position.right)}px`
          }}
          className="fixed z-50 w-96 max-w-[calc(100vw-3rem)] h-[540px] bg-zinc-950/95 border border-secondary/20 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
        >
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-secondary/10 via-zinc-900/60 to-zinc-900/80 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-secondary to-amber-500 p-0.5 shadow-lg">
                <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
                  <FiZap className="text-amber-400" size={18} />
                </div>
              </div>
              <div>
                <h3 className="text-white font-black text-sm tracking-wide">AI Agent</h3>
                <p className="text-emerald-400 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"></span> Online
                </p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white p-2">
              <FiX size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-none">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] p-4 text-sm shadow-lg ${msg.sender === 'user'
                  ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-zinc-950 rounded-[1.5rem] rounded-br-sm font-bold'
                  : msg.isSuccess
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-100 rounded-[1.5rem] rounded-bl-sm'
                    : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-200 rounded-[1.5rem] rounded-bl-sm'
                  }`}>
                  <p className="whitespace-pre-wrap break-all leading-relaxed">{renderFormattedText(msg.text)}</p>
                </div>

                {msg.cancelPlan && msg.cancelPlan.length > 0 && (
                  <div className="mt-3 w-full bg-zinc-900/70 border border-zinc-700/50 rounded-2xl p-2 flex flex-col gap-1.5">
                    {msg.cancelPlan.map((opt) => {
                      const checked = !!cancelSelections[msg.id]?.[opt.transferId];
                      return (
                        <label
                          key={opt.transferId}
                          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer border transition-all ${checked ? 'bg-red-600/15 border-red-500/40' : 'bg-zinc-800/40 border-transparent hover:bg-zinc-800/70'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCancelSelection(msg.id, opt.transferId)}
                            className="w-4 h-4 accent-red-500 shrink-0"
                          />
                          <span className="text-xs font-semibold flex-1 text-zinc-100">{opt.label}</span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-red-400 shrink-0">Cancel</span>
                        </label>
                      );
                    })}
                    {window.ethereum ? (
                      <button
                        onClick={() => executeSelectedCancels(msg)}
                        disabled={!Object.keys(cancelSelections[msg.id] || {}).length}
                        className="mt-1 w-full bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
                      >
                        <FiX size={14} /> Cancel Selected
                      </button>
                    ) : (
                      <div className="mt-1 bg-zinc-900/80 border border-amber-500/20 rounded-xl px-4 py-3">
                        <p className="text-xs text-amber-400 font-bold">⚠️ Install MetaMask to cancel scheduled payments</p>
                      </div>
                    )}
                  </div>
                )}
                {msg.isAction && msg.isAuth && msg.authData && window.ethereum && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => executeAuth(msg.authData, msg.id)}
                      className={`${msg.authData?.cancelAction ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-secondary hover:bg-secondary-hover text-black'} text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg`}
                    >
                      <FiZap size={14} /> {msg.authData?.cancelAction
                        ? 'Cancel & Refund'
                        : (msg.authData?.feeTotal ? `Approve ${Number(msg.authData.totalDeduct).toFixed(6)} USDC` : 'Send to Timelock')}
                    </button>
                    <button
                      onClick={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isAction: false } : m))}
                      className="bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-400 hover:text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {msg.isAction && msg.isAuth && !window.ethereum && (
                  <div className="mt-3 bg-zinc-900/80 border border-amber-500/20 rounded-xl px-4 py-3">
                    <p className="text-xs text-amber-400 font-bold">⚠️ Install MetaMask to schedule payments</p>
                  </div>
                )}
                {msg.isAction && !msg.isAuth && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex gap-2 flex-wrap">
                      {hasMpc && (
                        <button
                          onClick={() => executeTransaction(msg.transactionData, msg.id, 'internal')}
                          className="bg-secondary hover:bg-secondary-hover text-black text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-secondary/25"
                        >
                          <FiZap size={14} /> Pay via Internal Vault
                        </button>
                      )}
                      {hasMetaMask && (
                        <button
                          onClick={() => executeTransaction(msg.transactionData, msg.id, 'external')}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg"
                        >
                          <FiZap size={14} /> Pay via MetaMask
                        </button>
                      )}
                      {!hasMpc && !hasMetaMask && (
                        <p className="text-xs text-red-400 font-bold">No wallet available. Connect MPC or MetaMask.</p>
                      )}
                    </div>
                    <button
                      onClick={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isAction: false } : m))}
                      className="self-start bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-400 hover:text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                )}


              </div>
            ))}

            {isTyping && (
              <div className="flex items-start">
                <div className="bg-zinc-800/50 border border-zinc-700/50 px-4 py-3 rounded-[1.5rem] rounded-bl-sm flex gap-1.5 shadow-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Command Suggestions Popup */}
          {showSuggestions && (
            <div className="mx-4 mb-2 p-2 bg-zinc-900/95 border border-secondary/30 rounded-2xl shadow-2xl max-h-56 overflow-y-auto space-y-1 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 scrollbar-none">
              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-secondary border-b border-white/5 flex items-center justify-between">
                <span>⚡ {commandTools.length} AI Agent Commands</span>
                <span className="text-zinc-500 text-[9px]">Click to Select</span>
              </div>
              {commandTools.map((cmd) => (
                <button
                  key={cmd.command}
                  type="button"
                  onClick={() => selectSuggestion(cmd)}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-secondary/10 transition-all flex items-center justify-between group border border-transparent hover:border-secondary/20"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400 text-xs bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{cmd.command}</span>
                      <span className="text-white text-xs font-bold">{cmd.title}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 italic">{cmd.prompt}</p>
                  </div>
                  <span className="text-[10px] text-zinc-500 group-hover:text-secondary font-medium hidden sm:inline">{cmd.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-4 bg-black/40 border-t border-white/5 backdrop-blur-md">
            <form onSubmit={handleSend} className="relative flex items-center">
              <button
                type="button"
                onClick={() => setShowSuggestions(!showSuggestions)}
                title="Toggle / commands menu"
                className="absolute left-3 w-7 h-7 bg-secondary/10 hover:bg-secondary/25 text-secondary font-mono font-bold text-xs rounded-lg flex items-center justify-center border border-secondary/30 transition-all z-10"
              >
                /
              </button>
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Type '/' or ask 'Send 10 USDC to @user_gl'..."
                className="w-full bg-zinc-900/50 border border-zinc-700/50 text-white text-sm rounded-2xl pl-12 pr-14 py-4 focus:outline-none focus:border-secondary/50 focus:bg-zinc-900 transition-all placeholder:text-zinc-600"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="absolute right-2.5 w-9 h-9 bg-gradient-to-r from-secondary to-amber-500 hover:from-secondary-hover hover:to-amber-400 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white rounded-xl flex items-center justify-center transition-all shadow-lg"
              >
                <FiSend size={14} className="ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Internal Vault sign-approval overlay */}
      <ConfirmPaymentModal
        isOpen={Boolean(pendingConfirm)}
        to={pendingConfirm?.to || ""}
        amountETH={pendingConfirm?.amount || 0}
        memo="AI Agent Transfer"
        loading={isSending}
        onConfirm={() => performInternalSend(pendingConfirm)}
        onCancel={() => {
          setPendingConfirm(null);
          setIsSending(false);
        }}
      />
    </>
  );
};

export default AiRemittanceAgent;
