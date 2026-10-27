import { describe, it, expect, beforeEach } from "vitest";
import { getMongoClient } from "@/lib/db/client";

describe("db client", () => {
  beforeEach(() => {
    delete process.env.MONGODB_URI;
  });

  it("does not throw at import time", () => {
    expect(getMongoClient).toBeDefined();
  });

  it("throws at call time when MONGODB_URI is missing", async () => {
    await expect(getMongoClient()).rejects.toThrow("MONGODB_URI is not set");
  });
});
