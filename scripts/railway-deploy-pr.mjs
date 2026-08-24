import { spawnSync } from "node:child_process";
import { pickOffPeakRegion } from "./railway-region.mjs";

const API = "https://backboard.railway.com/graphql/v2";

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function pickToken() {
  if (process.env.RAILWAY_API_TOKEN) {
    return { token: process.env.RAILWAY_API_TOKEN, isProject: false };
  }
  if (process.env.RAILWAY_TOKEN) {
    return { token: process.env.RAILWAY_TOKEN, isProject: true };
  }
  throw new Error(
    "Missing Railway auth: set RAILWAY_API_TOKEN (workspace/account token) or RAILWAY_TOKEN (project token)",
  );
}

async function gql(tokenInfo, query, variables) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (tokenInfo.isProject) {
    headers["Project-Access-Token"] = tokenInfo.token;
  } else {
    headers["Authorization"] = `Bearer ${tokenInfo.token}`;
  }
  const res = await fetch(API, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Railway API returned ${res.status}`);
  const { data, errors } = await res.json();
  if (errors) throw new Error(JSON.stringify(errors));
  return data;
}

export async function findEnvironmentId(tokenInfo, projectId, candidates) {
  const data = await gql(
    tokenInfo,
    `query environments($projectId: String!) {
      environments(projectId: $projectId) {
        edges { node { id name } }
      }
    }`,
    { projectId },
  );
  const environments = data.environments.edges.map((edge) => edge.node);
  for (const name of candidates) {
    const match = environments.find((env) => env.name === name);
    if (match) return { id: match.id, name: match.name };
  }
  throw new Error(
    `No Railway environment found matching ${candidates.join(" or ")}. Available: ${environments
      .map((e) => e.name)
      .join(", ")}`,
  );
}

export async function resolveServiceId(tokenInfo, projectId, serviceName) {
  const data = await gql(
    tokenInfo,
    `query project($id: String!) {
      project(id: $id) {
        services {
          edges { node { id name } }
        }
      }
    }`,
    { id: projectId },
  );
  const services = data.project.services.edges.map((edge) => edge.node);
  const match = services.find((service) => service.name === serviceName);
  if (!match) {
    throw new Error(
      `No Railway service named "${serviceName}" found. Available: ${services
        .map((s) => s.name)
        .join(", ")}`,
    );
  }
  return match.id;
}

export async function updateRegion(tokenInfo, serviceId, environmentId, regionId) {
  const input = {
    multiRegionConfig: { [regionId]: { numReplicas: 1 } },
    sleepApplication: true,
  };
  await gql(
    tokenInfo,
    `mutation serviceInstanceUpdate(
      $serviceId: String!
      $environmentId: String!
      $input: ServiceInstanceUpdateInput!
    ) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }`,
    { serviceId, environmentId, input },
  );
}

async function main() {
  const projectId = requireEnv("RAILWAY_PROJECT_ID");
  const serviceName = requireEnv("RAILWAY_SERVICE_NAME");
  const prNumber = requireEnv("PR_NUMBER");
  const tokenInfo = pickToken();

  const region = pickOffPeakRegion();
  if (!region) {
    throw new Error(
      "All Railway regions are currently in peak hours; no off-peak region available",
    );
  }
  console.log(`Picked off-peak region: ${region.id} (${region.label})`);

  const serviceId = await resolveServiceId(tokenInfo, projectId, serviceName);
  console.log(`Resolved service: ${serviceName} (${serviceId})`);

  const candidates = [`livemaid-pr-${prNumber}`, `pr-${prNumber}`];
  const env = await findEnvironmentId(tokenInfo, projectId, candidates);
  console.log(`Resolved environment: ${env.name} (${env.id})`);

  await updateRegion(tokenInfo, serviceId, env.id, region.id);
  console.log(`Set region of ${env.name} to ${region.id}`);

  const childEnv = {
    ...process.env,
    RAILWAY_API_TOKEN: tokenInfo.isProject ? undefined : tokenInfo.token,
    RAILWAY_TOKEN: tokenInfo.isProject ? tokenInfo.token : undefined,
  };
  const result = spawnSync(
    "railway",
    [
      "up",
      "--detach",
      "--no-gitignore",
      "--project",
      projectId,
      "--environment",
      env.name,
      "--service",
      serviceName,
    ],
    { stdio: "inherit", env: childEnv },
  );
  if (result.status !== 0) {
    throw new Error(`railway up failed with exit code ${result.status}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
