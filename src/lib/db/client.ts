import { MongoClient } from "mongodb";

declare global {
  var __livemaidMongoClient: MongoClient | undefined;
}

const globalForMongo = globalThis as typeof globalThis & {
  __livemaidMongoClient?: MongoClient;
};

export async function getMongoClient(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  if (!globalForMongo.__livemaidMongoClient) {
    globalForMongo.__livemaidMongoClient = new MongoClient(process.env.MONGODB_URI);
  }

  return globalForMongo.__livemaidMongoClient;
}
