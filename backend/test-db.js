import mongoose from "mongoose";
import dotenv from "dotenv";
import RequestMoney from "./src/models/requestMoney.js";

dotenv.config({ path: "./.env" });
// Fallback if dotenv didn't load properly in script
const uri = process.env.MONGO_URL || process.env.MONGO_URI;

const run = async () => {
  if (!uri) {
    console.error("Missing MONGO_URL or MONGO_URI environment variables.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const reqId = "6a21fec7974d7bd6ba766f08"; 

  console.log("1. Finding RequestMoney with any request...");
  const docs = await RequestMoney.find();
  docs.forEach(d => {
     console.log(`Doc _id: ${d._id}`);
     d.requests.forEach(r => {
        console.log(`  -> req _id: ${r._id} (type: ${typeof r._id}, isObjectId: ${r._id instanceof mongoose.Types.ObjectId})`);
     });
  });

  process.exit(0);
};

run().catch(console.error);
