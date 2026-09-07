import fs from 'fs';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
  try {
    const contractData = JSON.parse(fs.readFileSync('./contractData.json', 'utf8'));
    const rpcUrl = process.env.RPC_URL || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io';
    const privateKey = process.env.TREASURY_PRIVATE_KEY;

    console.log("RPC:", rpcUrl);
    console.log("Private Key length:", privateKey?.length);

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractData.address, contractData.abi, wallet);
    
    console.log("Contract Address:", contractData.address);

    const netTokenAmount = ethers.parseUnits("1", 18);
    // Use dummy addresses for test
    const sender = wallet.address; 
    const receiver = "0xD25F8736C3Efc19a7cb7A3D15f2aF22c2980E317";
    
    console.log("Sending from", sender, "to", receiver);
    const tx = await contract.executeTransfer(sender, receiver, netTokenAmount);
    console.log("Tx hash:", tx.hash);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};
run();
