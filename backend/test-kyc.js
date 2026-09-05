import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    const user = await User.findOne({ email: 'lathaml@gmail.com' });
    if (!user) {
      console.log("User not found");
      process.exit(1);
    }
    
    user.global_verified = true;
    user.kyc = true;
    user.kycProvider = 'Test';
    user.metamaskId = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    
    if (!user.globalPayTag) {
      const regionCode = user.region ? user.region.toLowerCase().slice(0, 2) : 'gl';
      const baseName = user.name ? user.name.toLowerCase().replace(/\s+/g, '') : 'user';
      user.globalPayTag = `@${baseName}_${regionCode}`;
    }
    
    if (!user.internalWalletAddress) {
      const { ethers } = await import('ethers');
      const wallet = ethers.Wallet.createRandom();
      user.internalWalletAddress = wallet.address;
      user.walletPrivateKey = wallet.privateKey;
    }

    await user.save();
    console.log("Saved successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Save Error:", err);
    process.exit(1);
  }
};
run();
