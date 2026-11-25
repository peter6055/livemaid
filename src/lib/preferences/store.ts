// Per-user preference documents in MongoDB.
//
// One document per owner, `_id` = owner id, so reads are point lookups. The owner is the signed-in
// user's id in workspace mode and the fixed `local` id in standalone mode (no auth, one implicit
// user). Preference documents are the ONE persistence path that requires MongoDB in every mode —
// diagrams remain file-system backed.

import { getMongoClient } from "@/lib/db/client";
import { mongoUriConfigured } from "@/lib/auth/appConfig";
import { normalizePreferences, sanitizePreferences, type UserPreferences } from "./core";

/** Owner id used when auth is disabled: a standalone install has exactly one implicit user. */
export const LOCAL_PREFERENCE_OWNER = "local";

const COLLECTION = "userPreferences";

type PreferencesDocument = Partial<UserPreferences> & { _id: string; updatedAt?: Date };

export function resolvePreferenceOwner(userId?: string | null): string {
  return userId ?? LOCAL_PREFERENCE_OWNER;
}

/** False when `MONGODB_URI` is unset, which the route reports as 503 instead of throwing. */
export function preferencesStorageConfigured(): boolean {
  return mongoUriConfigured();
}

async function getPreferencesCollection() {
  const client = await getMongoClient();
  return client.db().collection<PreferencesDocument>(COLLECTION);
}

export interface PreferencesSnapshot {
  preferences: UserPreferences;
  /** False when the owner has never saved preferences, so the client can seed from its local cache. */
  stored: boolean;
}

export async function readPreferences(ownerId: string): Promise<PreferencesSnapshot> {
  const collection = await getPreferencesCollection();
  const document = await collection.findOne({ _id: ownerId });
  return { preferences: normalizePreferences(document), stored: document !== null };
}

/** Apply a validated partial update (upsert) and return the resulting document. */
export async function writePreferences(
  ownerId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const collection = await getPreferencesCollection();
  const update = sanitizePreferences(patch);
  await collection.updateOne(
    { _id: ownerId },
    { $set: { ...update, updatedAt: new Date() } },
    { upsert: true },
  );
  const document = await collection.findOne({ _id: ownerId });
  return normalizePreferences(document);
}
