import express from "express";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AtemClient } from "./atem-client.mjs";
import { X32Client } from "./x32-client.mjs";

const app = express();
const port = Number(process.env.BRIDGE_PORT || 4179);
const host = "127.0.0.1";
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../dist/public");
const state = {
  x32: null,
  atem: null,
  busNumber: null,
};

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function isPrivateIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254);
}

function validateAddress(address, label) {
  if (typeof address !== "string" || !isPrivateIPv4(address)) {
    throw new Error(`${label} must be a private IPv4 address on the local show network.`);
  }
  const lastOctet = Number(address.split(".")[3]);
  if (lastOctet === 0 || lastOctet === 255) {
    throw new Error(`${label} must be a device address, not a network or broadcast address.`);
  }
  return address;
}

function status() {
  const x32Connected = Boolean(state.x32?.connected);
  return {
    mode: "local",
    x32: state.x32?.status || { connected: false, address: null, model: null },
    atem: state.atem?.status || { connected: false, address: null, model: null },
    streamBus: {
      name: state.busNumber ? `Stream Bus · Bus ${state.busNumber}` : "Stream Bus",
      busNumber: state.busNumber,
      levelDb: x32Connected ? state.x32.levelDb : null,
      mute: x32Connected ? state.x32.mute : null,
      peakDbfs: null,
    },
    processing: x32Connected ? state.x32.processing : null,
  };
}

// The bridge is loopback-only. Reject browser requests from hosted pages or
// unrelated local websites so a remote origin cannot issue mixer commands.
app.use((req, res, next) => {
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const origin = req.get("origin");
  const hostHeader = req.get("host");
  if (hostHeader && !allowedHosts.has(hostHeader)) {
    return sendError(res, 403, "This local bridge only accepts requests addressed to localhost.");
  }
  if (origin && !new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]).has(origin)) {
    return sendError(res, 403, "This local bridge only accepts requests from its local console.");
  }
  next();
});

app.use(express.json({ limit: "8kb" }));

app.get("/bridge-api/status", (_req, res) => res.json(status()));

app.post("/bridge-api/connect", async (req, res) => {
  let x32Address;
  let atemAddress;
  const busNumber = Number(req.body?.busNumber);

  try {
    x32Address = validateAddress(req.body?.x32Address, "X32 address");
    atemAddress = validateAddress(req.body?.atemAddress, "ATEM address");
  } catch (error) {
    return sendError(res, 400, error.message);
  }
  if (!Number.isInteger(busNumber) || busNumber < 1 || busNumber > 16) {
    return sendError(res, 400, "Choose an X32 stream bus from 1 to 16.");
  }

  await disconnectDevices();
  state.busNumber = busNumber;
  state.x32 = new X32Client(x32Address, busNumber);
  state.atem = new AtemClient(atemAddress);

  const results = await Promise.allSettled([
    state.x32.connect(),
    state.atem.connect(),
  ]);
  const failures = results
    .map((result) => result.status === "rejected" ? result.reason?.message : null)
    .filter(Boolean);

  if (failures.length) {
    return res.status(502).json({
      error: failures.join(" "),
      status: status(),
    });
  }
  return res.json(status());
});

app.post("/bridge-api/disconnect", async (_req, res) => {
  await disconnectDevices();
  state.busNumber = null;
  res.json(status());
});

app.post("/bridge-api/stream-bus", (req, res) => {
  const { action, levelDb, mute } = req.body || {};
  if (!state.x32?.connected || !state.busNumber) {
    return sendError(res, 409, "Connect to an X32 and select its stream bus first.");
  }

  try {
    if (action === "set-level") {
      if (typeof levelDb !== "number" || !Number.isFinite(levelDb) || levelDb < -60 || levelDb > 10 || !Number.isInteger(levelDb * 2)) {
        return sendError(res, 400, "Stream bus level must be between -60 and +10 dB.");
      }
      state.x32.setLevel(levelDb);
    } else if (action === "set-mute") {
      if (typeof mute !== "boolean") {
        return sendError(res, 400, "Mute command must include a boolean value.");
      }
      state.x32.setMute(mute);
    } else {
      return sendError(res, 400, "Only explicit stream bus level and mute commands are supported.");
    }
  } catch (error) {
    return sendError(res, 503, error instanceof Error ? error.message : "Could not send the X32 command.");
  }

  return res.json({ accepted: true, status: status() });
});

app.post("/bridge-api/processing", (req, res) => {
  if (!state.x32?.connected || !state.busNumber) {
    return sendError(res, 409, "Connect to an X32 and select its stream bus first.");
  }

  const setting = req.body || {};
  const validRatio = [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5];
  const valid =
    (setting.control === "eq-enabled" && typeof setting.enabled === "boolean") ||
    (setting.control === "eq-gain" &&
      Number.isInteger(setting.band) && setting.band >= 1 && setting.band <= 6 &&
      typeof setting.gainDb === "number" && Number.isFinite(setting.gainDb) &&
      setting.gainDb >= -6 && setting.gainDb <= 6 && Number.isInteger(setting.gainDb * 4)) ||
    (setting.control === "compressor-enabled" && typeof setting.enabled === "boolean") ||
    (setting.control === "compressor-threshold" &&
      typeof setting.thresholdDb === "number" && Number.isFinite(setting.thresholdDb) &&
      setting.thresholdDb >= -40 && setting.thresholdDb <= 0 && Number.isInteger(setting.thresholdDb * 2)) ||
    (setting.control === "compressor-ratio" && validRatio.includes(setting.ratio));

  if (!valid) {
    return sendError(res, 400, "Processing changes are outside the supported X32 control range.");
  }

  try {
    state.x32.setProcessing(setting);
  } catch (error) {
    return sendError(res, 503, error instanceof Error ? error.message : "Could not send the X32 processing command.");
  }
  return res.json({ accepted: true, status: status() });
});

app.use(express.static(publicDir, { index: false }));
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/bridge-api/")) {
    return res.sendFile(path.join(publicDir, "index.html"), (error) => {
      if (error) next(error);
    });
  }
  return next();
});

async function disconnectDevices() {
  const oldX32 = state.x32;
  const oldAtem = state.atem;
  state.x32 = null;
  state.atem = null;
  await Promise.allSettled([
    oldX32?.disconnect(),
    oldAtem?.disconnect(),
  ]);
}

export async function startBridge() {
  const server = app.listen(port, host);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  process.stdout.write(`Stream Audio Control local bridge listening on http://${host}:${port}\n`);

  let stopPromise;
  async function stop() {
    if (!stopPromise) {
      stopPromise = (async () => {
        await disconnectDevices();
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      })();
    }
    return stopPromise;
  }

  return { server, stop };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bridge = await startBridge();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
