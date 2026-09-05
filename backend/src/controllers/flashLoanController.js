import { supabase } from "../config/supabaseClient.js";
import logger from '../utils/logger.js';
const ownedAddresses = (user) => [
  user.internal_wallet_address,
  user.metamask_id,
  user.external_wallet
].filter(Boolean).map((a) => String(a).toLowerCase());

// Fetch Flash Loan history records
export const FLHistoryRead = async (req, res) => {
  try {
    const addr = req.body.address;

    if (!addr) {
      return res.status(400).json({ message: "Address is required" });
    }

    // IDOR fix: history is only readable for the authenticated user's own wallets.
    if (!ownedAddresses(req.user).includes(String(addr).toLowerCase())) {
      return res.status(403).json({ message: "Not authorized: address does not belong to this account" });
    }

    const { data, error } = await supabase
      .from('flash_loan_history')
      .select('*')
      .eq('address', addr)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Convert SQL naming columns to match Mongoose response keys exactly
    const mappedData = (data || []).map(row => ({
      _id: row.id,
      address: row.address,
      date: row.date,
      token: row.token,
      amt: Number(row.loan),
      pft: Number(row.pl)
    }));

    return res.json(mappedData);
  } catch (error) {
    logger.error("Error in FLHistoryRead:", error.message);
    return res.status(500).json({ message: 'Server error while reading flash loan history' });
  }
};

// Record a new Flash Loan transaction log
export const FLHistoryWrite = async (req, res) => {
  try {
    const addr = req.body.address;
    const date = req.body.date;
    const token = req.body.token;
    const loan = req.body.amt;
    const pl = req.body.pft;

    if (!addr || !token || loan === undefined) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    // IDOR fix: records may only be written for the authenticated user's own wallets.
    if (!ownedAddresses(req.user).includes(String(addr).toLowerCase())) {
      return res.status(403).json({ message: "Not authorized: address does not belong to this account" });
    }

    const { data, error } = await supabase
      .from('flash_loan_history')
      .insert({
        address: addr,
        date: date ? new Date(date) : new Date(),
        token: token,
        loan: Number(loan),
        pl: pl ? Number(pl) : 0.0
      })
      .select()
      .single();

    if (error) throw error;

    // Return format compatible with Mongoose insertMany
    const mongooseCompatibleResponse = {
      _id: data.id,
      address: data.address,
      date: data.date,
      token: data.token,
      amt: Number(data.loan),
      pft: Number(data.pl)
    };

    return res.json({ "status": 'success', "data": [mongooseCompatibleResponse] });
  } catch (error) {
    logger.error("Error in FLHistoryWrite:", error.message);
    return res.status(500).json({ message: 'Server error while recording flash loan' });
  }
};
