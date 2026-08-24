const REGIONS = [
  {
    id: "us-west2",
    timeZone: "America/Los_Angeles",
    label: "US West",
  },
  {
    id: "europe-west4-drams3a",
    timeZone: "Europe/Amsterdam",
    label: "EU West",
  },
  {
    id: "asia-southeast1-eqsg3a",
    timeZone: "Asia/Singapore",
    label: "Southeast Asia",
  },
  {
    id: "us-east4-eqdc4a",
    timeZone: "America/New_York",
    label: "US East",
  },
];

const PEAK_START_HOUR = 8;
const PEAK_END_HOUR = 20;

function localHourInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart.value) % 24;
}

export function isPeakHour(date, timeZone) {
  const hour = localHourInZone(date, timeZone);
  return hour >= PEAK_START_HOUR && hour < PEAK_END_HOUR;
}

export function isOffPeak(date, timeZone) {
  return !isPeakHour(date, timeZone);
}

export function pickOffPeakRegion(date = new Date(), preference = REGIONS) {
  for (const region of preference) {
    if (isOffPeak(date, region.timeZone)) {
      return region;
    }
  }
  return null;
}

export function regionsWithPeakStatus(date = new Date()) {
  return REGIONS.map((region) => ({
    ...region,
    peak: isPeakHour(date, region.timeZone),
    localHour: localHourInZone(date, region.timeZone),
  }));
}

function parseArgDate(argv) {
  const whenIndex = argv.indexOf("--when");
  if (whenIndex === -1 || !argv[whenIndex + 1]) return new Date();
  const parsed = new Date(argv[whenIndex + 1]);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --when date: ${argv[whenIndex + 1]}`);
  }
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const date = parseArgDate(process.argv);
  const picked = pickOffPeakRegion(date);
  const rows = regionsWithPeakStatus(date);
  for (const region of rows) {
    console.log(
      `${region.id.padEnd(28)} ${region.label.padEnd(16)} local=${String(region.localHour).padStart(
        2,
      )}h peak=${region.peak}`,
    );
  }
  if (!picked) {
    console.error("ERROR: all regions are in peak hours; no off-peak region available");
    process.exit(1);
  }
  console.log(`PICKED_REGION=${picked.id}`);
}
