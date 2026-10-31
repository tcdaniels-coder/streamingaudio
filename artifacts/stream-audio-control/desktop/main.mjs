import { app, BrowserWindow, dialog, Menu } from "electron";
import { writeFile } from "node:fs/promises";
import { startBridge } from "../bridge/server.mjs";

const appUrl = "http://127.0.0.1:4179";
const smokeReport = process.argv.find((arg) => arg.startsWith("--desktop-smoke-test="))?.split("=").slice(1).join("=");
let bridge;
let stopping = false;

function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port === "4179";
  } catch {
    return false;
  }
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: "Stream Audio Control",
    backgroundColor: "#e9eef0",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  await window.loadURL(appUrl);
  return window;
}

app.whenReady().then(async () => {
  try {
    bridge = await startBridge();
    Menu.setApplicationMenu(null);
    const window = await createWindow();
    if (smokeReport) {
      const { checkPackagedApp } = await import("./smoke-check.mjs");
      const report = await checkPackagedApp({ app, window, appUrl });
      await bridge.stop();
      bridge = null;
      await writeFile(smokeReport, JSON.stringify(report, null, 2));
      app.exit(0);
    }
  } catch (error) {
    if (smokeReport) {
      await writeFile(smokeReport, JSON.stringify({ ok: false, error: String(error) }));
      await bridge?.stop();
      app.exit(1);
      return;
    }
    dialog.showErrorBox(
      "Stream Audio Control could not start",
      error instanceof Error
        ? `${error.message}\n\nClose another copy of the app and try again.`
        : "The local bridge could not start.",
    );
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (!bridge || stopping) return;
  event.preventDefault();
  stopping = true;
  void bridge.stop().finally(() => {
    bridge = null;
    app.quit();
  });
});
