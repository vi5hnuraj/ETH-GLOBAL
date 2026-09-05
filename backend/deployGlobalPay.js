import { ethers } from 'ethers';
import solc from 'solc';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

const contractPath = path.resolve('contracts/GlobalPayPaymentManager.sol');
const contractSource = fs.readFileSync(contractPath, 'utf-8');

async function deploy() {
    console.log("Compiling GlobalPayPaymentManager...");

    const input = {
        language: 'Solidity',
        sources: {
            'GlobalPayPaymentManager.sol': { content: contractSource }
        },
        settings: {
            outputSelection: { '*': { '*': ['*'] } }
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach(err => {
            if (err.severity === 'error') hasError = true;
            console.error(err.formattedMessage);
        });
        if (hasError) return;
    }

    const contract = output.contracts['GlobalPayPaymentManager.sol']['GlobalPayPaymentManager'];
    const abi = contract.abi;
    const bytecode = contract.evm.bytecode.object;

    console.log("Compiled successfully!");

    const rpcUrl = process.env.RPC_URL || process.env.BASE_RPC_URL || "https://sepolia.base.org";
    const privateKey = process.env.TREASURY_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
        console.error("Missing RPC URL or Private Key in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Deploying with Treasury Wallet:", wallet.address);

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    try {
        const deployedContract = await factory.deploy();
        await deployedContract.waitForDeployment();
        const address = await deployedContract.getAddress();

        console.log("\n============================================");
        console.log("GLOBAL PAY PAYMENT MANAGER DEPLOYED!");
        console.log("Contract Address:", address);
        console.log("============================================\n");

        const contractData = { address, abi };
        fs.writeFileSync('./globalPayData.json', JSON.stringify(contractData, null, 2));
        console.log("Saved to globalPayData.json");

        console.log("\nAdd to .env:");
        console.log(`GLOBAL_PAY_MANAGER_ADDRESS=${address}`);
    } catch (err) {
        console.error("Deployment failed:", err);
    }
}

deploy();
