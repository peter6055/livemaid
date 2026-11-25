import type { Db } from "mongodb";

type IndexSpec = [collection: string, keys: Record<string, 1>, options?: { unique: true }];

// Queries run without these indexes are full collection scans (users.findOne by
// email, memberships by workspaceId), so they are created once on first use.
const INDEXES: IndexSpec[] = [
  ["users", { email: 1 }, { unique: true }],
  ["memberships", { userId: 1, workspaceId: 1, status: 1 }],
  ["memberships", { invitedEmail: 1, status: 1 }],
  ["memberships", { workspaceId: 1, status: 1 }],
  ["accounts", { provider: 1, providerAccountId: 1 }],
  ["accounts", { userId: 1 }],
];

/**
 * Creates the indexes the app's queries rely on. Idempotent, never throws: a
 * single failing index (e.g. duplicate emails blocking the unique one) is
 * logged and the rest are still created.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all(
    INDEXES.map(async ([collection, keys, options]) => {
      try {
        await db.collection(collection).createIndex(keys, options);
      } catch (error) {
        console.error(`Failed to create index ${collection} ${JSON.stringify(keys)}:`, error);
      }
    }),
  );
}
