import assert from "node:assert/strict";

// Read-only checks: never discover, connect to, or send commands to show hardware.
export async function checkPackagedApp({ app, window, appUrl }) {
  assert.equal(app.isPackaged, true, "Smoke tests must run the packaged app");
  assert.equal(window.webContents.getURL(), appUrl + "/");
  const response = await fetch(`${appUrl}/bridge-api/status`);
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.mode, "local");
  assert.equal(status.x32.connected, false);
  assert.equal(status.atem.connected, false);
  assert.equal(status.streamBus.busNumber, null);

  const page = await fetch(appUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)];
  assert.ok(assets.some(([, url]) => url.endsWith(".js")), "Missing bundled JavaScript");
  for (const [, url] of assets) {
    const asset = await fetch(new URL(url, appUrl));
    assert.equal(asset.status, 200, `Missing packaged asset: ${url}`);
    assert.match(asset.headers.get("content-type"), /\.(?:js)$/.test(url) ? /javascript/ : /text\/css/);
  }

  let renderer;
  for (let attempt = 0; attempt < 100; attempt++) {
    renderer = await window.webContents.executeJavaScript(`({
      text: document.querySelector("#root")?.innerText || "",
      title: document.title
    })`);
    if (renderer.text.trim().length > 40 && window.isVisible()) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(renderer.text.trim().length > 40, "Packaged React console did not render");
  assert.match(renderer.text, /Live console/, "Expected console screen did not render");
  assert.doesNotMatch(renderer.text, /Something went wrong/, "Renderer displayed its error boundary");
  assert.equal(window.isVisible(), true, "Desktop window was not shown");
  return {
    ok: true,
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    executable: process.execPath,
    resources: process.resourcesPath,
    status,
    renderer,
  };
}
