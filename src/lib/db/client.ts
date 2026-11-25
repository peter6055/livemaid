import { MongoClient } from "mongodb";
import { ensureIndexes } from "./indexes";

declare global {
  var __livemaidMongoClient: MongoClient | undefined;
  var __livemaidMongoIndexes: Promise<void> | undefined;
}

const globalForMongo = globalThis as typeof globalThis & {
  __livemaidMongoClient?: MongoClient;
  __livemaidMongoIndexes?: Promise<void>;
};

export async function getMongoClient(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  globalForMongo.__livemaidMongoClient ??= new MongoClient(process.env.MONGODB_URI, {
    // Fail fast so the middleware error screen appears instead of hanging for 30s.
    serverSelectionTimeoutMS: 5000,
  });

  // Attempted once per process so the first query already hits indexed collections.
  globalForMongo.__livemaidMongoIndexes ??= ensureIndexes(
    globalForMongo.__livemaidMongoClient.db(),
  );
  await globalForMongo.__livemaidMongoIndexes;

  return globalForMongo.__livemaidMongoClient;
}
