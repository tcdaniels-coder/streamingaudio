import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { checkPackagedApp } from "./smoke-check.mjs";

// Exercise the same assertions used by the packaged Electron app, without
// pretending Linux mocks establish Windows/macOS compatibility.
test("packaged app smoke assertions", async (t) => {
  let badStatus = false;
  let missingAsset = false;
  const server = createServer((req, res) => {
    if (req.url === "/bridge-api/status") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        mode: badStatus ? "demo" : "local",
        x32: { connected: false }, atem: { connected: false },
        streamBus: { busNumber: null },
      }));
    } else if (req.url === "/assets/app.js") {
      res.writeHead(missingAsset ? 404 : 200, { "Content-Type": "text/javascript" });
      res.end("console.log('bundle')");
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end('<html><script src="/assets/app.js"></script><div id="root"></div></html>');
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const appUrl = `http://127.0.0.1:${server.address().port}`;
  const app = { isPackaged: true };
  let text = "Live console. X32 and ATEM disconnected. Stream bus awaits setup.";
  const window = {
    isVisible: () => true,
    webContents: {
      getURL: () => appUrl + "/",
      executeJavaScript: async () => ({ text, title: "Stream Audio Control" }),
    },
  };
  try {
    await t.test("valid packaged bridge and console pass", async () => {
      assert.equal((await checkPackagedApp({ app, window, appUrl })).ok, true);
    });
    await t.test("unpackaged development launch fails", async () => {
      await assert.rejects(checkPackagedApp({ app: { isPackaged: false }, window, appUrl }), /packaged/);
    });
    await t.test("demo bridge fails", async () => {
      badStatus = true;
      await assert.rejects(checkPackagedApp({ app, window, appUrl }));
      badStatus = false;
    });
    await t.test("missing packaged JavaScript fails", async () => {
      missingAsset = true;
      await assert.rejects(checkPackagedApp({ app, window, appUrl }), /Missing packaged asset/);
      missingAsset = false;
    });
    await t.test("renderer error page fails", async () => {
      text = "Something went wrong. This part of the app hit an error. Try again.";
      await assert.rejects(checkPackagedApp({ app, window, appUrl }), /console screen/);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
