import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import User from './src/models/User.js';

dotenv.config();

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");

    const users = await User.find({ kyc: true, metamaskId: { $ne: "" }, $or: [{ internalWalletAddress: "" }, { internalWalletAddress: { $exists: false } }] });
    console.log(`Found ${users.length} users needing internal wallets...`);

    for (const user of users) {
      const wallet = ethers.Wallet.createRandom();
      user.internalWalletAddress = wallet.address;
      user.walletPrivateKey = wallet.privateKey;
      await user.save();
      console.log(`Generated internal wallet for ${user.email}: ${wallet.address}`);
    }

    console.log("Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
};

migrate();
