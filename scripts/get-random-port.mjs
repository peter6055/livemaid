import net from "node:net";

const DEFAULT_MIN = 20000;
const DEFAULT_MAX = 30000;
const MAX_ATTEMPTS = 20;

function randomPort(min = DEFAULT_MIN, max = DEFAULT_MAX) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

export async function getRandomPort(min = DEFAULT_MIN, max = DEFAULT_MAX) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const port = randomPort(min, max);
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `Could not find a free port in range ${min}-${max} after ${MAX_ATTEMPTS} attempts`,
  );
}
