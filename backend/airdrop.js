import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

async function airdrop() {
    try {
        const contractData = JSON.parse(fs.readFileSync('./contractData.json', 'utf8'));
        const rpcUrl = process.env.RPC_URL || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io';
        const privateKey = process.env.TREASURY_PRIVATE_KEY;
        
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(contractData.address, contractData.abi, wallet);
        
        console.log("Minting tokens for existing users...");

        // Mint 1000 tokens to @user_gl
        const amount = ethers.parseUnits("1000", 18);
        
        console.log("Minting to @user_gl...");
        let tx = await contract.depositFiat("@user_gl", amount);
        await tx.wait();

        console.log("Minting to @testexample_me...");
        tx = await contract.depositFiat("@testexample_me", amount);
        await tx.wait();

        console.log("Successfully minted tokens! Users can now send crypto.");
    } catch (err) {
        console.error("Airdrop failed:", err);
    }
}

airdrop();
