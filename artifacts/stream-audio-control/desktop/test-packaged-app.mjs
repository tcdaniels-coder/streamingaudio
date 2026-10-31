import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, realpath, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const [executable, expectedArch, reportFile] = process.argv.slice(2);
assert.ok(executable && expectedArch && reportFile, "Usage: node test-packaged-app.mjs <executable> <arch> <report.json>");

async function assertPortClosed() {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: 4179 });
    socket.setTimeout(2000);
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("Port 4179 is unexpectedly in use"));
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Timed out checking bridge shutdown"));
    });
    socket.once("error", (error) => error.code === "ECONNREFUSED" ? resolve() : reject(error));
  });
}

await assertPortClosed();
await rm(reportFile, { force: true });
const env = { ...process.env, BRIDGE_PORT: "4179" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
delete env.NODE_PATH;
const child = spawn(executable, [`--desktop-smoke-test=${path.resolve(reportFile)}`], {
  stdio: "inherit",
  // The installed app must not depend on the repository as its working directory.
  cwd: path.dirname(reportFile),
  env,
});
const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
try {
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() :
      reject(new Error(`Packaged app failed: exit=${code}, signal=${signal}`)));
  });
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  assert.equal(report.ok, true, report.error);
  assert.equal(report.packaged, true);
  assert.equal(report.arch, expectedArch);
  // macOS resolves /var to /private/var when reporting process.execPath.
  assert.equal(await realpath(report.executable), await realpath(executable));
  await assertPortClosed();
  console.log(`PASS: installed ${report.platform}/${report.arch} app, renderer, packaged bridge, and shutdown`);
} finally {
  clearTimeout(timer);
  if (child.exitCode === null) child.kill("SIGKILL");
}
