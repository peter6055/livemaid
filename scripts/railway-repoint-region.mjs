import {
  findEnvironmentId,
  requireEnv,
  pickToken,
  resolveServiceId,
  updateRegion,
} from "./railway-deploy-pr.mjs";
import { pickOffPeakRegion } from "./railway-region.mjs";

async function main() {
  const projectId = requireEnv("RAILWAY_PROJECT_ID");
  const serviceName = requireEnv("RAILWAY_SERVICE_NAME");
  const environment = requireEnv("RAILWAY_ENVIRONMENT");
  const tokenInfo = pickToken();

  const region = pickOffPeakRegion();
  if (!region) {
    throw new Error(
      "All Railway regions are currently in peak hours; no off-peak region available",
    );
  }
  console.log(`Picked off-peak region: ${region.id} (${region.label})`);

  const serviceId = await resolveServiceId(tokenInfo, projectId, serviceName);
  const env = await findEnvironmentId(tokenInfo, projectId, [environment]);
  await updateRegion(tokenInfo, serviceId, env.id, region.id);
  console.log(`Set region of ${env.name} to ${region.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
