import { supabase } from '../config/supabaseClient.js';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { JWT_SECRET } from '../config/config.js';
import { getWalletService } from '../wallets/walletService.js';
import { requestMpc, transferGasWei } from '../wallets/mpcWalletService.js';
import { getLiveBotPrice } from '../services/liveRateService.js';
import { getPool } from '../utils/db.js';
import logger from '../utils/logger.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wallet-preference writes go through direct SQL instead of supabase-js: the
// PostgREST gateway intermittently maps the `sb_secret_` service key to `anon`
// (PATCH returns 200 [] → PGRST116 "0 rows" → "Database error updating wallet
// preference"), and no amount of HTTP retrying wins a degraded window that
// spans 10-30 seconds. Direct SQL is a distinct transport that bypasses the
// gateway and RLS entirely. Column names are hardcoded literals, never user
// input, so building the SET clause is injection-safe.
const writeProfileThenVerify = async (updates, userId, expectedField) => {
  const pool = getPool();
  const keys = Object.keys(updates);
  const setClause = keys.map((key, i) => `"${key}" = $${i + 1}`).join(', ');
  const values = keys.map((key) => updates[key]);
  const sql = `UPDATE profiles SET ${setClause} WHERE id = $${keys.length + 1}`;

  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await pool.query(sql, [...values, userId]);
      const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [userId]);
      if (!rows.length || rows[0][expectedField] !== updates[expectedField]) {
        throw new Error('wallet preference write returned no row confirming the new value');
      }
      return rows[0];
    } catch (err) {
      lastErr = err;
      await sleep(250);
    }
  }
  throw lastErr || new Error('wallet preference write not applied');
};

// ==================== Register a new user ====================
export const register = async (req, res) => {
  const { email, password, name } = req.body;

  try {
    // Check if user already exists
    const { data: existingUser, error: checkErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Register user in Supabase Auth (with email auto-confirmed for production/sandbox ease)
    // Direct fetch bypasses SDK header parsing bugs on newer sb_secret keys
    const cleanUrl = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const authRes = await fetch(`${cleanUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true
      })
    });

    const authDataRaw = await authRes.json();

    if (authRes.status !== 200 && authRes.status !== 201) {
      logger.error("[REGISTER] Supabase signup error:", JSON.stringify(authDataRaw));
      return res.status(400).json({
        message: "Registration failed. Please try again.",
        detail: authDataRaw.message || authDataRaw.error_description || authDataRaw.msg || 'unknown'
      });
    }

    const userId = authDataRaw.id;
    const baseName = name ? name.toLowerCase().replace(/\s+/g, '') : 'user';
    const globalPayTag = `@${baseName}_gl`;

    // Insert public profile in public.profiles table via direct SQL (bypasses PostgREST gateway/RLS)
    const pool = getPool();
    const profileResult = await pool.query(
      `INSERT INTO profiles (id, email, name, global_pay_tag, wallet_provider)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, email, name, globalPayTag, 'mpc']
    );
    const newProfile = profileResult.rows[0];
    if (!newProfile) {
      throw new Error('Profile insert returned no row');
    }

    // Insert default bank details record via direct SQL (bypasses PostgREST gateway/RLS)
    await pool.query(
      `INSERT INTO bank_details (user_id, bank_name, ifsc_code, account_holder, account_address, account_type, amount, global_pay_tag, region, usdc_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, 'GlobalPay Digital Bank', 'GPAY0000001', name || 'User', 'Digital Wallet', 'savings', 0.00, globalPayTag, 'Global', 0.00]
    );

    // Generate JWT access token by signing the user in
    const { data: sessionData, error: sessionErr } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (sessionErr || !sessionData?.session) {
      return res.status(400).json({ message: 'Authentication sign-in failed' });
    }

    res.status(201).json({
      token: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token
    });
  } catch (err) {
    logger.error("Register error:", err.message);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// ==================== User login ====================
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data?.session) {
      if (error?.status === 429) {
        return res.status(429).json({ message: 'Too many login attempts. Please wait a moment and try again.' });
      }
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    // Fetch platform_role from profiles table
    let platformRole = null;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('platform_role')
        .eq('id', data.user.id)
        .maybeSingle();
      platformRole = profile?.platform_role || null;
    } catch { /* column may not exist yet */ }

    res.status(200).json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      platformRole
    });
  } catch (err) {
    logger.error("Login error:", err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// ==================== Link wallets & metadata ====================
export const linking = async (req, res) => {
  try {
    const { upi, metamask, bankDetails, region } = req.body;
    const user = req.user; // from authMiddleware (Supabase profile row object)
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const updates = {
      global_pay_tag: upi || user.global_pay_tag,
      metamask_id: metamask || user.metamask_id,
      kyc: true,
      region: region || user.region
    };

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: 'Database error while linking profiles' });
    }

    res.status(200).json({ message: 'Links updated successfully', user: updatedProfile });
  } catch (error) {
    logger.error("Linking error:", error.message);
    res.status(500).json({ message: 'Server error while updating links' });
  }
};

// ==================== Update user details ====================
export const update = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { name, mob, age, dob, address, status } = req.body;

    const updates = {
      name: name || user.name,
      mobile: mob || user.mobile,
      age: age ? Number(age) : user.age,
      dob: dob || user.dob,
      address: address || user.address,
      status: status || user.status
    };

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: 'Database error updating profile details' });
    }

    res.status(200).json({ message: 'User updated successfully', user: updatedProfile });
  } catch (error) {
    logger.error("Update error:", error.message);
    res.status(500).json({ message: 'Server error while updating user' });
  }
};

// ==================== Update External Wallet ====================
export const updateExternalWallet = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { walletAddress } = req.body;
    const updates = {
      metamask_id: walletAddress || "",
      external_wallet: walletAddress || ""
    };

    const updatedProfile = await writeProfileThenVerify(updates, user.id, 'external_wallet');

    res.status(200).json({ message: 'External wallet updated successfully', metamaskId: updatedProfile.metamask_id });
  } catch (error) {
    logger.error("Update external wallet error:", error.message);
    res.status(500).json({ message: 'Database error updating external wallet' });
  }
};

// ==================== Fetch user details ====================
export const fetchDetail = async (req, res) => {
  try {
    const { waddr, email, upi } = req.query;
    let profile = null;

    if (waddr) {
      const { data } = await supabase.from('profiles').select('*').eq('metamask_id', waddr).maybeSingle();
      profile = data;
    } else if (email) {
      const { data } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
      profile = data;
    } else if (upi) {
      // Check if it's a UUID string matching user.id
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upi);
      if (isUuid) {
        const { data } = await supabase.from('profiles').select('*').eq('id', upi).maybeSingle();
        profile = data;
      } else {
        const cleanUpi = upi.replace(/^@/, '').trim();
        const tagWithAt = `@${cleanUpi}`;
        const candidates = [upi, cleanUpi, tagWithAt].filter(Boolean);
        const unique = [...new Set(candidates)];
        let match = null;
        for (const val of unique) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('global_pay_tag', val)
            .maybeSingle();
          if (data) { match = data; break; }
        }
        if (!match) {
          for (const val of unique) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('email', val)
              .maybeSingle();
            if (data) { match = data; break; }
          }
        }
        if (!match) {
          for (const val of unique) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .or(`internal_wallet_address.eq.${val},metamask_id.eq.${val}`)
              .maybeSingle();
            if (data) { match = data; break; }
          }
        }
        if (!match && cleanUpi) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .ilike('name', `%${cleanUpi}%`)
            .maybeSingle();
          if (data) match = data;
        }
        profile = match;
      }
    } else {
      // Fallback to active logged-in user from request
      const { data } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
      profile = data;
    }

    if (!profile) return res.status(404).json({ message: 'No user found with that paytag, email, or wallet address' });

    // Fetch corresponding bank details row
    const { data: bankDetailsRecord } = await supabase
      .from('bank_details')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();

    // Fetch live on-chain USDC balance for accurate real-time display
    let internalBotBalance = bankDetailsRecord?.usdc_balance ? Number(bankDetailsRecord.usdc_balance) : 0;
    let externalBotBalance = bankDetailsRecord?.external_balance ? Number(bankDetailsRecord.external_balance) : 0;

    try {
      const { ethers } = await import('ethers');
      const { getProvider } = await import('../services/chainRpcService.js');
      const provider = getProvider();

      if (profile.internal_wallet_address && ethers.isAddress(profile.internal_wallet_address)) {
        const rawInt = await provider.getBalance(profile.internal_wallet_address);
        const onChainBal = parseFloat(ethers.formatUnits(rawInt, 18));
        internalBotBalance = onChainBal;

        // Sync bank_details cache
        if (bankDetailsRecord?.id && Math.abs((bankDetailsRecord.usdc_balance || 0) - onChainBal) > 0.0001) {
          supabase.from('bank_details').update({ usdc_balance: onChainBal }).eq('id', bankDetailsRecord.id).catch(() => {});
        }
      }

      const extAddr = profile.metamask_id || profile.external_wallet;
      if (extAddr && ethers.isAddress(extAddr)) {
        const rawExt = await provider.getBalance(extAddr);
        const onChainExtBal = parseFloat(ethers.formatUnits(rawExt, 18));
        externalBotBalance = onChainExtBal;

        if (bankDetailsRecord?.id && Math.abs((bankDetailsRecord.external_balance || 0) - onChainExtBal) > 0.0001) {
          supabase.from('bank_details').update({ external_balance: onChainExtBal }).eq('id', bankDetailsRecord.id).catch(() => {});
        }
      }
    } catch (rpcErr) {
      logger.warn("[FETCHDETAIL] RPC balance verification note:", rpcErr.message);
    }

    const isExternal = profile.primary_receiving_wallet === "external" && profile.metamask_id;
    const receiverWalletAddress = isExternal ? profile.metamask_id : profile.internal_wallet_address;
    const receivingWalletType = isExternal ? "External Wallet" : "Internal Wallet";

    // Live USDC price (fixed at the Arc native-gas peg) so every consumer —
    // RequestForm estimate, invoice snapshots, Pay conversion, bank card —
    // agrees on the same rate. Falls back to null when the feed is down.
    let liveBotPriceVal = null;
    try {
      liveBotPriceVal = await getLiveBotPrice();
    } catch (livePriceErr) {
      logger.warn("fetchDetail live USDC price unavailable:", livePriceErr.message);
    }

    const mergedBankDetails = {
      bankName: bankDetailsRecord?.bank_name || "",
      ifscCode: bankDetailsRecord?.ifsc_code || "",
      accountHolder: bankDetailsRecord?.account_holder || "",
      accountAddress: bankDetailsRecord?.account_address || "Not Required",
      accountType: bankDetailsRecord?.account_type || "savings",
      amount: bankDetailsRecord?.amount ? Number(bankDetailsRecord.amount) : 0,
      upiId: bankDetailsRecord?.global_pay_tag || "",
      usdcBalance: internalBotBalance,
      internalBalance: internalBotBalance,
      externalBalance: externalBotBalance,
      externalWalletAddress: profile.metamask_id || profile.external_wallet || "",
      botPrice: liveBotPriceVal || 1,
      createdAt: bankDetailsRecord?.created_at,
      updatedAt: bankDetailsRecord?.updated_at
    };

    res.status(200).json({
      _id: profile.id, // Return ID mapping both _id and id for compatibility
      id: profile.id,
      username: profile.name,
      email: profile.email,
      metamask: profile.metamask_id,
      internalWalletAddress: profile.internal_wallet_address,
      walletProvider: profile.wallet_provider,
      walletId: profile.provider_user_id,
      externalWallet: profile.external_wallet,
      primaryReceivingWallet: profile.primary_receiving_wallet || "internal",
      receiverWalletAddress,
      receivingWalletType,
      upi: profile.upi_id || profile.global_pay_tag,
      bankDetails: mergedBankDetails,
      kyc: profile.kyc,
      kycProvider: profile.kyc_provider,
      global_verified: profile.global_verified,
      globalPayTag: profile.global_pay_tag,
      region: bankDetailsRecord ? bankDetailsRecord.region : profile.region,
      mobile: profile.mobile,
      age: profile.age,
      dob: profile.dob,
      address: profile.address,
      status: profile.status,
    });
  } catch (error) {
    logger.error("Fetch detail error:", error.message);
    res.status(500).json({ message: 'Server error while fetching user details' });
  }
};

// ==================== Verify Web3 KYC & Create Vault ====================
export const verifyWeb3KYC = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { kycProvider, walletAddress } = req.body;

    const updates = {
      global_verified: true,
      kyc: true,
      kyc_provider: kycProvider || 'Gitcoin'
    };

    if (walletAddress) {
      updates.metamask_id = walletAddress;
    }

    // Auto-generate global PayTag if not already present
    if (!user.global_pay_tag) {
      const regionCode = user.region ? user.region.toLowerCase().slice(0, 2) : 'gl';
      const baseName = user.name ? user.name.toLowerCase().replace(/\s+/g, '') : 'user';
      updates.global_pay_tag = `@${baseName}_${regionCode}`;
    }

    // Internal wallet address is set by Privy MPC wallet connection
    if (!user.internal_wallet_address) {
      updates.internal_wallet_address = null;
    }

    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: 'Database error during KYC verification' });
    }

    res.status(200).json({ message: 'Web3 KYC verified successfully. Web3 Wallet generated.', user: updatedProfile });
  } catch (error) {
    logger.error("verifyWeb3KYC error:", error.message);
    res.status(500).json({ message: 'Server error during Web3 verification' });
  }
};

// ==================== Update Primary Wallet preference ====================
export const updatePrimaryWallet = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { primaryReceivingWallet } = req.body;

    if (!["internal", "external"].includes(primaryReceivingWallet)) {
      return res.status(400).json({ message: "Invalid wallet type selection." });
    }

    if (primaryReceivingWallet === "external" && !user.metamask_id) {
      return res.status(400).json({
        success: false,
        message: "Please link an external wallet first."
      });
    }

    const updatedProfile = await writeProfileThenVerify(
      { primary_receiving_wallet: primaryReceivingWallet },
      user.id,
      'primary_receiving_wallet'
    );

    return res.status(200).json({
      message: 'Primary receiving wallet updated successfully',
      primaryReceivingWallet: updatedProfile.primary_receiving_wallet
    });
  } catch (error) {
    logger.error("Update primary wallet error:", error.message);
    res.status(500).json({ message: 'Database error updating wallet preference' });
  }
};

// ==================== Generate Wallet Challenge (Nonce) ====================
export const walletChallenge = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    // Generate random 16-byte nonce
    const { randomBytes } = await import('crypto');
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const challengeText = `GlobalPay Wallet Verification\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    const expiresAt = timestamp + 5 * 60 * 1000; // 5 minutes expiration

    // Store challenge message and expiration as JSON string in wallet_challenge
    const { error } = await supabase
      .from('profiles')
      .update({
        wallet_challenge: JSON.stringify({ challengeText, expiresAt })
      })
      .eq('id', user.id);

    if (error) {
      logger.error("Database error in walletChallenge:", error.message);
      return res.status(500).json({ message: 'Database error generating wallet challenge' });
    }

    return res.status(200).json({ challenge: challengeText });
  } catch (error) {
    logger.error("walletChallenge error:", error.message);
    res.status(500).json({ message: 'Server error while generating wallet challenge' });
  }
};

// ==================== Update MPC Embedded Wallet Metadata ====================
export const updateWallet = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { internalWalletAddress, signature } = req.body;

    if (!internalWalletAddress || !signature) {
      return res.status(400).json({ message: "Wallet address and signature are required." });
    }

    // Validate EVM wallet address format
    const { ethers } = await import('ethers');
    if (!ethers.isAddress(internalWalletAddress)) {
      return res.status(400).json({ message: "Invalid EVM wallet address format." });
    }

    // 1. Fetch profile to check the challenge
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('wallet_challenge, internal_wallet_address')
      .eq('id', user.id)
      .single();

    if (fetchError || !profile) {
      return res.status(400).json({ message: "User profile not found." });
    }

    if (!profile.wallet_challenge) {
      return res.status(400).json({ message: "Wallet challenge not initiated or already used." });
    }

    // 2. Parse and validate the challenge
    let challengeData;
    try {
      challengeData = JSON.parse(profile.wallet_challenge);
    } catch (e) {
      return res.status(400).json({ message: "Corrupted challenge data." });
    }

    const { challengeText, expiresAt } = challengeData;
    if (!challengeText || !expiresAt) {
      return res.status(400).json({ message: "Invalid challenge format." });
    }

    if (Date.now() > expiresAt) {
      // Clear expired challenge immediately
      await supabase.from('profiles').update({ wallet_challenge: null }).eq('id', user.id);
      return res.status(400).json({ message: "Verification challenge has expired." });
    }

    // 3. Cryptographically verify signature
    let recoveredAddress;
    try {
      if (ethers.utils && typeof ethers.utils.verifyMessage === 'function') {
        recoveredAddress = ethers.utils.verifyMessage(challengeText, signature);
      } else if (typeof ethers.verifyMessage === 'function') {
        recoveredAddress = ethers.verifyMessage(challengeText, signature);
      } else {
        throw new Error("Ethers verifyMessage function not found.");
      }
    } catch (sigErr) {
      return res.status(400).json({ message: "Signature verification failed." });
    }

    if (recoveredAddress.toLowerCase() !== internalWalletAddress.toLowerCase()) {
      return res.status(400).json({ message: "Wallet ownership verification failed. Recovered signer mismatch." });
    }

    // 4. Protect existing wallet (strict migration path)
    const { forceMigration } = req.body;
    if (profile.internal_wallet_address && profile.internal_wallet_address.toLowerCase() !== internalWalletAddress.toLowerCase()) {
      if (!forceMigration) {
        return res.status(409).json({ 
          message: "A different wallet address is already linked to this profile. Migration confirmation required.",
          existingWalletAddress: profile.internal_wallet_address
        });
      }
    }

    // 5. Update profile and clear the challenge (one-time use enforced)
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        internal_wallet_address: internalWalletAddress,
        wallet_provider: 'mpc',
        wallet_challenge: null // clear the challenge after verification
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error("Database error in updateWallet:", updateError.message);
      return res.status(500).json({ message: 'Database error updating wallet address' });
    }

    logger.info(`🤖 [MPC WALLET] Successfully linked wallet: ${internalWalletAddress} to user: ${user.id}`);
    
    return res.status(200).json({
      message: 'MPC Wallet registered successfully',
      internalWalletAddress: updatedProfile.internal_wallet_address,
      walletProvider: updatedProfile.wallet_provider
    });
  } catch (error) {
    logger.error("updateWallet error:", error.message);
    res.status(500).json({ message: 'Server error while updating wallet details' });
  }
};

// ==================== Refresh Session Token ====================
export const refreshSession = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
    return res.status(200).json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token
    });
  } catch (err) {
    logger.error("refreshSession error:", err.message);
    return res.status(500).json({ message: 'Server error during session refresh' });
  }
};

// ==================== Create MPC Wallet ====================
export const mpcCreateWallet = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    logger.info("🤖 [MPC DEBUG] mpcCreateWallet user object:", JSON.stringify(user, null, 2));

    // Check if user already has an MPC wallet linked
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('internal_wallet_address, provider_user_id, wallet_provider')
      .eq('id', user.id)
      .single();

    if (fetchError || !profile) {
      logger.error("🤖 [MPC DEBUG] profile fetch error:", fetchError?.message || 'No profile data');
      return res.status(400).json({ message: "User profile not found." });
    }

    const { forceMigration } = req.body;
    if (profile.internal_wallet_address && profile.wallet_provider === 'mpc') {
      if (!forceMigration) {
        return res.status(200).json({
          message: 'MPC Wallet already provisioned',
          internalWalletAddress: profile.internal_wallet_address,
          walletId: profile.provider_user_id,
          walletProvider: 'mpc'
        });
      }
    }

    const walletService = getWalletService();
    if (walletService.provider !== 'mpc') {
      return res.status(400).json({ message: `WALLET_PROVIDER is configured to '${walletService.provider}', not 'mpc'.` });
    }

    // Call the configured audited external MPC provider.
    const created = await walletService.createWallet({
      name: profile.name || user.email,
      ownerId: user.id
    });

    logger.info("🤖 [MPC DEBUG] created wallet:", created);

    // Update profile in Supabase
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        internal_wallet_address: created.address,
        provider_user_id: created.walletId,
        wallet_provider: 'mpc'
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      logger.error("Database error in mpcCreateWallet:", updateError.message);
      return res.status(500).json({ message: 'Database error linking MPC wallet' });
    }

    logger.info("🤖 [MPC DEBUG] updatedProfile in DB:", updatedProfile);

    logger.info(`🤖 [MPC WALLET] Successfully linked MPC wallet: ${created.address} to user: ${user.id}`);

    return res.status(200).json({
      message: 'MPC Wallet provisioned successfully',
      internalWalletAddress: updatedProfile.internal_wallet_address,
      walletId: updatedProfile.provider_user_id,
      walletProvider: 'mpc'
    });
  } catch (error) {
    logger.error("mpcCreateWallet error:", error.message);
    res.status(500).json({ message: 'Server error during MPC wallet creation' });
  }
};

// ==================== Get MPC Wallet Details ====================
export const mpcGetWallet = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('internal_wallet_address, provider_user_id, wallet_provider')
      .eq('id', user.id)
      .single();

    if (fetchError || !profile) {
      return res.status(400).json({ message: "User profile not found." });
    }

    if (profile.wallet_provider !== 'mpc') {
      return res.status(400).json({ message: "No MPC wallet is linked to this account." });
    }

    return res.status(200).json({
      internalWalletAddress: profile.internal_wallet_address,
      walletId: profile.provider_user_id,
      walletProvider: 'mpc'
    });
  } catch (error) {
    logger.error("mpcGetWallet error:", error.message);
    res.status(500).json({ message: 'Server error retrieving MPC wallet details' });
  }
};

// ==================== Sign Message / Transaction via MPC ====================
export const mpcSign = async (req, res) => {
  // This endpoint accepted arbitrary transaction payloads after only a user
  // ownership check. It has no organization policy, spending-limit, recipient,
  // balance, or durable idempotency decision, so it must never reach an MPC
  // signer. Approved payment workflows must create a durable authorization
  // record before a signing job is submitted.
  return res.status(403).json({
    message: 'Direct MPC signing is disabled. Submit a policy-authorized payment signing job instead.',
    code: 'MPC_DIRECT_SIGNING_DISABLED'
  });
  /* c8 ignore next */
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    // Ownership check
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('internal_wallet_address, provider_user_id, wallet_provider')
      .eq('id', user.id)
      .single();

    if (fetchError || !profile || !profile.provider_user_id || profile.wallet_provider !== 'mpc') {
      return res.status(403).json({ message: 'Forbidden: No authorized MPC wallet linked to your user account.' });
    }

    const { txPayload } = req.body;
    if (!txPayload) {
      return res.status(400).json({ message: 'txPayload is required' });
    }

    // Call Go MPC sign endpoint directly using the failover-enabled requestMpc helper.
    // MPC_SERVICE_URL is required (requestMpc fails closed if unset).
    const url = `${process.env.MPC_SERVICE_URL}/api/v1/wallets/${profile.provider_user_id}/sign`;
    const response = await requestMpc(url, {
      method: 'POST',
      body: {
        chainId: txPayload.chainId ? Number(txPayload.chainId) : Number(process.env.ARC_CHAIN_ID || process.env.CHAIN_ID || 5042002),
        nonce: Number(txPayload.nonce || 0),
        to: txPayload.to,
        value: String(txPayload.value || '0'),
        gasLimit: Number(txPayload.gasLimit || 0),
        gasPrice: txPayload.gasPrice ? String(txPayload.gasPrice) : undefined,
        gasFeeCap: txPayload.gasFeeCap ? String(txPayload.gasFeeCap) : undefined,
        gasTipCap: txPayload.gasTipCap ? String(txPayload.gasTipCap) : undefined,
        data: txPayload.data || ''
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ message: `Go MPC signing failed: ${errText}` });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    logger.error("mpcSign error:", error.message);
    res.status(500).json({ message: 'Server error during MPC signing' });
  }
};

// ==================== Broadcast Transaction via MPC ====================
// Policy-authorized MPC broadcast for user wallet sends.
//
// This is a deliberate re-implementation of the previously-disabled direct
// broadcast. The arbitrary `txPayload` surface is gone: this endpoint only
// signs a plain native-value transfer through the audited MPC provider
// (walletService.sendPayment), which itself enforces the network/chain-ID
// mapping, the mainnet broadcast gate (MAINNET_BROADCAST_ENABLED +
// MAINNET_APPROVAL_TOKEN) and provider idempotency. Amounts are validated
// server-side, the sender's MPC wallet must be provisioned on the signing
// node, and the live on-chain balance must cover the transfer. Client-supplied
// nonce, gas, and data fields are refused.
export const mpcSend = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { to, value } = req.body || {};
    const { ethers } = await import('ethers');

    if (!to || typeof to !== 'string' || !ethers.isAddress(to)) {
      return res.status(400).json({ message: 'A valid recipient EVM address is required.' });
    }

    let valueWei;
    try {
      valueWei = BigInt(String(value ?? '0'));
    } catch {
      return res.status(400).json({ message: 'A valid amount is required.' });
    }
    if (valueWei <= 0n) {
      return res.status(400).json({ message: 'Amount must be greater than 0.' });
    }

    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('internal_wallet_address, provider_user_id, wallet_provider')
      .eq('id', user.id)
      .single();

    if (fetchError || !profile) {
      return res.status(400).json({ message: 'User profile not found.' });
    }

    if (!profile.provider_user_id || profile.wallet_provider !== 'mpc') {
      return res.status(400).json({
        message: 'No MPC wallet linked to this account. Generate a platform wallet from the Profile page.'
      });
    }

    const walletService = getWalletService();

    // The MPC wallet must actually exist on the signing node. Probing it here
    // turns a cryptic node 404 into a clear, actionable message.
    try {
      await walletService.getWallet(profile.provider_user_id);
    } catch (walletErr) {
      logger.warn('mpcSend wallet probe failed:', walletErr.message);
      return res.status(400).json({
        message: 'Your MPC wallet is no longer provisioned on the signing node. Re-link it from the Profile page (Generate platform Wallet).'
      });
    }

    // Policy: live on-chain balance must cover the transfer AND the network
    // gas fee the MPC node will deduct from the sender (fixed 21000 gas at the
    // live price). Without reserving gas, a user with balance == amount would
    // pass this gate and only fail later with an obscure chain error.
    try {
      const balance = await walletService.getBalance(profile.internal_wallet_address);
      const gasWei = await transferGasWei();
      const required = valueWei + gasWei;
      if (BigInt(balance.wei) < required) {
        return res.status(400).json({
          message: `Insufficient balance for amount + network fee. Available: ${ethers.formatEther(BigInt(balance.wei))} USDC, required: ${ethers.formatEther(required)} USDC.`
        });
      }
    } catch (balanceErr) {
      logger.warn('mpcSend balance check failed:', balanceErr.message);
      return res.status(500).json({ message: 'Unable to verify on-chain balance. Please try again.' });
    }

    // A fresh idempotency key per submission gives an independent signing
    // session; the MPC node's nonce manager prevents nonce reuse/double-spend,
    // and requestMpc performs its own provider-level deduplication.
    const result = await walletService.sendPayment({
      walletId: profile.provider_user_id,
      to,
      wei: valueWei.toString(),
      idempotencyKey: crypto.randomUUID()
    });

    return res.status(200).json({
      txHash: result.txHash,
      from: profile.internal_wallet_address,
      to,
      amount: ethers.formatEther(valueWei),
      network: process.env.CHAIN_NAME || 'Arc Testnet'
    });
  } catch (error) {
    logger.error('mpcSend error:', error.message);
    return res.status(error.status || 500).json({
      message: error.message || 'Server error during MPC broadcast'
    });
  }
};
