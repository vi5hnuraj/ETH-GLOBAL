// backend/run-tests.js
import fs from 'fs';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const printSection = (title) => {
  console.log(`\n==================================================`);
  console.log(`🧪 TEST: ${title}`);
  console.log(`==================================================`);
};

const run = async () => {
  try {
    // ----------------------------------------------------
    // Test 1: Config & Env Variables
    // ----------------------------------------------------
    printSection("1. Configuration & Env Variables Check");
    const rpcUrl = process.env.RPC_URL || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io';
    const privateKey = process.env.TREASURY_PRIVATE_KEY;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

    console.log("✔️ RPC URL:", rpcUrl ? "Configured" : "MISSING");
    console.log("✔️ Treasury Private Key:", privateKey ? "Configured" : "MISSING");
    console.log("✔️ Supabase URL:", supabaseUrl ? "Configured" : "MISSING");

    if (!rpcUrl || !privateKey) {
      throw new Error("Missing required blockchain env variables. Check backend/.env");
    }

    if (!supabaseUrl) {
      throw new Error("Missing required Supabase URL variable. Check backend/.env");
    }

    // ----------------------------------------------------
    // Test 2: RPC Connectivity
    // ----------------------------------------------------
    printSection("2. Arc Testnet RPC Connection");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    console.log("✔️ Connected successfully!");
    console.log("✔️ Chain Name:", network.name);
    console.log("✔️ Chain ID:", network.chainId.toString());

    const blockNumber = await provider.getBlockNumber();
    console.log("✔️ Current Block Number:", blockNumber);

    // ----------------------------------------------------
    // Test 3: Treasury Account Gas Check
    // ----------------------------------------------------
    printSection("3. Treasury Account Gas Balance");
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log("✔️ Treasury Address:", wallet.address);
    
    const balance = await provider.getBalance(wallet.address);
    const balanceInEth = ethers.formatEther(balance);
    console.log(`✔️ Native Balance: ${balanceInEth} USDC`);

    if (balance === 0n) {
      console.warn("⚠️ WARNING: Treasury wallet has 0 USDC. Write/deploy transactions will fail.");
    }

    // ----------------------------------------------------
    // Test 4: Contract Data Check
    // ----------------------------------------------------
    printSection("4. Deployed Smart Contract Check");
    let contract = null;
    try {
      if (fs.existsSync('./contractData.json')) {
        const contractData = JSON.parse(fs.readFileSync('./contractData.json', 'utf8'));
        console.log("✔️ Contract Address:", contractData.address);
        console.log("✔️ ABI Loaded:", contractData.abi ? "Yes" : "No");

        contract = new ethers.Contract(contractData.address, contractData.abi, wallet);
        const name = await contract.name();
        const symbol = await contract.symbol();
        const decimals = await contract.decimals();
        
        console.log(`✔️ Token Name: ${name}`);
        console.log(`✔️ Token Symbol: ${symbol}`);
        console.log(`✔️ Token Decimals: ${decimals.toString()}`);

        if (Number(decimals) !== 18) {
          throw new Error("Token decimals must be 18 for Arc Chain integration.");
        }
      } else {
        if (process.env.PAYMENT_MODE === 'BOT') {
          console.log("✔️ contractData.json missing (Optional in Native USDC Mode).");
        } else {
          throw new Error("contractData.json not found. Run node deployLedger.js first.");
        }
      }
    } catch (contractErr) {
      if (process.env.PAYMENT_MODE === 'BOT') {
        console.log("⚠️ Contract Check Failed (Ignored in Native USDC Mode):", contractErr.message);
      } else {
        throw contractErr;
      }
    }

    // ----------------------------------------------------
    // Test 5: Supabase Connection & Schema Verification
    // ----------------------------------------------------
    printSection("5. Supabase Connection & Schema Test");
    const { supabase } = await import('./src/config/supabaseClient.js');
    const { data: testData, error: testErr } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (testErr) {
      throw new Error(`Supabase connection failed: ${testErr.message}`);
    }
    console.log("✔️ Supabase Connected!");
    console.log("✔️ PostgreSQL profiles table exists!");

    // ----------------------------------------------------
    // Test 5.5: Live Conversion Rates & Price Calculation
    // ----------------------------------------------------
    printSection("5.5 Live Conversion Rates & High-Precision Calculations Check");
    if (process.env.PAYMENT_MODE === 'BOT') {
      try {
        console.log("🧪 Fetching live exchange rates...");
        const rateResponse = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const rateData = await rateResponse.json();
        let rates = rateData.rates || {};

        const rate = rates['INR'] || 87.0;
        console.log(`✔️ Live INR Rate: 1 USD ≈ ${rate} INR`);

        console.log("🧪 Resolving live USDC price...");
        const botPriceUsd = 1.0;
        console.log(`✔️ Live USDC Price: $${botPriceUsd} USD (1:1 peg)`);

        console.log("\n🧪 Running high-precision math simulation for ₹100 deposit...");
        const depositAmountLocal = 100.0;
        
        const amountBig = ethers.parseUnits(depositAmountLocal.toString(), 18);
        const rateBig = ethers.parseUnits(rate.toString(), 18);
        const priceBig = ethers.parseUnits(botPriceUsd.toString(), 18);

        const scale18 = 10n ** 18n;
        const usdAmountBig = (amountBig * scale18) / rateBig;
        const tokenAmountBig = (usdAmountBig * scale18) / priceBig;

        const simulatedBot = parseFloat(ethers.formatUnits(tokenAmountBig, 18));
        console.log(`✔️ Math Output: ₹100 deposit => ${simulatedBot.toFixed(8)} USDC`);
      } catch (calcErr) {
        throw new Error(`Conversion checks failed: ${calcErr.message}`);
      }
    } else {
      console.log("✔️ Skipped conversion tests: PAYMENT_MODE is not USDC.");
    }

    // ----------------------------------------------------
    // Test 6: Blockchain Read & Write Verification
    // ----------------------------------------------------
    printSection(process.env.PAYMENT_MODE === 'BOT' ? "6. Native USDC Read & Write Interaction" : "6. Smart Contract Read & Write Interaction");
    if (balance === 0n) {
      console.log("⚠️ Skipped write tests: Insufficient Gas (0 USDC balance).");
    } else {
      if (process.env.PAYMENT_MODE === 'BOT') {
        const dummyWallet1 = ethers.Wallet.createRandom().connect(provider);
        const dummyAddress1 = dummyWallet1.address;
        const dummyAddress2 = "0x98205a3a3b2a6ad1157a414b24b3d4fdff8b1276";

        console.log("🧪 6.1 Checking initial balances...");
        const balBefore1 = await provider.getBalance(dummyAddress1);
        const balBefore2 = await provider.getBalance(dummyAddress2);
        console.log(`   Dummy 1: ${ethers.formatUnits(balBefore1, 18)} USDC`);
        console.log(`   Dummy 2: ${ethers.formatUnits(balBefore2, 18)} USDC`);

        const testAmount = ethers.parseUnits("0.05", 18);

        console.log("\n🧪 6.2 Depositing (Sending native USDC) 0.05 USDC to Dummy 1...");
        const depTx = await wallet.sendTransaction({
          to: dummyAddress1,
          value: testAmount
        });
        console.log("   Transaction sent. Hash:", depTx.hash);
        await depTx.wait();
        console.log("✔️ Deposit transaction confirmed!");

        console.log("\n🧪 6.3 Executing Transfer of 0.02 USDC from Dummy 1 to Dummy 2...");
        const transferAmount = ethers.parseUnits("0.02", 18);
        const transTx = await dummyWallet1.sendTransaction({
          to: dummyAddress2,
          value: transferAmount
        });
        console.log("   Transaction sent. Hash:", transTx.hash);
        await transTx.wait();
        console.log("✔️ Transfer transaction confirmed!");

        console.log("\n🧪 6.4 Withdrawing (Sending native USDC) remaining balance from Dummy 1 back to Treasury...");
        const balCurrent1 = await provider.getBalance(dummyAddress1);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits("1.5", "gwei");
        const gasCost = 21000n * gasPrice;
        const burnAmount = balCurrent1 - gasCost;

        if (burnAmount > 0n) {
          const burnTx = await dummyWallet1.sendTransaction({
            to: wallet.address,
            value: burnAmount,
            gasLimit: 21000,
            gasPrice: gasPrice
          });
          console.log("   Transaction sent. Hash:", burnTx.hash);
          await burnTx.wait();
          console.log("✔️ Withdraw transaction confirmed!");
        } else {
          console.log("✔️ Skipped withdraw: balance too low to cover gas.");
        }

        console.log("\n🧪 6.5 Checking final balances...");
        const balAfter1 = await provider.getBalance(dummyAddress1);
        const balAfter2 = await provider.getBalance(dummyAddress2);
        console.log(`   Dummy 1 (should be ~0): ${ethers.formatUnits(balAfter1, 18)} USDC`);
        console.log(`   Dummy 2 (should have +0.02): ${ethers.formatUnits(balAfter2, 18)} USDC`);

        if (balAfter2 < balBefore2 + transferAmount) {
          throw new Error("Final Dummy 2 balance is lower than expected.");
        }
        console.log("✔️ Blockchain write operations verified successfully!");
      } else {
        const dummyAddress1 = "0x89205a3a3b2a6ad1157a414b24b3d4fdff8b1275";
        const dummyAddress2 = "0x98205a3a3b2a6ad1157a414b24b3d4fdff8b1276";
        
        console.log("🧪 6.1 Checking initial balances...");
        const balBefore1 = await contract.balanceOf(dummyAddress1);
        const balBefore2 = await contract.balanceOf(dummyAddress2);
        console.log(`   Dummy 1: ${ethers.formatUnits(balBefore1, 18)} pUSDC`);
        console.log(`   Dummy 2: ${ethers.formatUnits(balBefore2, 18)} pUSDC`);

        const testAmount = ethers.parseUnits("5.0", 18);

        console.log("\n🧪 6.2 Depositing (Minting) 5 pUSDC to Dummy 1...");
        const depTx = await contract.depositFiat(dummyAddress1, testAmount);
        console.log("   Transaction sent. Hash:", depTx.hash);
        await depTx.wait();
        console.log("✔️ Deposit transaction confirmed!");

        console.log("\n🧪 6.3 Executing Forced Transfer of 2 pUSDC from Dummy 1 to Dummy 2...");
        const transferAmount = ethers.parseUnits("2.0", 18);
        const transTx = await contract.executeTransfer(dummyAddress1, dummyAddress2, transferAmount);
        console.log("   Transaction sent. Hash:", transTx.hash);
        await transTx.wait();
        console.log("✔️ Transfer transaction confirmed!");

        console.log("\n🧪 6.4 Withdrawing (Burning) 3 pUSDC from Dummy 1...");
        const burnAmount = ethers.parseUnits("3.0", 18);
        const burnTx = await contract.withdrawFiat(dummyAddress1, burnAmount);
        console.log("   Transaction sent. Hash:", burnTx.hash);
        await burnTx.wait();
        console.log("✔️ Withdraw transaction confirmed!");

        console.log("\n🧪 6.5 Checking final balances...");
        const balAfter1 = await contract.balanceOf(dummyAddress1);
        const balAfter2 = await contract.balanceOf(dummyAddress2);
        console.log(`   Dummy 1 (should be unchanged/0): ${ethers.formatUnits(balAfter1, 18)} pUSDC`);
        console.log(`   Dummy 2 (should have +2): ${ethers.formatUnits(balAfter2, 18)} pUSDC`);

        if (balAfter2 !== balBefore2 + transferAmount) {
          throw new Error("Final balances do not match expected outcomes.");
        }
        console.log("✔️ Blockchain write operations verified successfully!");
      }
    }

    console.log(`\n==================================================`);
    console.log(`🎉 ALL TESTS COMPLETED SUCCESSFULLY!`);
    console.log(`==================================================`);
    process.exit(0);

  } catch (err) {
    console.error(`\n❌ TEST RUN FAILED:`, err.message || err);
    process.exit(1);
  }
};

run();
