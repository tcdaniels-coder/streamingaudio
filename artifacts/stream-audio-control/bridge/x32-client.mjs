import osc from "osc";
import {
  dbToX32Fader,
  dbToX32Value,
  padBus,
  readOscNumber,
  X32_COMPRESSOR_RATIOS,
  x32FaderToDb,
  x32ValueToDb,
} from "./osc-utils.mjs";

const X32_PORT = 10023;
const STALE_AFTER_MS = 8000;

export class X32Client {
  constructor(address, busNumber) {
    this.address = address;
    this.busNumber = busNumber;
    this.model = null;
    this.levelDb = null;
    this.mute = null;
    this.lastSeenAt = 0;
    this.port = null;
    this.pollTimer = null;
    this.infoTimer = null;
    this.connecting = null;
    this.closed = false;
    this.busPath = `/bus/${padBus(busNumber)}/mix`;
    this.processingPath = `/bus/${padBus(busNumber)}`;
    this.processing = {
      eq: {
        enabled: null,
        bands: Array.from({ length: 6 }, (_, index) => ({ band: index + 1, gainDb: null })),
      },
      compressor: { enabled: null, thresholdDb: null, ratio: null },
    };
  }

  get connected() {
    return this.lastSeenAt > 0 && Date.now() - this.lastSeenAt < STALE_AFTER_MS;
  }

  get status() {
    return {
      connected: this.connected,
      address: this.address,
      model: this.connected ? this.model : null,
    };
  }

  async connect(timeoutMs = 3000) {
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const udp = new osc.UDPPort({
        localAddress: "0.0.0.0",
        localPort: 0,
        remoteAddress: this.address,
        remotePort: X32_PORT,
        metadata: true,
      });
      this.port = udp;

      const timeout = setTimeout(() => {
        reject(new Error("No X32 OSC response. Check its address, network, and OSC control settings."));
      }, timeoutMs);

      udp.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      udp.on("message", (message) => {
        this.handleMessage(message);
        if (message?.address === "/info" && this.connected) {
          clearTimeout(timeout);
          resolve();
        }
      });

      udp.on("ready", () => {
        udp.send({ address: "/info", args: [] });
      });

      udp.open();
    }).then(() => {
      this.pollTimer = setInterval(() => this.queryBus(), 2000);
      this.infoTimer = setInterval(() => this.send({ address: "/info", args: [] }), 5000);
      this.queryBus();
    }).catch(async (error) => {
      await this.disconnect();
      throw error;
    }).finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  handleMessage(message) {
    if (!message || typeof message.address !== "string") return;
    this.lastSeenAt = Date.now();

    if (message.address === "/info") {
      const values = (message.args || []).map((arg) =>
        typeof arg === "object" && arg !== null && "value" in arg ? arg.value : arg
      );
      const identified = values.find((value) =>
        typeof value === "string" && /^(X32|M32)/i.test(value)
      );
      this.model = typeof identified === "string" ? identified : "Behringer X32 family";
      return;
    }

    if (message.address === `${this.busPath}/fader`) {
      this.levelDb = x32FaderToDb(readOscNumber(message.args));
    }
    if (message.address === `${this.busPath}/on`) {
      const value = readOscNumber(message.args);
      if (value !== null) this.mute = value === 0;
    }

    if (message.address === `${this.processingPath}/eq/on`) {
      const value = readOscNumber(message.args);
      if (value !== null) this.processing.eq.enabled = value !== 0;
    }
    if (message.address === `${this.processingPath}/dyn/on`) {
      const value = readOscNumber(message.args);
      if (value !== null) this.processing.compressor.enabled = value !== 0;
    }
    if (message.address === `${this.processingPath}/dyn/thr`) {
      const value = readOscNumber(message.args);
      if (value !== null) this.processing.compressor.thresholdDb = x32ValueToDb(value, -60, 0);
    }
    if (message.address === `${this.processingPath}/dyn/ratio`) {
      const value = readOscNumber(message.args);
      if (value !== null) this.processing.compressor.ratio = X32_COMPRESSOR_RATIOS[Math.round(value)] ?? null;
    }

    const eqGainMatch = message.address.match(new RegExp(`^${this.processingPath}/eq/([1-6])/g$`));
    if (eqGainMatch) {
      const value = readOscNumber(message.args);
      if (value !== null) {
        const bandNumber = Number(eqGainMatch[1]);
        this.processing.eq.bands[bandNumber - 1].gainDb = x32ValueToDb(value, -15, 15);
      }
    }
  }

  send(message) {
    if (!this.port || this.closed) throw new Error("X32 OSC connection is not open.");
    this.port.send(message);
  }

  queryBus() {
    if (!this.port || this.closed) return;
    this.send({ address: `${this.busPath}/fader`, args: [] });
    this.send({ address: `${this.busPath}/on`, args: [] });
    this.send({ address: `${this.processingPath}/eq/on`, args: [] });
    this.send({ address: `${this.processingPath}/dyn/on`, args: [] });
    this.send({ address: `${this.processingPath}/dyn/thr`, args: [] });
    this.send({ address: `${this.processingPath}/dyn/ratio`, args: [] });
    for (let band = 1; band <= 6; band += 1) {
      this.send({ address: `${this.processingPath}/eq/${band}/g`, args: [] });
    }
  }

  setLevel(db) {
    this.send({
      address: `${this.busPath}/fader`,
      args: [{ type: "f", value: dbToX32Fader(db) }],
    });
    setTimeout(() => this.queryBus(), 150);
  }

  setMute(mute) {
    this.send({
      address: `${this.busPath}/on`,
      args: [{ type: "i", value: mute ? 0 : 1 }],
    });
    setTimeout(() => this.queryBus(), 150);
  }

  setProcessing(setting) {
    let message;
    switch (setting.control) {
      case "eq-enabled":
        message = {
          address: `${this.processingPath}/eq/on`,
          args: [{ type: "i", value: setting.enabled ? 1 : 0 }],
        };
        break;
      case "eq-gain":
        message = {
          address: `${this.processingPath}/eq/${setting.band}/g`,
          args: [{ type: "f", value: dbToX32Value(setting.gainDb, -15, 15) }],
        };
        break;
      case "compressor-enabled":
        message = {
          address: `${this.processingPath}/dyn/on`,
          args: [{ type: "i", value: setting.enabled ? 1 : 0 }],
        };
        break;
      case "compressor-threshold":
        message = {
          address: `${this.processingPath}/dyn/thr`,
          args: [{ type: "f", value: dbToX32Value(setting.thresholdDb, -60, 0) }],
        };
        break;
      case "compressor-ratio": {
        const ratioIndex = X32_COMPRESSOR_RATIOS.indexOf(setting.ratio);
        if (ratioIndex < 0) throw new RangeError("Unsupported X32 compressor ratio.");
        message = {
          address: `${this.processingPath}/dyn/ratio`,
          args: [{ type: "i", value: ratioIndex }],
        };
        break;
      }
      default:
        throw new Error("Unsupported X32 processing control.");
    }

    this.send(message);
    setTimeout(() => this.queryBus(), 150);
  }

  async disconnect() {
    this.closed = true;
    clearInterval(this.pollTimer);
    clearInterval(this.infoTimer);
    if (this.port) {
      try {
        this.port.close();
      } catch {
        // Socket may already have closed after a network interruption.
      }
    }
    this.port = null;
    this.lastSeenAt = 0;
  }
}
