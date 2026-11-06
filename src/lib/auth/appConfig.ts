import { ObjectId } from "mongodb";
import { getAppConfigCollection, type DbAppConfig } from "@/lib/db/collections";

function mongoUriConfigured(): boolean {
  return !!process.env.MONGODB_URI;
}

function getAuthSecret() {
  return process.env.AUTH_SECRET;
}

function getOidcIssuer() {
  return process.env.AUTH_OIDC_ISSUER;
}

function getOidcClientId() {
  return process.env.AUTH_OIDC_CLIENT_ID;
}

function getOidcClientSecret() {
  return process.env.AUTH_OIDC_CLIENT_SECRET;
}

export function areOidcCredentialsConfigured(): boolean {
  return !!(getAuthSecret() && getOidcIssuer() && getOidcClientId() && getOidcClientSecret());
}

let cached: DbAppConfig | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

export async function getAppConfigDoc(): Promise<DbAppConfig> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  if (!mongoUriConfigured()) {
    // Without MongoDB, auth cannot be enabled. Return a static disabled doc.
    const fallback: DbAppConfig = {
      _id: new ObjectId(),
      authEnabled: false,
      updatedAt: new Date(),
      updatedByUserId: null,
    };
    return fallback;
  }

  const coll = await getAppConfigCollection();
  const doc = await coll.findOne({});
  if (doc) {
    cached = doc;
    cachedAt = now;
    return doc;
  }

  const defaultDoc: DbAppConfig = {
    _id: new ObjectId(),
    authEnabled: false,
    updatedAt: new Date(),
    updatedByUserId: null,
  };

  try {
    await coll.insertOne(defaultDoc);
  } catch {
    // Another process may have inserted a doc concurrently; read it back.
    const existing = await coll.findOne({});
    if (existing) {
      cached = existing;
      cachedAt = now;
      return existing;
    }
  }

  cached = defaultDoc;
  cachedAt = now;
  return defaultDoc;
}

export async function isAuthEnabled(): Promise<boolean> {
  const appConfig = await getAppConfigDoc();
  return appConfig.authEnabled && areOidcCredentialsConfigured();
}

export async function setAuthEnabled(enabled: boolean, updatedByUserId?: string): Promise<void> {
  if (!mongoUriConfigured()) {
    throw new Error("MONGODB_URI is not set");
  }
  const coll = await getAppConfigCollection();
  await coll.updateOne(
    {},
    {
      $set: {
        authEnabled: enabled,
        updatedAt: new Date(),
        updatedByUserId: updatedByUserId ? new ObjectId(updatedByUserId) : null,
      },
      $setOnInsert: { _id: new ObjectId() },
    },
    { upsert: true },
  );
  cached = null;
}
