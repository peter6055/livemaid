export function getEnvironment(): string {
  const mode = process.env.NODE_ENV === "development" ? "Dev" : "Prod";
  const demo = process.env.DEMO_MODE === "true" ? " Demo" : "";
  return `${mode}${demo}`;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function getRawVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
}

export function getDisplayVersion(): string {
  return `${getRawVersion()} (${getEnvironment()})`;
}
