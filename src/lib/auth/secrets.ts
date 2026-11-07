import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const SECRETS_DIR = path.join(DATA_DIR, ".livemaid");

const AUTH_SECRET_FILE = path.join(SECRETS_DIR, "auth-secret");
const AUDIT_PEPPER_FILE = path.join(SECRETS_DIR, "audit-ip-pepper");

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

function generateSecret(): string {
  return randomBytes(32).toString("base64");
}

function ensureSecretsDir(): void {
  if (isTest) return;
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
}

function readSecretFile(filePath: string): string | null {
  if (isTest) return null;
  try {
    const value = fs.readFileSync(filePath, "utf-8").trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeSecretFile(filePath: string, value: string): void {
  if (isTest) return;
  ensureSecretsDir();
  fs.writeFileSync(filePath, `${value}\n`, "utf-8");
}

export function ensureAuthSecret(): string {
  const env = process.env.AUTH_SECRET;
  if (env) return env;

  const file = readSecretFile(AUTH_SECRET_FILE);
  if (file) {
    process.env.AUTH_SECRET = file;
    return file;
  }

  const generated = generateSecret();
  writeSecretFile(AUTH_SECRET_FILE, generated);
  process.env.AUTH_SECRET = generated;
  return generated;
}

export function getExistingAuthSecret(): string | null {
  return process.env.AUTH_SECRET || readSecretFile(AUTH_SECRET_FILE);
}

export function ensureAuditIpPepper(): string {
  const env = process.env.AUDIT_IP_PEPPER;
  if (env) return env;

  const file = readSecretFile(AUDIT_PEPPER_FILE);
  if (file) {
    process.env.AUDIT_IP_PEPPER = file;
    return file;
  }

  const generated = generateSecret();
  writeSecretFile(AUDIT_PEPPER_FILE, generated);
  process.env.AUDIT_IP_PEPPER = generated;
  return generated;
}
