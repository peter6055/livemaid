import { describe, it, expect, vi, afterEach } from "vitest";
import type { Db } from "mongodb";
import { ensureIndexes } from "@/lib/db/indexes";

type IndexCall = { keys: Record<string, 1>; options?: { unique?: boolean } };

/** Fake Db that records createIndex calls per collection name. */
function makeDb(failOn?: string) {
  const calls: Record<string, IndexCall[]> = {};
  const db = {
    collection(name: string) {
      return {
        async createIndex(keys: Record<string, 1>, options?: { unique?: boolean }) {
          const id = `${name}:${Object.keys(keys).join(",")}`;
          if (id === failOn) {
            throw new Error(`boom ${id}`);
          }
          (calls[name] ??= []).push({ keys, options });
          return Object.keys(keys).join("_");
        },
      };
    },
  } as unknown as Db;
  return { db, calls };
}

describe("ensureIndexes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates every index the workspace member queries rely on", async () => {
    const { db, calls } = makeDb();

    await ensureIndexes(db);

    expect(calls.users).toEqual([{ keys: { email: 1 }, options: { unique: true } }]);
    expect(calls.memberships).toEqual(
      expect.arrayContaining([
        { keys: { userId: 1, workspaceId: 1, status: 1 }, options: undefined },
        { keys: { invitedEmail: 1, status: 1 }, options: undefined },
        { keys: { workspaceId: 1, status: 1 }, options: undefined },
      ]),
    );
    expect(calls.memberships).toHaveLength(3);
    expect(calls.accounts).toEqual(
      expect.arrayContaining([
        { keys: { provider: 1, providerAccountId: 1 }, options: undefined },
        { keys: { userId: 1 }, options: undefined },
      ]),
    );
    expect(calls.accounts).toHaveLength(2);
  });

  it("keeps creating the other indexes when one createIndex fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, calls } = makeDb("users:email");

    await expect(ensureIndexes(db)).resolves.toBeUndefined();

    expect(calls.users).toBeUndefined();
    expect(calls.memberships).toHaveLength(3);
    expect(calls.accounts).toHaveLength(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("users");
  });
});
