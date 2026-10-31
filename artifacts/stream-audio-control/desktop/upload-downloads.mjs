import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
if (!bucket) throw new Error("App Storage must be configured before uploading.");
const release = new URL("../release/", import.meta.url);
const builds = [
  ["Stream Audio Control Setup 0.1.0.exe", "Windows 64-bit installer", "Run the installer, then open Stream Audio Control."],
  ["Stream Audio Control-0.1.0-arm64-mac.zip", "Mac — Apple Silicon", "For M-series Macs. Unzip and move Stream Audio Control.app to Applications."],
  ["Stream Audio Control-0.1.0-mac.zip", "Mac — Intel", "For Intel Macs. Unzip and move Stream Audio Control.app to Applications."],
];

async function signedURL(object, method, ttl) {
  const response = await fetch("http://127.0.0.1:1106/object-storage/signed-object-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Storage signing failed: ${response.status}`);
  return (await response.json()).signed_url;
}

const links = [];
for (const [name, label, instructions] of builds) {
  const file = fileURLToPath(new URL(name, release));
  const object = `desktop-releases/0.1.0/${name}`;
  const upload = await signedURL(object, "PUT", 900);
  const response = await fetch(upload, {
    method: "PUT",
    headers: {
      "Content-Type": name.endsWith(".zip") ? "application/zip" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String((await stat(file)).size),
    },
    body: createReadStream(file),
    duplex: "half",
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Upload failed for ${name}: ${response.status}`);
  const url = await signedURL(object, "GET", 604800);
  const check = await fetch(url, { headers: { Range: "bytes=0-0" } });
  if (check.status !== 206) throw new Error(`Download check failed for ${name}: ${check.status}`);
  await check.arrayBuffer();
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  links.push({ name, label, instructions, url, hash: hash.digest("hex") });
  console.log(`Uploaded and checked: ${label}`);
}
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const expires = new Date(Date.now() + 604800000).toISOString().slice(0, 10);
await writeFile(new URL("downloads.html", release), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stream Audio Control downloads</title>
<style>body{font:17px/1.6 system-ui,sans-serif;max-width:800px;margin:50px auto;padding:0 24px;background:#f3f6f7;color:#142d35}h1{line-height:1.2}article{background:white;padding:24px;margin:20px 0;border:1px solid #cbd6da;border-radius:12px}a{display:inline-block;background:#087e85;color:white;padding:10px 18px;border-radius:7px;text-decoration:none;font-weight:650}code{font-size:11px;overflow-wrap:anywhere}small{color:#425963}</style>
<h1>Stream Audio Control</h1><p>Version 0.1.0 · Initial desktop test builds for X32 and ATEM Production Studio 4K.</p>
<p><strong>Before using:</strong> These builds have not been installation- or launch-tested on native Windows/macOS or connected to physical hardware. Do not use them for a live show until you have tested them off-air.</p>
${links.map(({ label, instructions, url, hash }) => `<article><h2>${label}</h2><a href="${escape(url)}">Download ${label}</a><p>${instructions}</p><small>SHA-256<br><code>${hash}</code></small></article>`).join("")}
<h2>Installation notes</h2><p>No Node.js or pnpm installation is needed. Keep your computer, X32 and ATEM on the same local network. Open the app and enter the equipment IP addresses in Setup.</p>
<p>The Windows installer is unsigned. The Mac apps are ad-hoc signed, not Apple Developer ID signed or notarized. Your operating system may block them or require approval. Native signature validation is still pending.</p>
<p>Download links expire ${expires}. The stored builds remain available and links can be renewed.</p></html>`);
console.log("Download page written to release/downloads.html");
