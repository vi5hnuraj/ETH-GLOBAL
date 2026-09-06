import express from 'express';
import {
  getArcConfig,
  getArcNetworkStatus,
  getArcBalance,
  checkAgentSpendingPolicy,
  createProgrammableEscrow,
  executeNanopayment,
  routeCrosschainUsdc
} from '../services/arcService.js';

const router = express.Router();

/**
 * GET /api/arc/status
 * Arc network parameters, health, block height, and gas token info
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getArcNetworkStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/arc/balance/:address
 * Live USDC native gas balance for an EVM address on Arc
 */
router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const balance = await getArcBalance(address);
    res.json({ success: true, ...balance });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/arc/agent/policy
 * Circle Agent Stack: Spending policy evaluation
 */
router.post('/agent/policy', async (req, res) => {
  try {
    const { agentId, amountUsdc, recipientAddress } = req.body;
    const policy = await checkAgentSpendingPolicy({ agentId, amountUsdc, recipientAddress });
    res.json({ success: true, policy });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/arc/escrow
 * Programmable conditional escrow on Arc
 */
router.post('/escrow', async (req, res) => {
  try {
    const { agentId, payerAddress, payeeAddress, amountUsdc, conditions, expiresInHours } = req.body;
    const result = await createProgrammableEscrow({
      agentId,
      payerAddress,
      payeeAddress,
      amountUsdc,
      conditions,
      expiresInHours
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/arc/nanopayment
 * Agent-to-Agent USDC micropayment on Arc
 */
router.post('/nanopayment', async (req, res) => {
  try {
    const { payerAgentId, recipientAddress, amountUsdc, serviceName, invocationId } = req.body;
    const receipt = await executeNanopayment({
      payerAgentId,
      recipientAddress,
      amountUsdc,
      serviceName,
      invocationId
    });
    res.json({ success: true, receipt });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/arc/bridge
 * Cross-chain USDC flow via Circle Gateway / CCTP
 */
router.post('/bridge', async (req, res) => {
  try {
    const { sourceChain, destinationChain, amountUsdc, recipientAddress } = req.body;
    const result = await routeCrosschainUsdc({
      sourceChain,
      destinationChain,
      amountUsdc,
      recipientAddress
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
