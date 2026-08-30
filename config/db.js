import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoServer = null;

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  
  // If an external URI is provided, try connecting to it first
  if (uri) {
    try {
      console.log(`Connecting to MongoDB at: ${uri}...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 3000,
      });
      console.log('MongoDB connected successfully to primary instance.');
      return;
    } catch (err) {
      console.warn(`Could not connect to configured MongoDB URI (${err.message}). Falling back to local persistent embedded MongoDB...`);
    }
  }

  // Fallback / Default: Embedded MongoDB with persistent on-disk storage
  try {
    const dataDir = path.resolve(__dirname, '..', 'data', 'db');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    console.log(`Initializing persistent embedded MongoDB engine with storage path: ${dataDir}...`);
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbPath: dataDir,
        storageEngine: 'wiredTiger',
      },
    });

    const localUri = mongoServer.getUri();
    console.log(`Persistent embedded MongoDB running at: ${localUri}`);
    await mongoose.connect(localUri);
    console.log('MongoDB connected successfully with persistent disk storage enabled.');
  } catch (memErr) {
    console.error('Failed to initialize embedded MongoDB engine:', memErr);
    throw memErr;
  }
};

export const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Mongoose connection closed.');
    }
    if (mongoServer) {
      await mongoServer.stop();
      console.log('Embedded MongoDB engine stopped cleanly.');
    }
  } catch (err) {
    console.error('Error during database disconnect:', err);
  }
};
