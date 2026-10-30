import { Atem } from "atem-connection";

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("ATEM connection timed out. Check its address and network.")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export class AtemClient {
  constructor(address) {
    this.address = address;
    this.model = null;
    this.connected = false;
    this.client = new Atem();
    this.client.on("connected", () => {
      this.connected = true;
      this.updateModel();
    });
    this.client.on("disconnected", () => {
      this.connected = false;
    });
    this.client.on("stateChanged", () => this.updateModel());
    this.client.on("error", () => {
      this.connected = false;
    });
  }

  updateModel() {
    const info = this.client.state?.info;
    this.model = info?.productIdentifier || (info?.model !== undefined ? `ATEM model ${info.model}` : this.model);
  }

  get status() {
    return {
      connected: this.connected,
      address: this.address,
      model: this.connected ? this.model : null,
    };
  }

  async connect(timeoutMs = 10000) {
    const connected = new Promise((resolve) => {
      this.client.once("connected", resolve);
    });
    await withTimeout(Promise.all([this.client.connect(this.address), connected]), timeoutMs);
  }

  async disconnect() {
    this.connected = false;
    await this.client.disconnect().catch(() => {});
  }
}
